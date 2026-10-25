// Rend l'encart « Chances de tirage » (composition d'un booster, chances de la carte Premium, part de chaque rareté) sans navigateur.
//   node tests/odds-view.test.mjs
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-odds-'))
await build({
  stdin: { contents: "export { OddsBody, fmtOdds } from './src/components/Odds.jsx'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', '@supabase/supabase-js'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { OddsBody, fmtOdds } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }

const COLORS = { common: '#d9d4c5', peu_commune: '#aaaaaa', rare: '#0a0', super: '#00f', ultra: '#f04', artrare: '#fc0', omega: '#cbd5e1', alpha: '#d4a017', unique: '#7c3aed' }
const rar = (id, name, kind = 'range') => [id, { id, name, kind, color: COLORS[id], color2: '#bbbbbb', text_color: '#222' }]
const rarityMap = Object.fromEntries([rar('common', 'Commune'), rar('peu_commune', 'Peu Commune'), rar('rare', 'Rare'), rar('super', 'Super Rare'), rar('ultra', 'Ultra Rare'),
  rar('artrare', 'Art Rare'), rar('omega', 'Omega', 'omega'), rar('alpha', 'Alpha', 'alpha'), rar('unique', 'Unique', 'unique')])
const by_rarity = [
  { id: 'unique', remaining: 256, total: 256, share: 0.0004, per_booster: 0.0021 }, { id: 'alpha', remaining: 2169, total: 2170, share: 0.0001, per_booster: 0.0006 },
  { id: 'omega', remaining: 2170, total: 2170, share: 0.0001, per_booster: 0.0005 }, { id: 'artrare', remaining: 56479, total: 56480, share: 0.0016, per_booster: 0.008 },
  { id: 'ultra', remaining: 988978, total: 989000, share: 0.01, per_booster: 0.05 }, { id: 'super', remaining: 1311500, total: 1311560, share: 0.0579, per_booster: 0.29 },
  { id: 'rare', remaining: 2000000, total: 2000000, share: 0.11, per_booster: 0.55 }, { id: 'peu_commune', remaining: 3000000, total: 3000000, share: 0.22, per_booster: 0.9 },
  { id: 'common', remaining: 4000000, total: 4000000, share: 0.6, per_booster: 1 },
]
const slot_mix = {
  common: [{ id: 'common', p: 0.9997 }, { id: 'unique', p: 0.0002 }, { id: 'alpha', p: 0.00005 }, { id: 'omega', p: 0.00005 }],
  uncommon: [{ id: 'peu_commune', p: 0.9996 }, { id: 'unique', p: 0.0002 }, { id: 'alpha', p: 0.0001 }, { id: 'omega', p: 0.0001 }],
  premium: [{ id: 'rare', p: 0.55 }, { id: 'super', p: 0.29 }, { id: 'peu_commune', p: 0.0998 }, { id: 'ultra', p: 0.05 }, { id: 'artrare', p: 0.008 }, { id: 'unique', p: 0.002 }],
}
// serveur récent : une répartition par carte du booster
const positions = [1, 2, 3].map((n) => ({ n, mix: slot_mix.common })).concat([{ n: 4, mix: slot_mix.uncommon }, { n: 5, mix: slot_mix.premium }])
const gold = { chance: 0.00000001, name: 'Gold' }   // booster Gold tiré au hasard
const data = { category_id: 1, exponent: 0, cards_per_booster: 5, pool_left: 11876561, booster: { id: 1, name: 'Standard', cards: 5, is_standard: true }, positions, by_rarity, gold }
const render = (d, props = {}) => renderToStaticMarkup(React.createElement(OddsBody, { data: d, category: { name: 'Chat’trapez les tous !' }, rarityMap, ...props }))
const html = render(data)
// une ligne par carte : ['Carte 1', 'Commune 100 %'] (étiquettes « Rare 55 % » séparées par « · »)
const chipText = (h) => [...h.matchAll(/<span class="odds-chip[^"]*"[^>]*>([^<]*?)(?:<strong>([^<]*)<\/strong>)?<\/span>/g)].map((c) => (c[2] ? `${c[1].trim()} ${c[2]}` : c[1].trim()))
const rowsOf = (h) => [...h.matchAll(/<li class="odds-card-row">([\s\S]*?)<\/li>/g)].map((m) => [(m[1].match(/<span class="sr-only">(Carte \d+) : <\/span>/) || [])[1], chipText(m[1]).join(' · ')])
const lines = rowsOf(html)
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

ok('pourcentages lisibles : 100 %, 99,9 %, 55 %, 5,8 %, 0,8 %, 0,2 %, 0,04 %, 0,004 %', fmtOdds(1) === '100 %' && fmtOdds(0.9997) === '100 %' && fmtOdds(0.999) === '99,9 %' && fmtOdds(0.55) === '55 %' && fmtOdds(0.058) === '5,8 %' && fmtOdds(0.008) === '0,8 %' && fmtOdds(0.002) === '0,2 %' && fmtOdds(0.0004) === '0,04 %' && fmtOdds(0.00004) === '0,004 %')
ok('une ligne par carte du booster, dans l\'ordre : Carte 1, 2, 3, 4, 5', lines.map((l) => l[0]).join('|') === 'Carte 1|Carte 2|Carte 3|Carte 4|Carte 5')
ok('cartes 1 à 3 : « Commune 100 % » ; carte 4 : « Peu Commune 100 % »', [0, 1, 2].every((i) => lines[i][1] === 'Commune 100 %') && lines[3][1] === 'Peu Commune 100 %')
ok('carte 5 : chaque rareté avec sa chance réelle, de la plus à la moins probable', lines[4][1] === 'Rare 55 % · Super Rare 29 % · Peu Commune 10 % · Ultra Rare 5 % · Art Rare 0,8 % · Unique 0,2 %')
ok('les raretés sous 0,1 % ne chargent pas les lignes des Communes (Alpha, Omega, Unique y sont dans la ligne « Par booster »)', !/Alpha|Omega|Unique/.test(lines[0][1] + lines[3][1]))
const specialsOf = (h) => chipText((h.match(/<div class="odds-special">[\s\S]*?<\/div>/) || [''])[0]).join(' · ')
ok('cartes spéciales : chance d\'en avoir au moins une par booster (Unique, Alpha, Omega), en pastilles', specialsOf(html) === 'Unique 0,21 % · Alpha 0,06 % · Omega 0,05 %' && /<span class="odds-special-label">Par booster<\/span>/.test(html))
ok('une rareté spéciale épuisée n\'est pas annoncée (Alpha à 0 restante : « Unique 0,21 % · Omega 0,05 % »)', specialsOf(render({ ...data, by_rarity: by_rarity.map((r) => (r.id === 'alpha' ? { ...r, remaining: 0 } : r)) })) === 'Unique 0,21 % · Omega 0,05 %')
ok('le stock restant est indiqué en une ligne et un bouton « i » ouvre le détail', /11 876 561 cartes encore disponibles/.test(text(html).replace(/\u202f|\u00a0/g, ' ')) && /class="info-btn"/.test(html))
ok('encart concis : plus de liste de stock par rareté, ni de long texte, tant que le détail est fermé', !/restantes sur|chaque carte restante|Booster Gold/.test(html) && text(html).length < 520)
const detail = render(data, { initialInfo: true })
ok('détail (bouton « i ») : parts par rareté avec stock, règle, booster Gold tiré au hasard', /role="dialog"[^>]*aria-label="Chances de tirage"/.test(detail) && /restantes sur/.test(detail) && (detail.match(/class="odds-name"/g) || []).length === 9 && /chaque carte restante a la même chance/.test(detail) && /Booster Gold : 0,000001 % de chances par booster ouvert, avec son propre contenu/.test(detail) && !/Unique \(1\/1\)|il contient/.test(detail))
ok('détail : pas de booster Gold tiré au hasard annoncé quand sa chance est nulle', !/Booster Gold/.test(render({ ...data, gold: { chance: 0, name: 'Gold' } }, { initialInfo: true })))
ok('exposant différent de 0 : la mention des petites séries (dans le détail)', /petites séries ont moins de chances/.test(render({ ...data, exponent: 1 }, { initialInfo: true })))
const four = render({ ...data, cards_per_booster: 4, positions: [1, 2, 3].map((n) => ({ n, mix: slot_mix.common })).concat([{ n: 4, mix: slot_mix.premium }]) })
ok('booster à 4 cartes : 4 lignes, la dernière suit sa propre répartition', rowsOf(four).length === 4 && rowsOf(four)[3][1].startsWith('Rare 55 %') && !/Carte 5/.test(four))
ok('un booster de 10 cartes : 10 lignes', rowsOf(render({ ...data, cards_per_booster: 10, positions: Array.from({ length: 10 }, (_, i) => ({ n: i + 1, mix: slot_mix.common })) })).length === 10)
ok('une carte sans rareté possible : tirée au hasard parmi les cartes restantes', rowsOf(render({ ...data, positions: data.positions.map((p) => (p.n === 4 ? { n: 4, mix: [] } : p)) }))[3][1] === 'Au hasard parmi les cartes restantes')
ok('chances d\'un autre booster (Silver) : la fenêtre « compact » n\'affiche que les lignes par carte', (() => { const h = render({ ...data, booster: { id: 2, name: 'Silver', cards: 5, is_standard: false }, gold: null }, { compact: true }); return rowsOf(h).length === 5 && !/cartes encore disponibles/.test(h) && !/info-btn/.test(h) && !/Booster doré/.test(render({ ...data, golden: null }, { initialInfo: true })) })())
ok('serveur de la version précédente (slot_mix par type d\'emplacement) : les lignes restent affichées', (() => { const { positions: _p, ...old } = data; const h = render({ ...old, slots: { common: 3, uncommon: 1, premium: 1 }, slot_mix }); return rowsOf(h).length === 5 && rowsOf(h)[0][1] === 'Commune 100 %' && rowsOf(h)[4][1].startsWith('Rare 55 %') })())
ok('serveur de deux versions avant (slot_options seulement) : les lignes restent affichées', (() => { const { positions: _p, ...old } = data; const h = render({ ...old, slots: { common: 3, uncommon: 1, premium: 1 }, slot_options: { common: [{ id: 'common', p: 1 }], uncommon: [{ id: 'peu_commune', p: 1 }], premium: [{ id: 'rare', p: 0.6 }, { id: 'super', p: 0.4 }] } }); return rowsOf(h)[0][1] === 'Commune 100 %' && rowsOf(h)[4][1] === 'Rare 60 % · Super Rare 40 %' })())
ok('tout premier serveur (sans emplacements ni positions) : pas de lignes, pas de plantage', (() => { const { positions: _p, ...old } = data; const h = render(old); return !/odds-cards/.test(h) && /cartes encore disponibles/.test(h) })())
const tintOf = (h, label) => (h.match(new RegExp(`<span class="odds-chip" style="([^"]*)">${label} `)) || [])[1] || ''
ok('chaque pastille porte les couleurs de sa rareté (fond, dégradé, couleur du texte comme sur les cartes)', /--r1:#d9d4c5/.test(tintOf(html, 'Commune')) && /--r1:#0a0/.test(tintOf(html, 'Rare')) && /--r1:#00f/.test(tintOf(html, 'Super Rare')) && /--rt:#222/.test(tintOf(html, 'Commune')))
ok('la mini-carte de chaque ligne prend la couleur de la rareté dominante et affiche son numéro', (() => { const minis = [...html.matchAll(/<span class="odds-mini" style="([^"]*)" aria-hidden="true">(\d+)<\/span>/g)]; return minis.length === 5 && minis.map((m) => m[2]).join() === '1,2,3,4,5' && /--r1:#d9d4c5/.test(minis[0][1]) && /--r1:#0a0/.test(minis[4][1]) })())
ok('une barre proportionnelle seulement quand une carte a plusieurs possibilités (cartes 3 : 1 segment par rareté)', (html.match(/class="odds-bar"/g) || []).length === 1 && (html.match(/<i style="[^"]*flex:/g) || []).length === 6 && !/odds-bar/.test(render({ ...data, positions: [{ n: 1, mix: slot_mix.common }] })))
ok('largeur des segments proportionnelle aux chances (carte 5 : Rare 0,55 pour 0,29 de Super Rare)', /--r1:#0a0[^"]*flex:0\.55 1 0/.test(html) && /--r1:#00f[^"]*flex:0\.29 1 0/.test(html))
ok('accessibilité : « Carte N : » est lu aux lecteurs d\'écran, les mini-cartes et les barres sont décoratives', (html.match(/class="sr-only">Carte \d : </g) || []).length === 5 && !/aria-hidden="true">Carte/.test(html))
ok('une rareté inconnue du catalogue : couleurs de repli, pas de plantage', (() => { const h = render({ ...data, positions: [{ n: 1, mix: [{ id: 'mystere', p: 1 }] }] }); return /<span class="odds-chip" style="--r1:#d9d4c5/.test(h) && /mystere/.test(h) && !/undefined/.test(h) })())
ok('aucune donnée parasite (undefined, NaN)', !/undefined|NaN|null/.test(html + detail))

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nChances de tirage (rendu) : tous les contrôles sont passés.')

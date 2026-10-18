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

const rar = (id, name, kind = 'range') => [id, { id, name, kind, color: '#ddd', color2: '#bbb' }]
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
const golden = { chance: 0.00000001, unique_chance: 0.005, contents: [{ rarity_id: 'alpha', quantity: 1 }] }
const data = { category_id: 1, exponent: 0, cards_per_booster: 5, pool_left: 11876561, booster: { id: 1, name: 'Standard', cards: 5, is_standard: true }, positions, by_rarity, golden }
const render = (d, props = {}) => renderToStaticMarkup(React.createElement(OddsBody, { data: d, category: { name: 'Chat’trapez les tous !' }, rarityMap, ...props }))
const html = render(data)
const lines = [...((html.match(/<ul class="odds-slots"[\s\S]*?<\/ul>/) || [''])[0]).matchAll(/<li><strong>([^<]*)<\/strong><span>([^<]*)<\/span><\/li>/g)].map((m) => [m[1], m[2]])
const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

ok('pourcentages lisibles : 100 %, 99,9 %, 55 %, 5,8 %, 0,8 %, 0,2 %, 0,04 %, 0,004 %', fmtOdds(1) === '100 %' && fmtOdds(0.9997) === '100 %' && fmtOdds(0.999) === '99,9 %' && fmtOdds(0.55) === '55 %' && fmtOdds(0.058) === '5,8 %' && fmtOdds(0.008) === '0,8 %' && fmtOdds(0.002) === '0,2 %' && fmtOdds(0.0004) === '0,04 %' && fmtOdds(0.00004) === '0,004 %')
ok('une ligne par carte du booster, dans l\'ordre : Carte 1, 2, 3, 4, 5', lines.map((l) => l[0]).join('|') === 'Carte 1|Carte 2|Carte 3|Carte 4|Carte 5')
ok('cartes 1 à 3 : « Commune 100 % » ; carte 4 : « Peu Commune 100 % »', [0, 1, 2].every((i) => lines[i][1] === 'Commune 100 %') && lines[3][1] === 'Peu Commune 100 %')
ok('carte 5 : chaque rareté avec sa chance réelle, de la plus à la moins probable', lines[4][1] === 'Rare 55 % · Super Rare 29 % · Peu Commune 10 % · Ultra Rare 5 % · Art Rare 0,8 % · Unique 0,2 %')
ok('les raretés sous 0,1 % ne chargent pas les lignes des Communes (Alpha, Omega, Unique y sont dans la ligne « Par booster »)', !/Alpha|Omega|Unique/.test(lines[0][1] + lines[3][1]))
ok('cartes spéciales : chance d\'en avoir au moins une par booster (Unique, Alpha, Omega)', /<strong>Par booster<\/strong> : Unique 0,21 % · Alpha 0,06 % · Omega 0,05 %/.test(html))
ok('une rareté spéciale épuisée n\'est pas annoncée (Alpha à 0 restante : « Unique 0,21 % · Omega 0,05 % »)', (() => { const h = render({ ...data, by_rarity: by_rarity.map((r) => (r.id === 'alpha' ? { ...r, remaining: 0 } : r)) }); return (h.match(/<strong>Par booster<\/strong> : ([^<]*)<\/p>/) || [])[1] === 'Unique 0,21 % · Omega 0,05 %' })())
ok('le stock restant est indiqué en une ligne et un bouton « i » ouvre le détail', /11 876 561 cartes encore disponibles/.test(text(html).replace(/\u202f|\u00a0/g, ' ')) && /class="info-btn"/.test(html))
ok('encart concis : plus de liste de stock par rareté, ni de long texte, tant que le détail est fermé', !/restantes sur|chaque carte restante|Booster doré/.test(html) && text(html).length < 520)
const detail = render(data, { initialInfo: true })
ok('détail (bouton « i ») : parts par rareté avec stock, règle, booster doré', /role="dialog"[^>]*aria-label="Chances de tirage"/.test(detail) && /restantes sur/.test(detail) && (detail.match(/class="odds-name"/g) || []).length === 9 && /chaque carte restante a la même chance/.test(detail) && /Booster doré : 0,000001 % par booster, il contient 1 Alpha/.test(detail))
ok('détail : pas de booster doré annoncé quand il est désactivé', !/Booster doré/.test(render({ ...data, golden: { chance: 0, unique_chance: 0, contents: [] } }, { initialInfo: true })))
ok('exposant différent de 0 : la mention des petites séries (dans le détail)', /petites séries ont moins de chances/.test(render({ ...data, exponent: 1 }, { initialInfo: true })))
const four = render({ ...data, cards_per_booster: 4, positions: [1, 2, 3].map((n) => ({ n, mix: slot_mix.common })).concat([{ n: 4, mix: slot_mix.premium }]) })
ok('booster à 4 cartes : 4 lignes, la dernière suit sa propre répartition', (four.match(/<li><strong>Carte/g) || []).length === 4 && /<strong>Carte 4<\/strong><span>Rare 55 %/.test(four) && !/Carte 5/.test(four))
ok('un booster de 10 cartes : 10 lignes', (render({ ...data, cards_per_booster: 10, positions: Array.from({ length: 10 }, (_, i) => ({ n: i + 1, mix: slot_mix.common })) }).match(/<li><strong>Carte/g) || []).length === 10)
ok('une carte sans rareté possible : tirée au hasard parmi les cartes restantes', /<strong>Carte 4<\/strong><span>au hasard parmi les cartes restantes/.test(render({ ...data, positions: data.positions.map((p) => (p.n === 4 ? { n: 4, mix: [] } : p)) })))
ok('chances d\'un autre booster (Silver) : la fenêtre « compact » n\'affiche que les lignes par carte', (() => { const h = render({ ...data, booster: { id: 2, name: 'Silver', cards: 5, is_standard: false }, golden: null }, { compact: true }); return /<strong>Carte 5<\/strong>/.test(h) && !/cartes encore disponibles/.test(h) && !/info-btn/.test(h) && !/Booster doré/.test(render({ ...data, golden: null }, { initialInfo: true })) })())
ok('serveur de la version précédente (slot_mix par type d\'emplacement) : les lignes restent affichées', (() => { const { positions: _p, ...old } = data; const h = render({ ...old, slots: { common: 3, uncommon: 1, premium: 1 }, slot_mix }); return (h.match(/<li><strong>Carte/g) || []).length === 5 && /<strong>Carte 1<\/strong><span>Commune 100 %/.test(h) && /<strong>Carte 5<\/strong><span>Rare 55 %/.test(h) })())
ok('serveur de deux versions avant (slot_options seulement) : les lignes restent affichées', (() => { const { positions: _p, ...old } = data; const h = render({ ...old, slots: { common: 3, uncommon: 1, premium: 1 }, slot_options: { common: [{ id: 'common', p: 1 }], uncommon: [{ id: 'peu_commune', p: 1 }], premium: [{ id: 'rare', p: 0.6 }, { id: 'super', p: 0.4 }] } }); return /<strong>Carte 1<\/strong><span>Commune 100 %/.test(h) && /<strong>Carte 5<\/strong><span>Rare 60 % · Super Rare 40 %/.test(h) })())
ok('tout premier serveur (sans emplacements ni positions) : pas de lignes, pas de plantage', (() => { const { positions: _p, ...old } = data; const h = render(old); return !/odds-slots/.test(h) && /cartes encore disponibles/.test(h) })())
ok('aucune donnée parasite (undefined, NaN)', !/undefined|NaN|null/.test(html + detail))

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nChances de tirage (rendu) : tous les contrôles sont passés.')

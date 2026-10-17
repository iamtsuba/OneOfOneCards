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
  stdin: { contents: "export { OddsBody } from './src/components/Odds.jsx'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', '@supabase/supabase-js'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { OddsBody } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }

const rar = (id, name, color) => [id, { id, name, color, color2: color }]
const rarityMap = Object.fromEntries([rar('common', 'Commune', '#ddd'), rar('peu_commune', 'Peu commune', '#bbb'), rar('rare', 'Rare', '#0a0'), rar('super', 'Super Rare', '#00f'),
  rar('ultra', 'Ultra Rare', '#f04'), rar('artrare', 'Art Rare', '#fc0'), rar('alpha', 'Alpha', '#fc0'), rar('unique', 'Unique', '#80f')])
const by_rarity = [
  { id: 'unique', remaining: 32, total: 32, share: 0.0006, per_booster: 0.003 }, { id: 'alpha', remaining: 0, total: 70, share: 0, per_booster: 0 },
  { id: 'artrare', remaining: 400, total: 400, share: 0.004, per_booster: 0.02 }, { id: 'ultra', remaining: 4488, total: 4488, share: 0.008, per_booster: 0.04 },
  { id: 'super', remaining: 38808, total: 38808, share: 0.022, per_booster: 0.11 }, { id: 'rare', remaining: 247008, total: 247008, share: 0.06, per_booster: 0.3 },
  { id: 'peu_commune', remaining: 90000, total: 90000, share: 0.3, per_booster: 0.9 }, { id: 'common', remaining: 994008, total: 994008, share: 0.6, per_booster: 1 },
]
const slot_options = {
  common: [{ id: 'common', p: 1 }], uncommon: [{ id: 'peu_commune', p: 1 }],
  premium: [{ id: 'peu_commune', p: 0.5 }, { id: 'rare', p: 0.3 }, { id: 'super', p: 0.11 }, { id: 'ultra', p: 0.04 }, { id: 'unique', p: 0.03 }, { id: 'artrare', p: 0.02 }],
}
const data = { category_id: 1, exponent: 0, cards_per_booster: 5, pool_left: 1298440, slots: { common: 3, uncommon: 1, premium: 1 }, slot_options, by_rarity,
  golden: { chance: 0.00000001, unique_chance: 0.005, contents: [{ rarity_id: 'alpha', quantity: 1 }] } }
const render = (d) => renderToStaticMarkup(React.createElement(OddsBody, { data: d, category: { name: 'Chattrapez les tous !' }, rarityMap }))
const html = render(data)
const slotsHtml = (html.match(/<ul class="odds-slots"[\s\S]*?<\/ul>/) || [''])[0]
const lines = [...slotsHtml.matchAll(/<li><strong>([^<]*)<\/strong><span>([^<]*)<\/span><\/li>/g)].map((m) => [m[1], m[2]])

ok('composition : une ligne par type d\'emplacement, dans l\'ordre du tirage (cartes 1 à 3, carte 4, carte 5)', lines.map((l) => l[0]).join('|') === 'Cartes 1 à 3|Carte 4|Carte 5')
ok('cartes 1 à 3 : Commune ; carte 4 : Peu commune', lines[0][1] === 'Commune' && lines[1][1] === 'Peu commune')
ok('carte 5 : Peu commune, Rare, Super Rare, Ultra Rare, Unique, Art Rare avec leurs chances, de la plus à la moins probable', lines[2][1] === 'Peu commune 50 % · Rare 30 % · Super Rare 11 % · Ultra Rare 4 % · Unique 3 % · Art Rare 2 %')
ok('les raretés les plus rares ont les chances les plus basses (Art Rare < Ultra Rare < Super Rare < Rare < Peu commune)', slot_options.premium.map((o) => o.p).every((p, i, a) => i === 0 || p <= a[i - 1]) && lines[2][1].indexOf('Art Rare') > lines[2][1].indexOf('Ultra Rare'))
ok('part de chaque rareté : une ligne par rareté avec son pourcentage et ses cartes restantes', (html.match(/class="odds-name"/g) || []).length === 8 && /Commune<\/span><span class="odds-val">60 %/.test(html) && /994 008 cartes restantes sur 994 008/.test(html.replace(/\u202f|\u00a0/g, ' ')))
ok('une rareté épuisée est annoncée « épuisée »', /Alpha<\/span><span class="odds-val">épuisée/.test(html))
ok('texte court : une phrase pour la règle uniforme et le repli (plus de long paragraphe sur les cartes spéciales)', /Dans une rareté, chaque carte restante a la même chance\. Si une rareté est épuisée, la carte est tirée parmi toutes celles qui restent\./.test(html) && !/cartes spéciales/.test(html))
ok('booster doré : conservé, et absent quand il est désactivé', /Booster doré : 0,000001 % par booster, il contient 1 Alpha/.test(html) && /0,50 %/.test(html) && !/Booster doré/.test(render({ ...data, golden: { chance: 0, unique_chance: 0, contents: [] } })))
ok('exposant différent de 0 : la mention des petites séries remplace la règle uniforme', /petites séries ont moins de chances/.test(render({ ...data, exponent: 1 })) && !/chaque carte restante a la même chance/.test(render({ ...data, exponent: 1 })))
const four = render({ ...data, cards_per_booster: 4, slots: { common: 3, uncommon: 0, premium: 1 }, slot_options: { common: slot_options.common, premium: slot_options.premium } })
ok('sans carte 4 : « Cartes 1 à 3 » puis « Carte 4 » (la carte Premium)', /<strong>Cartes 1 à 3<\/strong>/.test(four) && /<strong>Carte 4<\/strong><span>Peu commune 50 %/.test(four) && !/Carte 5/.test(four))
ok('une carte sans raretés possibles : tirée au hasard parmi les cartes restantes', /<strong>Carte 4<\/strong><span>au hasard parmi les cartes restantes/.test(render({ ...data, slot_options: { common: slot_options.common, premium: slot_options.premium } })))
ok('ancien serveur (sans emplacements) : l\'encart reste lisible, sans la composition', (() => { const { slots, slot_options: _o, ...old } = data; const h = render(old); return !/odds-slots/.test(h) && /Part de chaque rareté/.test(h) && (h.match(/class="odds-name"/g) || []).length === 8 })())
ok('aucune donnée parasite (undefined, NaN)', !/undefined|NaN|null/.test(html))

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nChances de tirage (rendu) : tous les contrôles sont passés.')

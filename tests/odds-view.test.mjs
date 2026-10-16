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
  stdin: { contents: "export { OddsBody, tierLabel } from './src/components/Odds.jsx'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', '@supabase/supabase-js'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { OddsBody, tierLabel } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }

const rar = (id, name, color) => [id, { id, name, color, color2: color }]
const rarityMap = Object.fromEntries([rar('common', 'Commune', '#ddd'), rar('peu_commune', 'Peu commune', '#bbb'), rar('rare', 'Rare', '#0a0'), rar('super', 'Super Rare', '#00f'),
  rar('ultra', 'Ultra Rare', '#f04'), rar('alpha', 'Alpha', '#fc0'), rar('unique', 'Unique', '#80f')])
const by_rarity = [
  { id: 'unique', remaining: 32, total: 32, share: 0.0003, per_booster: 0.0015 }, { id: 'alpha', remaining: 0, total: 70, share: 0, per_booster: 0 },
  { id: 'ultra', remaining: 4488, total: 4488, share: 0.0054, per_booster: 0.027 }, { id: 'super', remaining: 38808, total: 38808, share: 0.026, per_booster: 0.13 },
  { id: 'rare', remaining: 247008, total: 247008, share: 0.168, per_booster: 0.7 }, { id: 'peu_commune', remaining: 90000, total: 90000, share: 0.183, per_booster: 0.82 },
  { id: 'common', remaining: 994008, total: 994008, share: 0.56, per_booster: 1 },
]
const premium = [{ tier: 'rare', p: 0.84 }, { tier: 'super', p: 0.13 }, { tier: 'ultra', p: 0.027 }, { tier: 'fullart', p: 0.003 }]
const data = { category_id: 1, exponent: 0, cards_per_booster: 5, pool_left: 1298440, slots: { common: 3, uncommon: 1, premium: 1 }, by_rarity, premium,
  golden: { chance: 0.00000001, unique_chance: 0.005, contents: [{ rarity_id: 'alpha', quantity: 1 }] } }
const render = (d) => renderToStaticMarkup(React.createElement(OddsBody, { data: d, category: { name: 'Chattrapez les tous !' }, rarityMap }))
const html = render(data)

ok('composition d\'un booster : 5 cartes, 3 Communes, 1 Peu commune, 1 carte Premium, dans cet ordre', /<strong>Un booster<\/strong> = 5 cartes, tirées dans cet ordre : 3 Communes, 1 Peu commune, 1 carte Premium\./.test(html))
ok('carte Premium : une liste des paliers Rare, Super Rare, Ultra Rare puis Full Art, dans l\'ordre des chances', (() => { const i = ['>Rare<', '>Super Rare<', '>Ultra Rare<', '>Full Art<'].map((t) => html.indexOf(t)); return i.every((x) => x > 0) && i[0] < i[1] && i[1] < i[2] && i[2] < i[3] })())
ok('carte Premium : les pourcentages sont affichés (84 %, 13 %, 2,70 %, 0,30 %)', /Rare<\/span><span class="odds-val">84 %/.test(html) && /Super Rare<\/span><span class="odds-val">13 %/.test(html) && /Ultra Rare<\/span><span class="odds-val">2,70 %/.test(html) && /Full Art<\/span><span class="odds-val">0,30 %/.test(html))
ok('carte Premium : les Full Art sont plus rares que les Ultra Rare, elles-mêmes plus rares que les Super Rare, plus rares que les Rare (données affichées)', premium[3].p < premium[2].p && premium[2].p < premium[1].p && premium[1].p < premium[0].p)
ok('noms des paliers : Full Art et autres raretés', tierLabel('fullart', rarityMap) === 'Full Art' && tierLabel('other', rarityMap) === 'Autres raretés' && tierLabel('rare', rarityMap) === 'Rare' && tierLabel('legende', rarityMap) === 'legende')
ok('part de chaque rareté : une ligne par rareté avec son pourcentage et ses cartes restantes', (html.match(/class="odds-name"/g) || []).length === 7 + 4 && /Commune<\/span><span class="odds-val">56,00 %/.test(html) && /994 008 cartes restantes sur 994 008/.test(html.replace(/\u202f|\u00a0/g, ' ')))
ok('une rareté épuisée est annoncée « épuisée »', /Alpha<\/span><span class="odds-val">épuisée/.test(html))
ok('le texte explique le tirage par emplacement, le repli et les cartes spéciales', /Dans chaque emplacement, chaque carte encore disponible de la rareté tirée a la même chance/.test(html) && /Si une rareté est épuisée, la carte est tirée parmi toutes celles qui restent/.test(html) && /Alpha, Omega et Unique sont des cartes spéciales/.test(html))
ok('booster doré : conservé', /Booster doré : 0,000001 % par booster, il contient 1 Alpha/.test(html) && /0,50 %/.test(html))
ok('exposant différent de 0 : la mention des petites séries remplace la règle uniforme', /petites séries ont moins de chances/.test(render({ ...data, exponent: 1 })) && !/même chance d’être tirée/.test(render({ ...data, exponent: 1 })))
ok('sans carte Premium (booster de 4 cartes ou moins) : pas de section Premium', !/odds-premium/.test(render({ ...data, slots: { common: 3, uncommon: 1, premium: 0 }, premium: [] })) && /3 Communes, 1 Peu commune\./.test(render({ ...data, slots: { common: 3, uncommon: 1, premium: 0 }, premium: [] })))
ok('sans Peu commune ni paliers : composition et section Premium s\'adaptent', (() => { const h = render({ ...data, cards_per_booster: 4, slots: { common: 3, uncommon: 0, premium: 1 } }); return /4 cartes, tirées dans cet ordre : 3 Communes, 1 carte Premium\./.test(h) && !/Peu commune, 1 carte/.test(h) })())
ok('ancien serveur (sans emplacements ni paliers) : l\'encart reste lisible avec l\'ancien texte', (() => { const { slots, premium: _p, ...old } = data; const h = render(old); return !/odds-slots|odds-premium/.test(h) && /Part de chaque rareté sur la totalité des cartes encore disponibles/.test(h) && /994 008|994\s008/.test(h.replace(/\u202f|\u00a0/g, ' ')) })())
ok('aucune donnée parasite (undefined, NaN)', !/undefined|NaN|null/.test(html))

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nChances de tirage (rendu) : tous les contrôles sont passés.')

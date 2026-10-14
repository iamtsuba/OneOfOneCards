// Rend l'album et ses statistiques avec de vraies données (rendu serveur) : groupement par carte, un emplacement par
// rareté, états rempli / à remplir / manquante, numéro masqué, secret. Sans navigateur ni réseau.
//   node tests/album-view.test.mjs
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
// Le paquet est construit DANS le projet (pour trouver react) et contient aussi GameContext : une seule instance du contexte
const out = mkdtempSync(path.join(root, 'tests', '.out-album-'))
await build({
  stdin: { contents: "export { Album, AlbumStats } from './src/components/Collection.jsx'; export { default as Card } from './src/components/Card.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', '@supabase/supabase-js'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { Album, AlbumStats, Card, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }

const rarityMap = {
  common: { id: 'common', name: 'Commune', kind: 'range', sort_order: 7, color: '#d9d4c5', color2: '#b5ad99', text_color: '#222' },
  ultra: { id: 'ultra', name: 'Ultra Rare', kind: 'range', sort_order: 4, color: '#e11d48', color2: '#9f1239', text_color: '#fff' },
  alpha: { id: 'alpha', name: 'Alpha', kind: 'alpha', sort_order: 2, color: '#f5c542', color2: '#b8860b', text_color: '#222' },
}
const types = [{ id: 1, category_id: 1, name: 'Chat va ?', image: '🐱', position: 1, secret: false }, { id: 2, category_id: 1, name: 'Chat va pas ?', image: '😾', position: 2, secret: false }]
const catalog = {
  typeMap: Object.fromEntries(types.map((t) => [t.id, t])), categoryMap: {}, types, rarities: Object.values(rarityMap),
  numberHidden: (typeId, series) => typeId === 2 && series === 50,   // les séries 50 du type 2 ont leur numéro masqué
  cardRef: () => '', seriesOf: () => 100, checklist: (id) => ({ no: id, total: 2, secret: false }),
}
const wrap = (el) => React.createElement(GameContext.Provider, { value: { catalog, rarityMap, rarities: Object.values(rarityMap) } }, el)

// Type 1 : Commune remplie (07/10), Ultra Rare à remplir (2 exemplaires), Alpha manquante. Type 2 : une seule rareté, manquante.
const rows = [
  { type_id: 1, type_name: 'Chat va ?', type_image: '🐱', rarity_id: 'common', pick_series: 10, pick_number: 7, owned_count: 3 },
  { type_id: 1, type_name: 'Chat va ?', type_image: '🐱', rarity_id: 'ultra', pick_series: null, pick_number: null, owned_count: 2 },
  { type_id: 1, type_name: 'Chat va ?', type_image: '🐱', rarity_id: 'alpha', pick_series: null, pick_number: null, owned_count: 0 },
  { type_id: 2, type_name: 'Chat va pas ?', type_image: '😾', rarity_id: 'common', pick_series: null, pick_number: null, owned_count: 0 },
]

const stats = renderToStaticMarkup(wrap(React.createElement(AlbumStats, { rows, rarityMap })))
ok('stats : 1 emplacement rempli sur 4 (25 %)', /<strong>1<\/strong> emplacement rempli sur 4/.test(stats) && /25/.test(stats))
ok('stats : 1 autre emplacement peut être rempli avec les cartes possédées (l’Ultra Rare)', /1 autre emplacement peut être rempli/.test(stats))
ok('stats par rareté : Commune 1/2, Ultra Rare 0/1, Alpha 0/1', /Commune <strong>1\/2<\/strong>/.test(stats) && /Ultra Rare <strong>0\/1<\/strong>/.test(stats) && /Alpha <strong>0\/1<\/strong>/.test(stats))
ok('stats : ni « cartes à toi sur » ni statistiques générales', !/cartes? à toi sur|déjà tirées par l/.test(stats))
ok('stats : chargement tant que l’album n’est pas là', /Chargement/.test(renderToStaticMarkup(wrap(React.createElement(AlbumStats, { rows: null, rarityMap })))))
const none = renderToStaticMarkup(wrap(React.createElement(AlbumStats, { rows: rows.filter((r) => r.pick_series != null || r.owned_count === 0), rarityMap })))
ok('stats : message quand plus rien ne peut être rempli', /Aucun autre emplacement/.test(none))

const html = renderToStaticMarkup(wrap(React.createElement(Album, { rows, catalog, rarityMap, onRefresh: () => {} })))
ok('album : une section par carte (2)', (html.match(/class="album-type"/g) || []).length === 2)
ok('album : un emplacement par rareté (4 au total)', (html.match(/class="album-slot /g) || []).length === 4)
ok('album : la même carte apparaît dans ses trois raretés (Commune, Ultra Rare, Alpha)', ['Commune', 'Ultra Rare', 'Alpha'].every((n) => new RegExp(`album-slot-label">${n}<`).test(html)))
ok('album : emplacement rempli, à remplir et manquants bien distingués', /album-slot filled/.test(html) && /album-slot fillable/.test(html) && (html.match(/album-slot missing/g) || []).length === 2)
ok('album : le rempli montre la carte choisie (07/10)', /card-num">07\/10</.test(html))
ok('album : « À remplir (2) » pour l’Ultra Rare, « Manquante » pour les autres', /À remplir \(2\)/.test(html) && (html.match(/Manquante/g) || []).length === 2)
ok('album : un emplacement sans exemplaire n’est pas cliquable', (html.match(/<button[^>]*album-slot missing[^>]*disabled/g) || []).length === 2 && !/<button[^>]*album-slot (filled|fillable)[^>]*disabled/.test(html))
ok('album : numéro de checklist et progression par carte', /n° 1\/2/.test(html) && /n° 2\/2/.test(html) && /album-type-count">1\/3</.test(html))
ok('album : couleur de rareté portée par l’emplacement', /--r1:#e11d48/.test(html))
ok('album : vide = message', /Aucune carte dans cette catégorie/.test(renderToStaticMarkup(wrap(React.createElement(Album, { rows: [], catalog, rarityMap, onRefresh: () => {} })))))

// Numéro masqué : la carte de l'album n'affiche pas son numéro
const hiddenRows = [{ type_id: 2, type_name: 'Chat va pas ?', type_image: '😾', rarity_id: 'common', pick_series: 50, pick_number: 9, owned_count: 1 }]
const hidden = renderToStaticMarkup(wrap(React.createElement(Album, { rows: hiddenRows, catalog, rarityMap, onRefresh: () => {} })))
ok('album : numéro masqué pour cette rareté, carte rendue sans numéro', /album-slot filled/.test(hidden) && !/card-num/.test(hidden))


// Nouvelle carte : petite étoile au-dessus de la carte (grande carte du booster et petite carte du résumé)
for (const size of ['lg', 'sm']) {
  const withStar = renderToStaticMarkup(wrap(React.createElement(Card, { typeId: 1, series: 10, number: 7, rarity: rarityMap.common, size, isNew: true })))
  const without = renderToStaticMarkup(wrap(React.createElement(Card, { typeId: 1, series: 10, number: 7, rarity: rarityMap.common, size })))
  ok(`carte ${size} nouvelle : étoile présente, annoncée aux lecteurs d'écran`, /card-new-star/.test(withStar) && /nouvelle carte/.test(withStar))
  // La face de la carte rogne ce qui dépasse : l'étoile doit venir APRÈS elle (frère), jamais à l'intérieur
  ok(`carte ${size} nouvelle : l'étoile est hors de la face de la carte`, /<\/div><span class="card-new-star"/.test(withStar) && !/card-setno">[^<]*<\/span><span class="card-new-star"/.test(withStar))
  ok(`carte ${size} déjà possédée : pas d'étoile`, !/card-new-star/.test(without) && !/nouvelle carte/.test(without))
}

if (bad) { console.error(`\n${bad} contrôle(s) en échec`); process.exit(1) }
console.log('\nAlbum (rendu) : tous les contrôles sont passés.')

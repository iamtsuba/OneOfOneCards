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
  stdin: { contents: "export { Album, AlbumStats, AlbumPicker, StackModal } from './src/components/Collection.jsx'; export { default as Card } from './src/components/Card.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', '@supabase/supabase-js'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { Album, AlbumStats, AlbumPicker, StackModal, Card, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
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


// ---- Unique = bonus : visible dans l'album, hors full set (statistiques, compteur par carte, étiquette)
const rm2 = { ...rarityMap, unique: { id: 'unique', name: 'Unique', kind: 'unique', sort_order: 1, color: '#7c3aed', color2: '#5b21b6', text_color: '#fff' } }
const bonusRows = []
for (const t of [1, 2]) for (const r of ['common', 'ultra', 'alpha', 'unique']) bonusRows.push({ type_id: t, type_name: `Carte ${t}`, rarity_id: r, pick_series: null, pick_number: null, owned_count: 0 })
bonusRows[0].pick_series = 10; bonusRows[0].pick_number = 7   // une Commune remplie
bonusRows[3].pick_series = 1; bonusRows[3].pick_number = 1    // une Unique remplie (bonus)
const bs = renderToStaticMarkup(wrap(React.createElement(AlbumStats, { rows: bonusRows, rarityMap: rm2 })))
ok('stats : le full set exclut les Unique (1 rempli sur 6, pas sur 8)', /<strong>1<\/strong> emplacement rempli sur 6/.test(bs))
ok('stats : le bonus Unique est annoncé à part (1/2), hors full set', /Bonus Unique, hors full set : <strong>1\/2<\/strong>/.test(bs))
ok('stats : la puce Unique est marquée bonus', /Unique <strong>1\/2<\/strong><span class="muted"> · bonus/.test(bs))
const allBase = bonusRows.map((r) => (r.rarity_id === 'unique' ? r : { ...r, pick_series: 5, pick_number: 2 }))
ok('stats : « Full set complet » sans avoir aucune Unique', /Full set complet/.test(renderToStaticMarkup(wrap(React.createElement(AlbumStats, { rows: allBase.map((r) => ({ ...r, pick_series: r.rarity_id === 'unique' ? null : 5 })), rarityMap: rm2 })))))
ok('stats : pas de « Full set complet » tant qu’il manque un emplacement', !/Full set complet/.test(bs))
const catalog2 = { ...catalog, typeMap: { 1: { id: 1, name: 'Carte 1', image: '🐱' }, 2: { id: 2, name: 'Carte 2', image: '😾' } }, checklist: (id) => ({ no: id, total: 2, secret: false }) }
const bAlbum = renderToStaticMarkup(wrap(React.createElement(Album, { rows: bonusRows, catalog: catalog2, rarityMap: rm2, onRefresh: () => {} })))
ok('album : compteur par carte sans les Unique, bonus à côté (carte 1 : 1/3 · bonus 1/1 ; carte 2 : 0/3 · bonus 0/1)', /album-type-count">1\/3 · bonus 1\/1</.test(bAlbum) && /album-type-count">0\/3 · bonus 0\/1</.test(bAlbum))
ok('album : emplacement Unique marqué « bonus » (classe et étiquette), les autres non', (bAlbum.match(/album-slot [a-z]+ bonus/g) || []).length === 2 && (bAlbum.match(/album-bonus-tag">bonus</g) || []).length === 2)
ok('album : les Unique restent visibles (8 emplacements au total)', (bAlbum.match(/class="album-slot /g) || []).length === 8)

// ---- Sélecteur de l'album : 200 cartes masquées = 1 proposition, + 3 numérotées = 4
const mk = (series, number, visible, extra2 = {}) => ({ series, number, rarity_id: 'common', listed: false, picked: false, visible, ...extra2 })
const pickCards = [...Array.from({ length: 200 }, (_, i) => mk(40 + (i % 30), 2 + Math.floor(i / 30), false)), mk(7, 2, true), mk(50, 30, true), mk(26, 25, true)]
const picker = (cards2, extraProps = {}) => renderToStaticMarkup(wrap(React.createElement(AlbumPicker, { typeId: 1, typeName: 'Chat va ?', rarityId: 'common', rarityName: 'Commune', rarityMap, hasPick: false, onClose: () => {}, onChanged: () => {}, initialCards: cards2, ...extraProps })))
const ph = picker(pickCards)
ok('sélecteur : 4 propositions pour 200 cartes masquées + 3 numérotées', (ph.match(/<li/g) || []).length === 4)
ok('sélecteur : la proposition regroupée porte le nombre de cartes (200)', /card-count" aria-hidden="true">200</.test(ph))
ok('sélecteur : les trois numérotées montrent leur numéro (2/7, 30/50, 25/26)', /card-num">2\/7</.test(ph) && /card-num">30\/50</.test(ph) && /card-num">25\/26</.test(ph))
ok('sélecteur : explication du regroupement', /regroupées en une seule proposition/.test(ph))
ok('sélecteur : 20 cartes masquées seulement = une seule proposition', (picker(Array.from({ length: 20 }, (_, i) => mk(40, 2 + i, false))).match(/<li/g) || []).length === 1)
const phPicked = picker([mk(40, 2, false), mk(40, 3, false, { picked: true }), mk(7, 2, true)], { hasPick: true })
ok('sélecteur : la carte déjà dans l’album est marquée et on peut vider l’emplacement', /Dans l’album/.test(phPicked) && /Vider cet emplacement/.test(phPicked))
ok('sélecteur : les cartes en vente ne sont pas proposées, et on le dit', /1 carte en vente non proposée/.test(picker([mk(40, 2, false), mk(7, 2, true, { listed: true })])) && (picker([mk(40, 2, false), mk(7, 2, true, { listed: true })]).match(/<li/g) || []).length === 1)
ok('sélecteur : tout en vente → message explicite', /sont tous en vente/.test(picker([mk(7, 2, true, { listed: true })])))

// ---- Fenêtre de pile : vente rapide en lot, mise en vente d'une seule carte
const stackCards = [...Array.from({ length: 10 }, (_, i) => mk(40, 2 + i, false, { listed: i < 2, picked: i === 2 })), mk(7, 2, true)]
const stackOf = (cards2, status, props = {}) => renderToStaticMarkup(React.createElement(M2.GameContext.Provider, { value: { catalog: catalog2, rarityMap, status, setStatus: () => {} } },
  React.createElement(StackModal, { stack: { typeId: 1, rarityId: 'common', series: 40, number: 2 }, catalog: catalog2, rarityMap, onClose: () => {}, onChanged: () => {}, onListOne: () => {}, initialCards: cards2, ...props })))
const M2 = { GameContext }
const sm = stackOf(stackCards, { direct_sell_price: 2, closed_categories: [] })
ok('pile : nombre total de cartes dans le rond (10) et dans le texte', /card-count" aria-hidden="true">10</.test(sm) && /10 cartes identiques/.test(sm))
ok('pile : détail vendables / en vente / dans l’album (7 · 2 · 1)', /7 vendables · 2 en vente · 1 dans l’album/.test(sm))
ok('pile : vente rapide d’une carte au prix du jeu (1 carte pour 2 pièces), choix du nombre, tout vendre', /Vendre 1 carte pour 2 pièces/.test(sm) && /max="7"/.test(sm) && /Tout \(7\)/.test(sm))
ok('pile : mise en vente sur le marché, une carte à la fois', /Une carte à la fois/.test(sm) && !/disabled=""[^>]*>Mettre une carte en vente/.test(sm))
const catalogClosed = { ...catalog2, typeMap: { ...catalog2.typeMap, 1: { ...catalog2.typeMap[1], category_id: 1 } }, categoryMap: { 1: { id: 1, name: 'Chats', closed: true } } }
const closedHtml = stackOf(stackCards, { direct_sell_price: 2, closed_categories: [1] }, { catalog: catalogClosed })
ok('pile : catégorie terminée → vente rapide indisponible (plus de bouton Vendre), marché toujours possible', /Indisponible : la catégorie « Chats » est terminée/.test(closedHtml) && !/Vendre \d+ carte/.test(closedHtml) && /Mettre une carte en vente/.test(closedHtml))
const allListed = stackOf(Array.from({ length: 3 }, (_, i) => mk(40, 2 + i, false, { listed: true })), { direct_sell_price: 1, closed_categories: [] })
ok('pile : rien de vendable → message et mise en vente désactivée', /Aucune carte vendable/.test(allListed) && /disabled=""[^>]*>Mettre une carte en vente/.test(allListed))

// ---- Carte : rond de quantité et pastille « Album »
const cardCount = renderToStaticMarkup(wrap(React.createElement(Card, { typeId: 1, series: 40, number: 2, rarity: rarityMap.common, size: 'sm', count: 12 })))
ok('carte : rond de quantité en haut à droite pour une pile', /card-count" aria-hidden="true">12</.test(cardCount) && /pile de 12 cartes/.test(cardCount))
ok('carte : pas de rond pour une carte seule', !/card-count/.test(renderToStaticMarkup(wrap(React.createElement(Card, { typeId: 1, series: 40, number: 2, rarity: rarityMap.common, size: 'sm', count: 1 })))))
ok('carte : pastille « Album » quand elle est dans l’album', /card-inalbum">Album</.test(renderToStaticMarkup(wrap(React.createElement(Card, { typeId: 1, series: 7, number: 2, rarity: rarityMap.common, size: 'sm', inAlbum: true })))))

if (bad) { console.error(`\n${bad} contrôle(s) en échec`); process.exit(1) }
console.log('\nAlbum (rendu) : tous les contrôles sont passés.')

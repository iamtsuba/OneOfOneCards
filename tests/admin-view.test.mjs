// Affiche chaque onglet de la console admin avec des données réalistes (sortie de la vraie fonction admin_data, voir
// tests/fixtures/admin_data.json) : une erreur d'exécution (variable oubliée…) ferait planter tout le panel.
//   node tests/admin-view.test.mjs
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-admin-'))
await build({
  stdin: {
    contents: "export { CategoriesTab, TypesTab, ConfigTab, RaritiesTab, UniqueWinsTab, LegalTab, SecurityTab } from './src/components/Admin.jsx'; export { GameContext } from './src/game.js'",
    resolveDir: root, loader: 'js',
  },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', '@supabase/supabase-js'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const M = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }

const data = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/admin_data.json'), 'utf8'))
const game = { catalog: { types: data.types, categories: data.categories }, refreshCatalog: async () => {}, refreshStatus: async () => {} }
const show = (Tab, props) => {
  try { return renderToStaticMarkup(React.createElement(M.GameContext.Provider, { value: game }, React.createElement(Tab, { run: async () => {}, busy: false, ...props }))) }
  catch (e) { console.log('     ->', e.message); return null }
}
const clean = (html) => html !== null && !/undefined|NaN|\[object/.test(html.replace(/placeholder="[^"]*"/g, ''))

// Catégories : une catégorie entamée montre la zone dangereuse, une non entamée non ; plus de seuils de rareté par catégorie
const cats = show(M.CategoriesTab, { data })
ok('onglet Catégories : s’affiche', cats !== null && clean(cats))
if (cats) {
  const started = data.categories.filter((c) => c.taken > 0).length
  ok(`zone dangereuse : une par catégorie entamée (${started})`, (cats.match(/danger-zone/g) || []).length === started && /Supprimer la catégorie et tout son contenu/.test(cats))
  ok('plus de seuils de rareté par catégorie', !/Seuils de rareté de cette catégorie/.test(cats) && /raretés et leur nombre de séries ne se règlent plus par catégorie/.test(cats))
  ok('plus de champ « Séries (1 à N) » dans le formulaire de catégorie', !/Séries \(1 à N\)/.test(cats) && !/Le nombre de séries \(par défaut/.test(cats))
}

// Types : on met la catégorie « Chattrapez » en premier pour voir un type secret et des raretés propres
const first = data.categories.find((c) => c.name === 'Chattrapez')
const dataChat = { ...data, categories: [first, ...data.categories.filter((c) => c !== first)] }
const typesTab = show(M.TypesTab, { data: dataChat })
ok('onglet Types : s’affiche', typesTab !== null && clean(typesTab))
if (typesTab) {
  ok('types : un éditeur « Raretés de ce type » par type', (typesTab.match(/class="type-rarities"/g) || []).length === data.types.filter((t) => t.category_id === first.id).length)
  ok('types : badge « secret » et nombre de séries propres', /badge">secret</.test(typesTab) && /500 séries/.test(typesTab) && /100 séries/.test(typesTab))
  ok('types : raretés propres décrites (numéros visibles puis masqués)', /Légende<\/strong> : cartes de 1\/1 à 20\/20/.test(typesTab) && /numéro visible de 1\/1 à 10\/10/.test(typesTab) && /non numérotée/.test(typesTab))
  ok('types : un type sans réglage propre indique les seuils par défaut', /réglages par défaut \(onglet Raretés\)/.test(typesTab))
  ok('types : case « type secret » cochée pour le secret', /checked=""/.test(typesTab))
  ok('types : import de types présent', /Importer des types/.test(typesTab))
  // Tes trois exemples : chaque rareté a SES séries, de 1/1 à N/N, numéros visibles de 1/1 à K/K
  const t1 = data.types.find((t) => t.category_id === first.id && !t.secret)
  const ex = [{ rarity_id: 'ultra', max_series: 50, numbered_series: 5 }, { rarity_id: 'super', max_series: 100, numbered_series: 1 }, { rarity_id: 'rare', max_series: 200, numbered_series: 20 }]
  const dataEx = { ...dataChat, type_rarities: [...data.type_rarities.filter((r) => r.type_id !== t1.id), ...ex.map((r) => ({ type_id: t1.id, ...r }))] }
  const exHtml = show(M.TypesTab, { data: dataEx })
  ok('éditeur : Ultra Rare, 50 séries, 5 numérotées → cartes de 1/1 à 50/50 (1 275 cartes), numéro visible de 1/1 à 5/5', exHtml !== null && /Ultra Rare<\/strong> : cartes de 1\/1 à 50\/50 \(1\D275 cartes\) — numéro visible de 1\/1 à 5\/5 \(séries 1 à 5\), masqué ensuite/.test(exHtml))
  ok('éditeur : Super Rare, 100 séries, 1 numérotée → 1/1 à 100/100, seule la 1/1 est numérotée (et NON 51 à 150 : séries indépendantes)', /Super Rare<\/strong> : cartes de 1\/1 à 100\/100 \(5\D050 cartes\) — numéro visible de 1\/1 à 1\/1 \(séries 1 à 1\), masqué ensuite/.test(exHtml))
  ok('éditeur : Rare, 200 séries, 20 numérotées → 1/1 à 200/200, numéro visible de 1/1 à 20/20', /Rare<\/strong> : cartes de 1\/1 à 200\/200 \(20\D100 cartes\) — numéro visible de 1\/1 à 20\/20 \(séries 1 à 20\), masqué ensuite/.test(exHtml))
  ok('éditeur : plus aucune trace des tranches qui se suivent (« séries 51 à … »)', !/séries 51 à/.test(exHtml))
  // 0 série = la rareté n'existe pas pour ce type : toutes les raretés sont listées, celles que le type n'a pas valent 0
  const rangeCount = data.rarities.filter((r) => r.kind === 'range').length
  const rowsHtml = exHtml.match(/class="type-rarity-row"/g) || []
  ok('éditeur : une ligne par rareté (0 série pour celles que le type n\'a pas), sans bouton « Ajouter » ni « × »', rowsHtml.length >= rangeCount && !/Ajouter une rareté/.test(exHtml) && !/Retirer cette rareté/.test(exHtml))
  ok('éditeur : une rareté à 0 série est décrite comme absente du type', /Commune<\/strong> : absente de ce type \(0 série\)/.test(exHtml) && /min="0" max="5000"/.test(exHtml))
  ok('éditeur : explication « 0 série max. = la rareté n\'existe pas pour ce type »', /0 série max\. = la rareté n’existe pas pour ce type/.test(exHtml))
  ok('éditeur : le type secret est expliqué comme une carte mystère dans l\'album', /carte mystère/.test(exHtml))
  const nTypes = data.types.filter((t) => t.category_id === first.id).length
  ok('types : un bouton « Réduire » par type (déplié par défaut), et Tout réduire / Tout déplier', (typesTab.match(/aria-expanded="true"/g) || []).length === nTypes && /Tout réduire/.test(typesTab) && /Tout déplier/.test(typesTab))
  const reduced = show(M.TypesTab, { data: dataChat, initialCollapsed: data.types.map((t) => t.id) })
  ok('types réduits : seul l’en-tête reste (nom, badges), plus aucun formulaire ni éditeur de raretés', reduced !== null && (reduced.match(/aria-expanded="false"/g) || []).length === nTypes
    && !/type-rarities/.test(reduced) && !/Enregistrer les raretés/.test(reduced) && /Chat Iny/.test(reduced) && /badge">secret</.test(reduced) && /500 séries/.test(reduced))
  ok('types réduits : le bouton propose de les déplier, le formulaire « Nouveau type » reste utilisable', /aria-label="Déplier Chat va \?"/.test(reduced) && /Nouveau type/.test(reduced) && />Créer</.test(reduced))
}

// Raretés, réglages, mentions légales, 1/1, sécurité
const rar = show(M.RaritiesTab, { data })
ok('onglet Raretés : s’affiche avec « placer avant »', rar !== null && clean(rar) && /Place dans l’ordre d’affichage/.test(rar) && /Avant « Ultra Rare »/.test(rar))
ok('onglet Raretés : plus de mention des seuils par catégorie', rar !== null && !/catégorie par catégorie|catégories qui ont/.test(rar))
ok('onglet Réglages : s’affiche', clean(show(M.ConfigTab, { data })))
ok('onglet Infos légales : s’affiche', clean(show(M.LegalTab, { data })))
const uw = show(M.UniqueWinsTab, { data })
ok('onglet 1/1 gagnées : s’affiche avec l’email du joueur', clean(uw) && /joueur@example\.com/.test(uw))
ok('onglet Sécurité : s’affiche', clean(show(M.SecurityTab, { onChange: async () => true })))

if (bad) { console.error(`\n${bad} contrôle(s) en échec`); process.exit(1) }
console.log('\nConsole admin (rendu) : tous les contrôles sont passés.')

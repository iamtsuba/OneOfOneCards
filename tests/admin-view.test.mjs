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
  ok('plus de seuils de rareté par catégorie', !/Seuils de rareté de cette catégorie/.test(cats) && /raretés ne se\s+règlent plus par catégorie/.test(cats))
}

// Types : on met la catégorie « Chattrapez » en premier pour voir un type secret et des raretés propres
const first = data.categories.find((c) => c.name === 'Chattrapez')
const dataChat = { ...data, categories: [first, ...data.categories.filter((c) => c !== first)] }
const typesTab = show(M.TypesTab, { data: dataChat })
ok('onglet Types : s’affiche', typesTab !== null && clean(typesTab))
if (typesTab) {
  ok('types : un éditeur « Raretés de ce type » par type', (typesTab.match(/class="type-rarities"/g) || []).length === data.types.filter((t) => t.category_id === first.id).length)
  ok('types : badge « secret » et nombre de séries propres', /badge">secret</.test(typesTab) && /500 séries/.test(typesTab) && /100 séries/.test(typesTab))
  ok('types : raretés propres décrites (numéros visibles puis masqués)', /Légende<\/strong> : séries 1 à 20/.test(typesTab) && /numéro visible sur les 10 premières séries/.test(typesTab) && /non numérotée/.test(typesTab))
  ok('types : un type sans réglage propre indique les seuils par défaut', /seuils par défaut \(onglet Raretés\)/.test(typesTab))
  ok('types : case « type secret » cochée pour le secret', /checked=""/.test(typesTab))
  ok('types : import de types présent', /Importer des types/.test(typesTab))
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

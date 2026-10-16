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
    contents: "export { AdminShell, CategoriesTab, TypesTab, ConfigTab, RaritiesTab, UniqueWinsTab, LegalTab, SecurityTab } from './src/components/Admin.jsx'; export { GameContext } from './src/game.js'; export { explain } from './src/api.js'",
    resolveDir: root, loader: 'js',
  },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', '@supabase/supabase-js'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod' }) }, logLevel: 'silent',
})
// Le même code compilé POUR LA PRODUCTION : la copie vers la production n'y existe pas
await build({
  stdin: { contents: "export { CategoriesTab } from './src/components/Admin.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle-prod.mjs'), minify: true,
  external: ['react', 'react-dom', 'react/jsx-runtime', '@supabase/supabase-js'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'prod', VITE_APP_ENV: 'prod' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const M = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
const MProd = await import(pathToFileURL(path.join(out, 'bundle-prod.mjs')).href)
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
  ok('catégorie : champ « Image du booster » et aperçu du booster (nom en haut, image au centre)', /Image du booster/.test(cats) && /class="admin-pack-preview"/.test(cats) && /class="pack-title"/.test(cats) && /Téléverser une image/.test(cats))
  ok('catégorie : l\'aperçu du booster porte le nom de la catégorie', cats.includes(`>${data.categories[0].name}</text>`))
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
  const ex = [{ rarity_id: 'ultra', max_series: 50, numbered_series: 5, card_style: 'fullart' }, { rarity_id: 'super', max_series: 100, numbered_series: 1, card_style: 'simple' }, { rarity_id: 'rare', max_series: 200, numbered_series: 20, card_style: 'fullart' }]
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
  // Style de carte par rareté : Simple ou FullArt, au choix pour chaque rareté d'un type
  ok('éditeur : un choix « Style de carte » (Simple / FullArt) pour chaque rareté', (exHtml.match(/<select[^>]*>\s*<option value="simple"/g) || []).length >= rangeCount && /<option value="fullart"[^>]*>FullArt<\/option>/.test(exHtml))
  ok('éditeur : le style enregistré est sélectionné (Ultra Rare et Rare en FullArt, Super Rare en Simple)', (exHtml.match(/<option value="fullart" selected=""/g) || []).length === 2 && !/Super Rare<\/strong> : [^<]*FullArt/.test(exHtml))
  ok('éditeur : la description d\'une rareté FullArt le dit', /Ultra Rare<\/strong> : [^<]*style FullArt/.test(exHtml) && /Rare<\/strong> : cartes de 1\/1 à 200\/200[^<]*style FullArt/.test(exHtml))
  ok('éditeur : l\'aperçu montre les deux styles avec l\'image du type', /class="style-previews"/.test(exHtml) && (exHtml.match(/<figure>/g) || []).length === 2 * data.types.filter((t) => t.category_id === first.id).length && /<figcaption>Simple<\/figcaption>/.test(exHtml) && /<figcaption>FullArt<\/figcaption>/.test(exHtml) && /class="card md fullart/.test(exHtml) && /class="card md"/.test(exHtml))
  ok('éditeur sans réglage propre : style Simple partout, expliqué (et aperçu des deux styles)', /Style de carte : Simple pour toutes les raretés/.test(typesTab) && /style-previews/.test(typesTab))
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

// ---------- Console pour PC (≥ 1100 px) : navigation à gauche, liste à gauche, détail en haut à droite, raretés dessous ----------
{
  const shell = (props) => show(M.AdminShell, { data, tab: 'types', onTab: () => {}, error: '', notice: '', onChangePassword: async () => true, onClose: () => {}, ...props })
  const wideHtml = shell({ wide: true })
  const narrowHtml = shell({ wide: false })
  ok('PC : le panneau passe en mise en page large avec une navigation verticale (un onglet par module)', wideHtml !== null && /legal-panel admin wide/.test(wideHtml) && /<nav class="admin-nav"[^>]*aria-orientation="vertical"/.test(wideHtml) && (wideHtml.match(/class="admin-nav-item/g) || []).length === 7)
  ok('PC : l’onglet actif est marqué et les compteurs (catégories, types) sont affichés', /admin-nav-item on"[^>]*>Types<span class="nav-count">\d+<\/span>/.test(wideHtml) && /aria-selected="true"/.test(wideHtml) && /Catégories<span class="nav-count">/.test(wideHtml))
  ok('PC : les écrans à deux colonnes gèrent eux-mêmes leur défilement (admin-main fill) ; les autres défilent d’un bloc', /admin-main fill/.test(wideHtml) && !/admin-main fill/.test(shell({ wide: true, tab: 'config' })))
  ok('mobile : inchangé (pastilles horizontales, pas de navigation verticale ni de panneau large)', /class="chips admin-tabs"/.test(narrowHtml) && !/admin-nav/.test(narrowHtml) && !/legal-panel admin wide/.test(narrowHtml) && !/class="admin-md /.test(narrowHtml))
  ok('PC : le nombre de joueurs est dans l’en-tête (pas sous le titre)', /admin-players/.test(wideHtml) && !/admin-players/.test(narrowHtml))

  const cat0 = data.categories[0]
  const list = data.types.filter((t) => t.category_id === cat0.id)              // catégorie ouverte par défaut (aucun réglage propre)
  const withRows = data.types.find((t) => data.type_rarities.some((r) => r.type_id === t.id))
  const listR = data.types.filter((t) => t.category_id === withRows.category_id) // catégorie du type aux raretés propres
  const without = list.find((t) => !data.type_rarities.some((r) => r.type_id === t.id))
  const wt = (props) => show(M.TypesTab, { data, wide: true, ...props })
  const empty = wt({})
  ok('types PC : à gauche, la liste de TOUS les types de la catégorie (nom, position), avec recherche, « Nouveau » et « Importer »', /class="admin-md types-wide"/.test(empty) && /aria-label="Types"/.test(empty) && list.every((t) => empty.includes(`>${t.name}</strong>`)) && /type="search"/.test(empty) && />\+ Nouveau</.test(empty) && />Importer</.test(empty))
  ok('types PC : sans sélection, un message invite à choisir un type', /md-empty/.test(empty) && !/ted-detail/.test(empty))
  const ed = wt({ initialSelection: withRows.id })
  ok('types PC : le type choisi est marqué dans la liste', new RegExp(`md-item on"[^>]*aria-current="true"`).test(ed) && (ed.match(/md-item on/g) || []).length === 1)
  ok('types PC : le détail du type est EN HAUT et ses raretés DESSOUS', ed.indexOf('aria-label="Détail du type"') > 0 && ed.indexOf('aria-label="Détail du type"') < ed.indexOf('aria-label="Raretés du type"'))
  ok('types PC : le détail porte nom, position, image, secret et UN bouton « Enregistrer le type »', /ted-fields/.test(ed) && ed.includes(`value="${withRows.name}"`) && /Image \(emoji ou adresse https/.test(ed) && /Type secret/.test(ed) && (ed.match(/Enregistrer le type/g) || []).length === 1)
  const rangeN = data.rarities.filter((r) => r.kind === 'range').length
  ok('types PC : les raretés forment un tableau, une ligne par rareté, avec séries, numérotées, style, nombre de cartes et numéros visibles', /<table class="rar-table"/.test(ed) && (ed.match(/<tr class="[^"]*"[^>]*><th scope="row">/g) || []).length === rangeN && /<th>Séries<\/th><th>Numérotées<\/th><th>Style<\/th><th>Cartes<\/th><th>N° visibles<\/th>/.test(ed))
  ok('types PC : un type aux raretés propres a des champs modifiables (séries, numérotées, style) pour chaque rareté', (ed.match(/aria-label="Séries max\. [^"]*"/g) || []).length === rangeN && (ed.match(/aria-label="Séries numérotées [^"]*"/g) || []).length === rangeN && (ed.match(/aria-label="Style de carte [^"]*"/g) || []).length === rangeN && /Revenir aux réglages par défaut/.test(ed))
  ok('types PC : le nombre de cartes de chaque rareté est calculé (20 séries = 210 cartes)', /<td class="num">210<\/td>/.test(ed.replace(/ | /g, '')) || /210/.test(ed))
  ok('types PC : l’aperçu montre les deux styles de carte (Simple, FullArt)', /aria-label="Aperçu des deux styles de carte"/.test(ed) && (ed.match(/<figure/g) || []).length === 2 && /<figcaption>Simple/.test(ed) && /<figcaption>FullArt/.test(ed))
  ok('types PC : « Appliquer ces raretés à d’autres types » propose les AUTRES types de la catégorie', /Appliquer ces raretés à d’autres types/.test(ed) && listR.filter((t) => t.id !== withRows.id).every((t) => new RegExp(`<span>${t.name.replace(/[?]/g, '\\?')}</span>`).test(ed)))
  const ed2 = wt({ initialSelection: without.id })
  ok('types PC : un type sans réglage propre montre ses réglages par défaut en lecture seule, avec « Personnaliser »', !/aria-label="Séries /.test(ed2) && /<table class="rar-table"/.test(ed2) && /Personnaliser les raretés de ce type/.test(ed2) && /réglages par défaut/.test(ed2))
  const nw = wt({ initialSelection: 'new' })
  ok('types PC : « Nouveau » ouvre un détail vide avec « Créer le type »', /Créer le type/.test(nw) && /Nouveau type/.test(nw) && !/Supprimer/.test(nw))
  ok('types PC : un type dont des cartes sont tirées ne peut pas être supprimé ; un type vide si', (() => { const a = data.types.find((t) => t.taken > 0); const b = data.types.find((t) => t.taken === 0); return (!a || !/>Supprimer</.test(wt({ initialSelection: a.id }))) && (!b || />Supprimer</.test(wt({ initialSelection: b.id }))) })())
  const imp = wt({ initialSelection: 'import' })
  ok('import PC : fichier de types, photos en plusieurs fichiers, modèle complet, format expliqué', /Importer des types/.test(imp) && /type="file"[^>]*multiple/.test(imp) && /Télécharger un modèle complet/.test(imp) && /nom ; position ; image ; secret ; raretés/.test(imp) && /nom du fichier/.test(imp))
  ok('import PC : aucun bouton d’import tant que rien n’est chargé', !/Importer \d+ type/.test(imp) && !/Rien de nouveau/.test(imp))
  ok('types PC : aucun texte parasite (undefined, NaN) dans les vues', [empty, ed, ed2, nw, imp].every(clean))
  const secretType = data.types.find((t) => t.secret)
  ok('types PC : la liste signale les types secrets et le nombre de cartes tirées', /· secret/.test(wt({ initialSelection: secretType.id })) && /tirées/.test(ed))

  const cw = show(M.CategoriesTab, { data, wide: true })
  ok('catégories PC : liste à gauche (avec statut et avancement), fiche à droite avec l’aperçu du booster', /class="admin-md cats-wide"/.test(cw) && /aria-label="Catégories"/.test(cw) && data.categories.every((c) => cw.includes(`>${c.name}</strong>`)) && /\+ Nouvelle catégorie/.test(cw) && /class="cat-cols"/.test(cw) && /class="admin-pack-preview"/.test(cw) && clean(cw))
  ok('catégories PC : la première catégorie est ouverte et marquée dans la liste', /md-item on"/.test(cw) && (cw.match(/md-item on/g) || []).length === 1)
  for (const tab of ['config', 'rarities', 'uniques', 'legal', 'security']) {
    const h = shell({ wide: true, tab })
    ok(`PC : l’écran « ${tab} » s’affiche sans erreur`, h !== null && clean(h) && /legal-panel admin wide/.test(h))
  }
  ok('PC : les écrans de liste passent en grille à plusieurs colonnes (cols-2), la sécurité reste étroite', /admin-list cols-2/.test(shell({ wide: true, tab: 'config' })) && /admin-list cols-2/.test(shell({ wide: true, tab: 'rarities' })) && /admin-list narrow/.test(shell({ wide: true, tab: 'security' })))
}

// ---------- Copie d'une catégorie vers la production : préproduction uniquement ----------
{
  const firstCat = data.categories[0]
  const nTypes = data.types.filter((t) => t.category_id === firstCat.id).length
  const wideCat = show(M.CategoriesTab, { data, wide: true })
  const narrowCat = show(M.CategoriesTab, { data, wide: false })
  ok('copie vers la production (PC) : le panneau est affiché pour la catégorie ouverte, dans le site de préproduction', /class="copy-prod"[^>]*aria-label="Copie vers la production"/.test(wideCat) && /<h4>Copier vers la production<\/h4>/.test(wideCat))
  ok('copie vers la production (mobile) : le panneau est affiché pour chaque catégorie existante', (narrowCat.match(/class="copy-prod"/g) || []).length === data.categories.length)
  ok('copie vers la production : le texte annonce le nombre de types, la copie désactivée et le refus des doublons', new RegExp(`ses ${nTypes} type`).test(wideCat) && /désactivée/.test(wideCat) && /même nom y existe déjà/.test(wideCat) && /ne sont pas copiés/.test(wideCat))
  ok('copie vers la production : le mot de passe de la production est demandé (champ masqué) et le bouton est désactivé tant qu\'il est vide', /type="password"[^>]*autoComplete="off"/.test(wideCat) && new RegExp(`<button type="button" class="btn" disabled="">Copier « ${firstCat.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} » vers la production</button>`).test(wideCat))
  ok('copie vers la production : option « Créer en production les raretés qui lui manquent » décochée par défaut', /Créer en production les raretés qui lui manquent/.test(wideCat) && !/checked=""[^>]*\/><span>Créer en production/.test(wideCat))
  ok('copie vers la production : pas de panneau pour une catégorie en cours de création', (() => { const h = show(M.CategoriesTab, { data: { ...data, categories: [] }, wide: false }); return h !== null && !/copy-prod/.test(h) })())
  const prodCat = show(MProd.CategoriesTab, { data, wide: true })
  const prodCatNarrow = show(MProd.CategoriesTab, { data, wide: false })
  ok('copie vers la production : AUCUN panneau, bouton ni texte dans la console compilée pour la production (PC et mobile)', prodCat !== null && prodCatNarrow !== null && !/copy-prod|Copier vers la production|Mot de passe administrateur de la production/.test(prodCat + prodCatNarrow))
  ok('copie vers la production : la console de production reste complète (fiche, enregistrer, aperçu du booster)', /class="admin-pack-preview"/.test(prodCat) && />Enregistrer</.test(prodCat))
  const ex = M.explain
  ok('erreurs de la copie : mot de passe de la production faux (distinct du mot de passe de préproduction)', ex(new Error('prod_admin_denied')) === 'Mot de passe administrateur de la PRODUCTION incorrect.' && ex(new Error('admin_denied')) === 'Mot de passe incorrect.')
  ok('erreurs de la copie : raretés manquantes listées, catégorie déjà en production, accès verrouillé', /legende, platine/.test(ex(new Error('prod_missing_rarities:legende,platine'))) && /Créer en production les raretés manquantes/.test(ex(new Error('prod_missing_rarities:platine'))) && /existe déjà en production/.test(ex(new Error('prod_category_exists'))) && /verrouillé/.test(ex(new Error('prod_admin_locked'))))
}

if (bad) { console.error(`\n${bad} contrôle(s) en échec`); process.exit(1) }
console.log('\nConsole admin (rendu) : tous les contrôles sont passés.')

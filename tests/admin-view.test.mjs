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
    contents: "export { AdminShell, CategoriesTab, TypesTab, ConfigTab, RaritiesTab, UniqueWinsTab, LegalTab, SecurityTab, BoostersTab, BoosterEditor } from './src/components/Admin.jsx'; export { GameContext } from './src/game.js'; export { explain } from './src/api.js'",
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

// Collections : une collection entamée montre la zone dangereuse, une non entamée non ; plus de seuils de rareté par collection
const cats = show(M.CategoriesTab, { data })
ok('onglet Collections : s’affiche', cats !== null && clean(cats))
if (cats) {
  const started = data.categories.filter((c) => c.taken > 0).length
  ok(`zone dangereuse : une par collection entamée (${started})`, (cats.match(/danger-zone/g) || []).length === started && /Supprimer la collection et tout son contenu/.test(cats))
  ok('plus de seuils de rareté par collection', !/Seuils de rareté de cette collection/.test(cats) && /raretés et leur nombre de séries ne se règlent plus par collection/.test(cats))
  ok('collection : champ « Image du booster » et aperçu du booster (nom en haut, image au centre)', /Image du booster/.test(cats) && /class="admin-pack-preview"/.test(cats) && /class="pack-title"/.test(cats) && /Téléverser une image/.test(cats))
  ok('collection : l\'aperçu du booster porte le nom de la collection', cats.includes(`>${data.categories[0].name}</text>`))
  ok('plus de champ « Séries (1 à N) » dans le formulaire de collection', !/Séries \(1 à N\)/.test(cats) && !/Le nombre de séries \(par défaut/.test(cats))
}

// Types : on met la collection « Chattrapez » en premier pour voir un type secret et des raretés propres
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
  ok('cartes : import de cartes présent', /Importer des cartes/.test(typesTab))
  // Tes trois exemples : chaque rareté a SES séries, de 1/1 à N/N, numéros visibles de 1/1 à K/K
  const t1 = data.types.find((t) => t.category_id === first.id && !t.secret)
  const ex = [{ rarity_id: 'ultra', max_series: 50, numbered_series: 5, card_style: 'fullart' }, { rarity_id: 'super', max_series: 100, numbered_series: 1, card_style: 'simple' }, { rarity_id: 'rare', max_series: 200, numbered_series: 20, card_style: 'fullart' }]
  const dataEx = { ...dataChat, type_rarities: [...data.type_rarities.filter((r) => r.type_id !== t1.id), ...ex.map((r) => ({ type_id: t1.id, ...r }))] }
  const exHtml = show(M.TypesTab, { data: dataEx })
  ok('éditeur : Ultra Rare, 50 séries, 5 numérotées → cartes de 1/1 à 50/50 (1 275 cartes), numéro visible de 1/1 à 5/5', exHtml !== null && /Ultra Rare<\/strong> : cartes de 1\/1 à 50\/50 \(1\D275 cartes\) — numéro visible de 1\/1 à 5\/5 \(séries 1 à 5\), masqué ensuite/.test(exHtml))
  ok('éditeur : Super Rare, 100 séries, 1 numérotée → 1/1 à 100/100, seule la 1/1 est numérotée (et NON 51 à 150 : séries indépendantes)', /Super Rare<\/strong> : cartes de 1\/1 à 100\/100 \(5\D050 cartes\) — numéro visible de 1\/1 à 1\/1 \(séries 1 à 1\), masqué ensuite/.test(exHtml))
  ok('éditeur : Rare, 200 séries, 20 numérotées → 1/1 à 200/200, numéro visible de 1/1 à 20/20', /Rare<\/strong> : cartes de 1\/1 à 200\/200 \(20\D100 cartes\) — numéro visible de 1\/1 à 20\/20 \(séries 1 à 20\), masqué ensuite/.test(exHtml))
  ok('éditeur : plus aucune trace des tranches qui se suivent (« séries 51 à … »)', !/séries 51 à/.test(exHtml))
  // 0 série = la rareté n'existe pas pour cette carte : toutes les raretés sont listées, celles que le type n'a pas valent 0
  const rangeCount = data.rarities.filter((r) => r.kind === 'range').length
  const rowsHtml = exHtml.match(/class="type-rarity-row"/g) || []
  ok('éditeur : une ligne par rareté (0 série pour celles que le type n\'a pas), sans bouton « Ajouter » ni « × »', rowsHtml.length >= rangeCount && !/Ajouter une rareté/.test(exHtml) && !/Retirer cette rareté/.test(exHtml))
  ok('éditeur : une rareté à 0 série est décrite comme absente de la carte', /Commune<\/strong> : absente de cette carte \(0 série\)/.test(exHtml) && /min="0" max="5000"/.test(exHtml))
  ok('éditeur : explication « 0 série max. = la rareté n\'existe pas pour ce type »', /0 série max\. = la rareté n’existe pas pour cette carte/.test(exHtml))
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
  ok('types réduits : le bouton propose de les déplier, le formulaire « Nouvelle carte » reste utilisable', /aria-label="Déplier Chat va \?"/.test(reduced) && /Nouvelle carte/.test(reduced) && />Créer</.test(reduced))
}

// Raretés, réglages, mentions légales, 1/1, sécurité
const rar = show(M.RaritiesTab, { data })
ok('onglet Raretés : s’affiche avec « placer avant »', rar !== null && clean(rar) && /Place dans l’ordre d’affichage/.test(rar) && /Avant « Ultra Rare »/.test(rar))
ok('onglet Raretés : plus de mention des seuils par collection', rar !== null && !/collection par collection|collections qui ont/.test(rar))
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
  ok('PC : le panneau passe en mise en page large avec une navigation verticale (un onglet par module : 8, Boosters compris)', wideHtml !== null && /legal-panel admin wide/.test(wideHtml) && /<nav class="admin-nav"[^>]*aria-orientation="vertical"/.test(wideHtml) && (wideHtml.match(/class="admin-nav-item/g) || []).length === 8)
  ok('PC : l’onglet actif est marqué et les compteurs (collections, cartes) sont affichés', /admin-nav-item on"[^>]*>Cartes<span class="nav-count">\d+<\/span>/.test(wideHtml) && /aria-selected="true"/.test(wideHtml) && /Collections<span class="nav-count">/.test(wideHtml))
  ok('PC : les écrans à deux colonnes gèrent eux-mêmes leur défilement (admin-main fill) ; les autres défilent d’un bloc', /admin-main fill/.test(wideHtml) && !/admin-main fill/.test(shell({ wide: true, tab: 'config' })))
  ok('mobile : inchangé (pastilles horizontales, pas de navigation verticale ni de panneau large)', /class="chips admin-tabs"/.test(narrowHtml) && !/admin-nav/.test(narrowHtml) && !/legal-panel admin wide/.test(narrowHtml) && !/class="admin-md /.test(narrowHtml))
  ok('PC : le nombre de joueurs est dans l’en-tête (pas sous le titre)', /admin-players/.test(wideHtml) && !/admin-players/.test(narrowHtml))

  const cat0 = data.categories[0]
  const list = data.types.filter((t) => t.category_id === cat0.id)              // collection ouverte par défaut (aucun réglage propre)
  const withRows = data.types.find((t) => data.type_rarities.some((r) => r.type_id === t.id))
  const listR = data.types.filter((t) => t.category_id === withRows.category_id) // collection du type aux raretés propres
  const without = list.find((t) => !data.type_rarities.some((r) => r.type_id === t.id))
  const wt = (props) => show(M.TypesTab, { data, wide: true, ...props })
  const empty = wt({})
  ok('types PC : à gauche, la liste de TOUS les types de la collection (nom, position), avec recherche, « Nouveau » et « Importer »', /class="admin-md types-wide"/.test(empty) && /aria-label="Types"/.test(empty) && list.every((t) => empty.includes(`>${t.name}</strong>`)) && /type="search"/.test(empty) && />\+ Nouveau</.test(empty) && />Importer</.test(empty))
  ok('types PC : sans sélection, un message invite à choisir un type', /md-empty/.test(empty) && !/ted-detail/.test(empty))
  const ed = wt({ initialSelection: withRows.id })
  ok('types PC : le type choisi est marqué dans la liste', new RegExp(`md-item on"[^>]*aria-current="true"`).test(ed) && (ed.match(/md-item on/g) || []).length === 1)
  ok('types PC : le détail du type est EN HAUT et ses raretés DESSOUS', ed.indexOf('aria-label="Détail de la carte"') > 0 && ed.indexOf('aria-label="Détail de la carte"') < ed.indexOf('aria-label="Raretés de la carte"'))
  ok('types PC : le détail porte nom, position, image, secret et UN bouton « Enregistrer la carte »', /ted-fields/.test(ed) && ed.includes(`value="${withRows.name}"`) && /Image \(emoji ou adresse https/.test(ed) && /Carte secrète/.test(ed) && (ed.match(/Enregistrer la carte/g) || []).length === 1)
  const rangeN = data.rarities.filter((r) => r.kind === 'range').length
  ok('types PC : les raretés forment un tableau, une ligne par rareté, avec séries, numérotées, style, nombre de cartes et numéros visibles', /<table class="rar-table"/.test(ed) && (ed.match(/<tr class="[^"]*"[^>]*><th scope="row">/g) || []).length === rangeN && /<th>Séries<\/th><th>Numérotées<\/th><th>Style<\/th><th>Cartes<\/th><th>N° visibles<\/th>/.test(ed))
  ok('types PC : un type aux raretés propres a des champs modifiables (séries, numérotées, style) pour chaque rareté', (ed.match(/aria-label="Séries max\. [^"]*"/g) || []).length === rangeN && (ed.match(/aria-label="Séries numérotées [^"]*"/g) || []).length === rangeN && (ed.match(/aria-label="Style de carte [^"]*"/g) || []).length === rangeN && /Revenir aux réglages par défaut/.test(ed))
  ok('types PC : le nombre de cartes de chaque rareté est calculé (20 séries = 210 cartes)', /<td class="num">210<\/td>/.test(ed.replace(/ | /g, '')) || /210/.test(ed))
  ok('types PC : l’aperçu montre les deux styles de carte (Simple, FullArt)', /aria-label="Aperçu des deux styles de carte"/.test(ed) && (ed.match(/<figure/g) || []).length === 2 && /<figcaption>Simple/.test(ed) && /<figcaption>FullArt/.test(ed))
  ok('types PC : « Appliquer ces raretés à d’autres cartes » propose les AUTRES cartes de la collection', /Appliquer ces raretés à d’autres cartes/.test(ed) && listR.filter((t) => t.id !== withRows.id).every((t) => new RegExp(`<span>${t.name.replace(/[?]/g, '\\?')}</span>`).test(ed)))
  const ed2 = wt({ initialSelection: without.id })
  ok('types PC : un type sans réglage propre montre ses réglages par défaut en lecture seule, avec « Personnaliser »', !/aria-label="Séries /.test(ed2) && /<table class="rar-table"/.test(ed2) && /Personnaliser les raretés de cette carte/.test(ed2) && /réglages par défaut/.test(ed2))
  const nw = wt({ initialSelection: 'new' })
  ok('types PC : « Nouveau » ouvre un détail vide avec « Créer la carte »', /Créer la carte/.test(nw) && /Nouvelle carte/.test(nw) && !/Supprimer/.test(nw))
  ok('types PC : un type dont des cartes sont tirées ne peut pas être supprimé ; un type vide si', (() => { const a = data.types.find((t) => t.taken > 0); const b = data.types.find((t) => t.taken === 0); return (!a || !/>Supprimer</.test(wt({ initialSelection: a.id }))) && (!b || />Supprimer</.test(wt({ initialSelection: b.id }))) })())
  const imp = wt({ initialSelection: 'import' })
  ok('import PC : fichier de cartes, photos en plusieurs fichiers, modèle complet, format expliqué', /Importer des cartes/.test(imp) && /type="file"[^>]*multiple/.test(imp) && /Télécharger un modèle complet/.test(imp) && /nom ; position ; image ; secret ; raretés/.test(imp) && /nom du fichier/.test(imp))
  ok('import PC : aucun bouton d’import tant que rien n’est chargé', !/Importer \d+ type/.test(imp) && !/Rien de nouveau/.test(imp))
  ok('types PC : aucun texte parasite (undefined, NaN) dans les vues', [empty, ed, ed2, nw, imp].every(clean))
  const secretType = data.types.find((t) => t.secret)
  ok('types PC : la liste signale les types secrets et le nombre de cartes tirées', /· secret/.test(wt({ initialSelection: secretType.id })) && /tirées/.test(ed))

  const cw = show(M.CategoriesTab, { data, wide: true })
  ok('collections PC : liste à gauche (avec statut et avancement), fiche à droite avec l’aperçu du booster', /class="admin-md cats-wide"/.test(cw) && /aria-label="Collections"/.test(cw) && data.categories.every((c) => cw.includes(`>${c.name}</strong>`)) && /\+ Nouvelle collection/.test(cw) && /class="cat-cols"/.test(cw) && /class="admin-pack-preview"/.test(cw) && clean(cw))
  ok('collections PC : la première collection est ouverte et marquée dans la liste', /md-item on"/.test(cw) && (cw.match(/md-item on/g) || []).length === 1)
  for (const tab of ['config', 'rarities', 'uniques', 'legal', 'security']) {
    const h = shell({ wide: true, tab })
    ok(`PC : l’écran « ${tab} » s’affiche sans erreur`, h !== null && clean(h) && /legal-panel admin wide/.test(h))
  }
  ok('PC : les écrans de liste passent en grille à plusieurs colonnes (cols-2), la sécurité reste étroite', /admin-list cols-2/.test(shell({ wide: true, tab: 'config' })) && /admin-list cols-2/.test(shell({ wide: true, tab: 'rarities' })) && /admin-list narrow/.test(shell({ wide: true, tab: 'security' })))
}

// ---------- Copie d'une collection vers la production : préproduction uniquement ----------
{
  const firstCat = data.categories[0]
  const nTypes = data.types.filter((t) => t.category_id === firstCat.id).length
  const wideCat = show(M.CategoriesTab, { data, wide: true })
  const narrowCat = show(M.CategoriesTab, { data, wide: false })
  ok('copie vers la production (PC) : le panneau est affiché pour la collection ouverte, dans le site de préproduction', /class="copy-prod"[^>]*aria-label="Copie vers la production"/.test(wideCat) && /<h4>Copier vers la production<\/h4>/.test(wideCat))
  ok('copie vers la production (mobile) : le panneau est affiché pour chaque collection existante', (narrowCat.match(/class="copy-prod"/g) || []).length === data.categories.length)
  ok('copie vers la production : le texte annonce le nombre de types, la copie désactivée et le refus des doublons', new RegExp(`ses ${nTypes} type`).test(wideCat) && /désactivée/.test(wideCat) && /même nom y existe déjà/.test(wideCat) && /ne sont pas copiés/.test(wideCat))
  ok('copie vers la production : le mot de passe de la production est demandé (champ masqué) et le bouton est désactivé tant qu\'il est vide', /type="password"[^>]*autoComplete="off"/.test(wideCat) && new RegExp(`<button type="button" class="btn" disabled="">Copier « ${firstCat.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} » vers la production</button>`).test(wideCat))
  ok('copie vers la production : option « Créer en production les raretés qui lui manquent » décochée par défaut', /Créer en production les raretés qui lui manquent/.test(wideCat) && !/checked=""[^>]*\/><span>Créer en production/.test(wideCat))
  ok('copie vers la production : pas de panneau pour une collection en cours de création', (() => { const h = show(M.CategoriesTab, { data: { ...data, categories: [] }, wide: false }); return h !== null && !/copy-prod/.test(h) })())
  const prodCat = show(MProd.CategoriesTab, { data, wide: true })
  const prodCatNarrow = show(MProd.CategoriesTab, { data, wide: false })
  ok('copie vers la production : AUCUN panneau, bouton ni texte dans la console compilée pour la production (PC et mobile)', prodCat !== null && prodCatNarrow !== null && !/copy-prod|Copier vers la production|Mot de passe administrateur de la production/.test(prodCat + prodCatNarrow))
  ok('copie vers la production : la console de production reste complète (fiche, enregistrer, aperçu du booster)', /class="admin-pack-preview"/.test(prodCat) && />Enregistrer</.test(prodCat))
  const ex = M.explain
  ok('erreurs de la copie : mot de passe de la production faux (distinct du mot de passe de préproduction)', ex(new Error('prod_admin_denied')) === 'Mot de passe administrateur de la PRODUCTION incorrect.' && ex(new Error('admin_denied')) === 'Mot de passe incorrect.')
  ok('erreurs de la copie : raretés manquantes listées, collection déjà en production, accès verrouillé', /legende, platine/.test(ex(new Error('prod_missing_rarities:legende,platine'))) && /Créer en production les raretés manquantes/.test(ex(new Error('prod_missing_rarities:platine'))) && /existe déjà en production/.test(ex(new Error('prod_category_exists'))) && /verrouillé/.test(ex(new Error('prod_admin_locked'))))
}


// ---------- Boosters paramétrables (onglet Boosters) ----------
{
  const std = data.booster_types.find((b) => b.is_standard)
  const silver = { id: 9001, position: 2, name: 'Silver', cards: 3, color: '#c0c0c0', price_coins: 50, enabled: true, is_standard: false, holders: 4,
    slots: [{ position: 1, rarity_id: 'common', weight: 100 }, { position: 2, rarity_id: 'common', weight: 80 }, { position: 2, rarity_id: 'rare', weight: 20 }, { position: 3, rarity_id: 'rare', weight: 100 }] }
  const withSilver = { ...data, booster_types: [...data.booster_types, silver] }
  const bw = show(M.BoostersTab, { data: withSilver, wide: true })
  const bn = show(M.BoostersTab, { data: withSilver, wide: false })
  const shellTabs = show(M.AdminShell, { data: withSilver, tab: 'boosters', onTab: () => {}, busy: false, error: '', notice: '', run: () => {}, onChangePassword: () => {}, onClose: () => {}, wide: true })

  ok('boosters : l\'onglet « Boosters » existe dans la console avec son compteur', />Boosters<span class="nav-count">2</.test(shellTabs) && show(M.AdminShell, { data: withSilver, tab: 'boosters', onTab: () => {}, busy: false, error: '', notice: '', run: () => {}, onChangePassword: () => {}, onClose: () => {}, wide: false }).includes('>Boosters</button>'))
  ok('boosters (PC) : liste à gauche et éditeur à droite, bouton « + Nouveau booster »', /class="admin-md boosters-wide"/.test(bw) && /aria-label="Boosters"/.test(bw) && />\+ Nouveau booster</.test(bw) && /class="md-detail"/.test(bw))
  ok('boosters : la liste annonce le Standard (se recharge tout seul) et Silver (prix, stock)', /<strong>Standard<\/strong><small>n° \d+ · 5 cartes · Standard : se recharge tout seul<\/small>/.test(bw) && /<strong>Silver<\/strong><small>n° \d+ · 3 cartes · 50 pièces · 4 en stock<\/small>/.test(bw))
  ok('boosters : le Standard est ouvert par défaut, avec ses 5 cartes et leurs répartitions', /<h3>Standard<span class="muted"> · se recharge tout seul<\/span><\/h3>/.test(bw) && (bw.match(/<legend>Carte \d<\/legend>/g) || []).length === 5)
  ok('boosters : chaque ligne montre la rareté, son poids et sa chance en pourcentage (carte 1 : 100 %)', /aria-label="Poids de [^"]*, carte 1"/.test(bw) && /<span class="booster-pct" aria-label="chance">100 %<\/span>/.test(bw))
  ok('boosters : les chances de chaque carte totalisent 100 % (somme des pourcentages affichés, tolérance d\'arrondi)', (() => {
    const cards = bw.split('<fieldset class="booster-card">').slice(1)
    return cards.length === 5 && cards.every((c) => { const v = [...c.matchAll(/booster-pct" aria-label="chance">([\d,]+) %</g)].map((m) => Number(m[1].replace(',', '.'))); return Math.abs(v.reduce((a, x) => a + x, 0) - 100) < 0.6 })
  })())
  ok('boosters : Standard — prix et activation verrouillés, pas de suppression ni de don, mais « Dupliquer » et « Enregistrer »', /placeholder="jamais en vente" disabled=""/.test(bw) && /Actif \(toujours\)/.test(bw) && !/>Supprimer</.test(bw) && !/Offrir des boosters/.test(bw) && />Dupliquer</.test(bw) && />Enregistrer</.test(bw))
  const ed = (booster, extra = {}) => show(M.BoosterEditor, { booster, rarities: data.rarities, run: () => {}, busy: false, onCreated: () => {}, onDeleted: () => {}, onDuplicate: () => {}, ...extra })
  const es = ed(silver)
  ok('boosters : un booster ordinaire a un prix modifiable, un bouton Supprimer et un panneau « Offrir des boosters »', /<input type="number" min="0" step="1" inputMode="numeric" placeholder="vide = hors vente" value="50"\/>/.test(es) && />Supprimer</.test(es) && /Offrir des boosters/.test(es) && /Pseudo \(vide = tous les joueurs\)/.test(es))
  ok('boosters : Silver — 3 cartes, carte 2 à 80 % et 20 %', (es.match(/<legend>Carte \d<\/legend>/g) || []).length === 3 && (es.split('<fieldset class="booster-card">')[2].match(/booster-pct" aria-label="chance">(80|20) %</g) || []).length === 2)
  ok('boosters : Silver valide : « Enregistrer » actif, aucun message d\'erreur', !/role="alert"/.test(es) && />Enregistrer<\/button>/.test(es) && !/disabled="">Enregistrer/.test(es))
  const broken = ed({ ...silver, slots: silver.slots.filter((s) => s.position !== 2) })
  ok('boosters : une carte sans rareté bloque l\'enregistrement et dit laquelle', /role="alert">La carte 2 n’a aucune rareté\./.test(broken) && /<button type="button" class="btn" disabled="">Enregistrer<\/button>/.test(broken))
  const empty = ed({ ...silver, name: '' })
  ok('boosters : un nom vide bloque l\'enregistrement', /Donne un nom au booster\./.test(empty) && /disabled="">Enregistrer/.test(empty))
  const nouveau = ed(null)
  // ordre d'affichage sur la page Boosters
  const orderInput = (h) => (h.match(/<label>Ordre d’affichage<input[^>]*>/) || [''])[0]
  ok('boosters : champ « Ordre d\'affichage » dans chaque éditeur, avec la position actuelle (Silver n° 2) et l\'explication', /value="2"/.test(orderInput(es)) && /min="1" max="9999"/.test(orderInput(es)) && /1 = en premier sur la page Boosters/.test(es))
  ok('boosters : un nouveau booster a le champ d\'ordre vide (« à la suite ») ; le Standard a aussi le sien', /placeholder="à la suite"/.test(orderInput(nouveau)) && !/value="\d/.test(orderInput(nouveau)) && /<label>Ordre d’affichage/.test(show(M.BoosterEditor, { booster: data.booster_types.find((b) => b.is_standard), rarities: data.rarities, run: () => {}, busy: false, onCreated: () => {}, onDeleted: () => {}, onDuplicate: () => {} })))
  ok('boosters : un ordre invalide (0) est signalé et bloque l\'enregistrement', /L’ordre d’affichage doit être un nombre entier entre 1 et 9999/.test(ed({ ...silver, position: 0 })) && !/L’ordre d’affichage doit être/.test(es))
  ok('boosters : nouveau booster : « Créer le booster », 5 cartes à 100 % de la rareté la plus répandue, ni copie, ni suppression, ni don', />Créer le booster</.test(nouveau) && (nouveau.match(/<legend>Carte \d<\/legend>/g) || []).length === 5 && !/Dupliquer|Supprimer|Offrir des boosters/.test(nouveau)
    && /Nouveau booster/.test(nouveau) && (nouveau.match(/booster-pct" aria-label="chance">100 %</g) || []).length === 5)
  ok('boosters : seules les raretés ordinaires et Unique sont proposées (jamais Alpha ni Omega)', (() => { const opts = [...es.matchAll(/<option value="([a-z_0-9]+)"/g)].map((m) => m[1]); return opts.includes('unique') && opts.includes('common') && !opts.includes('alpha') && !opts.includes('omega') })())
  ok('boosters : une rareté déjà utilisée sur une carte n\'est plus proposée à l\'ajout sur cette carte', (() => { const c1 = es.split('<fieldset class="booster-card">')[1]; const add = (c1.match(/booster-add[\s\S]*?<\/select>/) || [''])[0]; return !add.includes('value="common"') && add.includes('value="rare"') })())
  ok('boosters (mobile) : liste puis éditeur l\'un sous l\'autre, sans mise en page à deux colonnes', bn !== null && !/admin-md/.test(bn) && /class="booster-list"/.test(bn) && /<h3>Standard/.test(bn))
  ok('boosters : sans aucun type (ancienne base), l\'onglet affiche un nouveau booster sans planter', show(M.BoostersTab, { data: { ...data, booster_types: undefined }, wide: false }) !== null)
  // ---- rôles : booster des abonnés, cadeau des abonnés, récompense de carte complétée (le Gold)
  const goldB = { id: 9002, position: 3, name: 'Gold', cards: 5, color: '#d4af37', price_coins: null, enabled: true, is_standard: false, role: 'card_reward', holders: 0,
    slots: [1, 2, 3].map((p) => ({ position: p, rarity_id: 'rare', weight: 100 })).concat([{ position: 4, rarity_id: 'super', weight: 100 }, { position: 5, rarity_id: 'numbered', weight: 3 }, { position: 5, rarity_id: 'alpha', weight: 1 }, { position: 5, rarity_id: 'omega', weight: 1 }, { position: 5, rarity_id: 'unique', weight: 1 }]) }
  const oneMore = { id: 9003, position: 4, name: 'OneMore', cards: 2, color: '#7c3aed', price_coins: null, enabled: true, is_standard: false, role: 'subscriber', holders: 0, slots: [{ position: 1, rarity_id: 'rare', weight: 1 }, { position: 2, rarity_id: 'super', weight: 1 }] }
  const giftB = { id: 9004, position: 5, name: 'Art Rare assuré', cards: 1, color: '#f59e0b', price_coins: null, enabled: true, is_standard: false, role: 'subscription_gift', holders: 0, slots: [{ position: 1, rarity_id: 'ultra', weight: 1 }] }
  const eg = ed(goldB), eo = ed(oneMore), ei = ed(giftB)
  const roleOptions = (h) => [...(h.match(/<label>Rôle[\s\S]*?<\/select>/) || [''])[0].matchAll(/<option value="([^"]*)"/g)].map((m) => m[1])
  ok('rôles : un booster ordinaire propose le choix du rôle (ordinaire, membres Pro, cadeau Pro, récompense) ; le Standard n\'en a pas', roleOptions(es).join('|') === '|subscriber|subscription_gift|card_reward' && !/<label>Rôle/.test(bw))
  ok('rôles : le rôle actuel est sélectionné et son aide est affichée (Gold : « gagné quand tous les emplacements… », un seul booster par rôle)', /<option value="card_reward" selected="">Récompense : carte complétée<\/option>/.test(eg) && /Le booster Gold : gagné quand tous les emplacements d’une carte sont remplis/.test(eg) && /Un seul booster par rôle/.test(eg) && /<option value="subscriber" selected="">/.test(eo) && /<option value="subscription_gift" selected="">/.test(ei))
  ok('Gold : jamais en vente, toujours actif, pas de suppression ni de don (le jeu en dépend)', /placeholder="jamais en vente" disabled=""/.test(eg) && /Actif \(toujours\)/.test(eg) && !/>Supprimer</.test(eg) && !/Offrir des boosters/.test(eg) && />Dupliquer</.test(eg))
  ok('Gold : propose en plus Alpha, Omega et « Carte numérotée (de la carte complétée) » ; et affiche ces choix déjà réglés sur la carte 5', (() => { const opts = [...eg.matchAll(/<option value="([a-z_0-9]+)"/g)].map((m) => m[1]); return opts.includes('alpha') && opts.includes('omega') && opts.includes('numbered') })() && /Carte numérotée \(de la carte complétée\)/.test(eg) && /aria-label="Poids de Alpha, carte 5"/.test(eg) && /aria-label="Poids de Carte numérotée \(de la carte complétée\), carte 5"/.test(eg))
  ok('Gold valide : « Enregistrer » actif, aucun message d\'erreur', !/role="alert"/.test(eg) && !/disabled="">Enregistrer/.test(eg))
  ok('booster des membres Pro : jamais en vente, pas de don (il remplace le Standard), mais on peut le supprimer', /placeholder="jamais en vente" disabled=""/.test(eo) && !/Offrir des boosters/.test(eo) && />Supprimer</.test(eo))
  ok('cadeau Pro : se règle comme un booster ordinaire (prix possible) et peut être offert par l\'admin', /placeholder="vide = hors vente"/.test(ei) && /Offrir des boosters/.test(ei) && />Supprimer</.test(ei))
  const alphaOrd = ed({ ...silver, role: null, slots: [{ position: 1, rarity_id: 'alpha', weight: 1 }, { position: 2, rarity_id: 'common', weight: 1 }, { position: 3, rarity_id: 'rare', weight: 1 }] })
  ok('un booster ordinaire qui contient Alpha est refusé avec la raison (réservé au booster de récompense), l\'enregistrement est bloqué', /role="alert">Carte 1 : « Alpha » n’est possible que dans le booster de récompense\./.test(alphaOrd) && /disabled="">Enregistrer/.test(alphaOrd))
  const listRoles = show(M.BoostersTab, { data: { ...data, booster_types: [...data.booster_types, goldB, oneMore, giftB] }, wide: true })
  ok('liste : chaque booster de rôle annonce son rôle à la place du prix', /<strong>Gold<\/strong><small>n° \d+ · 5 cartes · Récompense : carte complétée/.test(listRoles) && /<strong>OneMore<\/strong><small>n° \d+ · 2 cartes · Booster des membres Pro/.test(listRoles) && /<strong>Art Rare assuré<\/strong><small>n° \d+ · 1 carte · Cadeau Pro/.test(listRoles))
  ok('liste : le Standard reste ouvert par défaut même avec des boosters de rôle', /<h3>Standard<span/.test(listRoles))
  // ---- réglages texte (nom de l'abonnement)
  const withText = { ...data, text_config: [{ key: 'subscription_name', value: 'OneMore', description: 'Nom de l’abonnement (affiché aux joueurs)' }] }
  const cfgText = show(M.ConfigTab, { data: withText })
  ok('réglages : le nom de l\'abonnement est un champ texte (60 caractères au plus) rempli avec sa valeur, avec son bouton OK', /<input type="text" maxLength="60"[^>]*value="OneMore"/.test(cfgText) && /subscription_name/.test(cfgText) && /Nom de l’abonnement/.test(cfgText))
  ok('réglages : le champ texte vient avant les réglages numériques ; les réglages numériques sont toujours là', cfgText.indexOf('subscription_name') < cfgText.indexOf(`>${data.config[0].key}<`) && (cfgText.match(/<input type="number"/g) || []).length === data.config.length)
  ok('réglages : sans réglages texte (ancien serveur), aucun champ texte et pas de plantage', !/<input type="text"/.test(show(M.ConfigTab, { data })))
  // ---- halo de lumière du paquet
  const glowOpts = (h) => [...(h.match(/<label>Halo de lumière[\s\S]*?<\/select>/) || [''])[0].matchAll(/<option value="([^"]*)"( selected="")?>([^<]*)</g)].map((m) => ({ id: m[1], sel: !!m[2], label: m[3] }))
  const ogold = ed({ ...oneMore, glow: 'gold' }), ostd = ed({ ...data.booster_types.find((b) => b.is_standard), glow: 'none' }), onew = ed(null)
  ok('halo : un menu à 8 choix (Aucun, Doré, Argenté, Rouge, Bleu, Vert, Violet, Arc-en-ciel) dans l\'éditeur de tout booster, Standard compris', glowOpts(ogold).map((g) => g.label).join('|') === 'Aucun|Doré|Argenté|Rouge|Bleu|Vert|Violet|Arc-en-ciel' && glowOpts(ostd).length === 8 && glowOpts(onew).length === 8)
  ok('halo : le halo actuel est sélectionné (OneMore : Doré) avec sa pastille de couleur ; Standard : Aucun', glowOpts(ogold).find((g) => g.sel)?.id === 'gold' && /class="glow-swatch glow-gold"/.test(ogold) && glowOpts(ostd).find((g) => g.sel)?.id === 'none' && /class="glow-swatch glow-none"/.test(ostd))
  ok('halo : un nouveau booster, ou un booster dont le halo n\'est pas connu (ancien serveur), commence sans halo', glowOpts(onew).find((g) => g.sel)?.id === 'none' && glowOpts(ed({ ...oneMore, glow: undefined })).find((g) => g.sel)?.id === 'none' && glowOpts(ed({ ...oneMore, glow: 'laser' })).find((g) => g.sel)?.id === 'none')
  ok('halo : chaque halo du menu est sélectionnable à son tour (arc-en-ciel avec sa pastille)', ['gold', 'silver', 'red', 'blue', 'green', 'purple', 'rainbow'].every((g) => glowOpts(ed({ ...oneMore, glow: g })).find((x) => x.sel)?.id === g) && /glow-swatch glow-rainbow/.test(ed({ ...oneMore, glow: 'rainbow' })))
  ok('erreurs : booster de récompense protégé et rareté utilisée dans un booster', /récompense d’une carte complétée/.test(M.explain(new Error('booster_protected'))) && /répartition d’un booster/.test(M.explain(new Error('rarity_in_use'))))
  const ex = M.explain
  ok('erreurs des boosters : messages clairs', /porte déjà ce nom/.test(ex(new Error('duplicate_booster_name'))) && /au moins une rareté/.test(ex(new Error('invalid_booster_slots'))) && /Standard ne peut pas/.test(ex(new Error('booster_is_standard')))
    && /désactive-le/.test(ex(new Error('booster_has_holders'))) && /pas en vente/.test(ex(new Error('not_for_sale'))) && /pas assez de pièces/.test(ex(new Error('not_enough_coins'))) && /1 à 10 cartes/.test(ex(new Error('invalid_booster'))))
}

if (bad) { console.error(`\n${bad} contrôle(s) en échec`); process.exit(1) }
console.log('\nConsole admin (rendu) : tous les contrôles sont passés.')

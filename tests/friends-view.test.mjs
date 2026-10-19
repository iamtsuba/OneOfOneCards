// Rend la page Amis, la collection d'un ami et la barre du bas sans navigateur.
//   node tests/friends-view.test.mjs
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-friends-'))
await build({
  stdin: { contents: "export { FriendsView, FriendCollectionView } from './src/components/Friends.jsx'; export { default as TabBar, TABS } from './src/components/TabBar.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', '@supabase/supabase-js'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { FriendsView, FriendCollectionView, TabBar, TABS, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }

const rarityMap = {
  common: { id: 'common', name: 'Commune', kind: 'range', sort_order: 7, color: '#d9d4c5', color2: '#b5ad99', text_color: '#222' },
  super: { id: 'super', name: 'Super Rare', kind: 'range', sort_order: 5, color: '#2563eb', color2: '#1e3a8a', text_color: '#fff' },
}
const types = [{ id: 1, category_id: 1, name: 'Chat va ?', image: '🐱', position: 1 }, { id: 2, category_id: 1, name: 'Le Pa Chat', image: '🧙', position: 2 }]
const catalog = { typeMap: Object.fromEntries(types.map((t) => [t.id, t])), categoryMap: {}, types, rarities: Object.values(rarityMap), numberHidden: () => false, cardRef: () => '', seriesOf: () => 100, checklist: (id) => ({ no: id, total: 2, secret: false }) }
const wrap = (el) => React.createElement(GameContext.Provider, { value: { catalog, rarityMap, rarities: Object.values(rarityMap) } }, el)
const noop = () => {}
const handlers = { onQuery: noop, onSearch: noop, onRequest: noop, onRespond: noop, onRemove: noop, onOpen: noop }

// ---- Barre du bas : Amis, Collection, Boosters, Marché, Profil
const bar = (props) => renderToStaticMarkup(React.createElement(TabBar, { tab: 'boosters', onChange: noop, boosters: 3, requests: 0, ...props }))
const labels = [...bar().matchAll(/<span>([^<]+)<\/span><\/button>/g)].map((m) => m[1])
ok('barre du bas : Amis, Collection, Boosters, Marché, Profil dans cet ordre', labels.join('|') === 'Amis|Collection|Boosters|Marché|Profil' && TABS.map((t) => t[0]).join() === 'friends,collection,boosters,market,profile')
ok('barre du bas : « Boosters » vient après « Collection », « Amis » avant', labels.indexOf('Collection') < labels.indexOf('Boosters') && labels.indexOf('Amis') < labels.indexOf('Collection'))
ok('barre du bas : pastille de boosters conservée, pas de pastille Amis sans demande', /tab-badge">3</.test(bar()) && !/demande/.test(bar()))
ok('barre du bas : pastille Amis avec le nombre de demandes (annoncée aux lecteurs d’écran)', /aria-label="2 demandes d’ami">2</.test(bar({ requests: 2 })) && /aria-label="1 demande d’ami">1</.test(bar({ requests: 1 })))
ok('barre du bas : l’onglet actif est marqué', /class="on" aria-current="page"><span class="tab-icon">/.test(bar({ tab: 'friends' })) && (bar({ tab: 'friends' }).match(/aria-current="page"/g) || []).length === 1)

// ---- Page Amis
const rows = [
  { friendship_id: 1, user_id: 'a', username: 'Zoé', relation: 'friend', cards: 6, doubles: 3, since: '2026-10-01' },
  { friendship_id: 2, user_id: 'b', username: 'Ben', relation: 'received', cards: 0, doubles: 0, since: '2026-10-02' },
  { friendship_id: 3, user_id: 'c', username: 'Cléo', relation: 'sent', cards: 0, doubles: 0, since: '2026-10-03' },
  { friendship_id: 4, user_id: 'd', username: 'Max', relation: 'friend', cards: 1, doubles: 1, since: '2026-10-04' },
  { friendship_id: 5, user_id: 'e', username: 'Léa', relation: 'friend', cards: 0, doubles: 0, since: '2026-10-05' },
]
const page = (props = {}) => renderToStaticMarkup(React.createElement(FriendsView, { rows, results: null, query: '', notice: '', error: '', busy: false, ...handlers, ...props }))
const h = page()
ok('page : titre « Amis » et champ de recherche par pseudo', /<h2 class="page-title">Amis<\/h2>/.test(h) && /placeholder="Pseudo du joueur"/.test(h))
ok('page : « Chercher » désactivé sous 2 caractères, actif à partir de 2', /<button type="button" class="btn" disabled="">Chercher<\/button>/.test(h) && !/disabled="">Chercher/.test(page({ query: 'be' })))
ok('page : demandes reçues (Accepter, Refuser), demandes envoyées (Annuler), puis les amis, dans cet ordre', h.indexOf('Demandes reçues') < h.indexOf('Demandes envoyées') && h.indexOf('Demandes envoyées') < h.indexOf('Mes amis') && />Accepter</.test(h) && />Refuser</.test(h) && />Annuler</.test(h))
ok('page : amis avec leur nombre de cartes et de doubles (pluriel et singulier)', /Zoé<\/strong><small class="muted">6 cartes · 3 doubles</.test(h) && /Max<\/strong><small class="muted">1 carte · 1 double</.test(h) && /Léa<\/strong><small class="muted">0 carte · 0 double</.test(h))
ok('page : « Mes amis (3) » compte seulement les amis, pas les demandes', /Mes amis \(3\)/.test(h))
ok('page : Voir et Retirer pour chaque ami (Retirer annoncé avec le nom)', (h.match(/>Voir</g) || []).length === 3 && /aria-label="Retirer Zoé"/.test(h))
ok('page : sans ami ni demande, une phrase d’aide', /Aucun ami pour l’instant\. Cherche un joueur par son pseudo ou envoie-lui ton lien d’invitation\./.test(page({ rows: [] })) && !/Demandes/.test(page({ rows: [] })))
ok('page : chargement tant que la liste n’est pas arrivée', /Chargement…/.test(page({ rows: null })) && !/Aucun ami/.test(page({ rows: null })))
const res = [
  { user_id: 'x', username: 'Ami_Nouveau', relation: 'none' }, { user_id: 'y', username: 'Ami_Envoyé', relation: 'sent' },
  { user_id: 'z', username: 'Ami_Reçu', relation: 'received' }, { user_id: 'w', username: 'Ami_Déjà', relation: 'friend' },
]
const hr = page({ results: res, query: 'ami' })
const resultsHtml = (hr.match(/<ul class="friend-rows" aria-label="Résultats">[\s\S]*?<\/ul>/) || [''])[0]
ok('résultats : Ajouter (inconnu), « Demande envoyée », Accepter (demande reçue), « Déjà ami »', />Ajouter</.test(resultsHtml) && /Demande envoyée/.test(resultsHtml) && />Accepter</.test(resultsHtml) && /Déjà ami/.test(resultsHtml) && (resultsHtml.match(/<button/g) || []).length === 2)
ok('résultats : aucun joueur trouvé', /Aucun joueur trouvé\./.test(page({ results: [], query: 'zz' })))
ok('page : message d’information et erreur annoncés', /role="status">Demande envoyée\./.test(page({ notice: 'Demande envoyée.' })) && /role="alert">Ce joueur n’existe pas\./.test(page({ error: 'Ce joueur n’existe pas.' })))
ok('page : boutons désactivés pendant une action', (page({ busy: true }).match(/disabled=""/g) || []).length >= 6)
ok('page : texte court (moins de 700 caractères visibles hors pseudos)', page({ rows: [] }).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').length < 700)
ok('page : aucune donnée parasite (undefined, NaN)', !/undefined|NaN|null/.test(h + hr))

// ---- Collection d'un ami
const card = (n, extra = {}) => ({ card_type: 1, card_base: 'common', card_series: 50, card_number: n, rarity_id: 'common', is_double: false, in_album: false, listing_id: null, ...extra })
const cards = [card(10, { in_album: true }), card(11, { is_double: true, i_own: true }), card(12, { is_double: true, listing_id: 7, i_own: false }), card(20, { card_type: 2, rarity_id: 'super', card_base: 'super' })]
const fc = (props = {}) => renderToStaticMarkup(wrap(React.createElement(FriendCollectionView, {
  friend: { user_id: 'a', username: 'Bea' }, cards, total: 4, doublesTotal: 2, doublesOnly: false, loading: false, error: '', rarityMap, onToggle: noop, onPick: noop, onMore: noop, onBack: noop, ...props })))
const v = fc()
ok('collection d’un ami : titre, retour, deux onglets Toutes (4) et Doubles (2)', /Collection de Bea/.test(v) && />← Amis</.test(v) && /aria-selected="true" class="on">Toutes \(4\)</.test(v) && /aria-selected="false" class="">Doubles \(2\)</.test(v))
ok('collection d’un ami : l’onglet Doubles actif', /aria-selected="true" class="on">Doubles \(2\)</.test(fc({ doublesOnly: true, total: 2 })) && /aria-selected="false" class="">Toutes</.test(fc({ doublesOnly: true, total: 2 })))
ok('collection d’un ami : une tuile par carte, les doubles seuls sont cliquables (offre)', (v.match(/class="friend-card[" ]/g) || []).length === 4 && (v.match(/class="friend-card double"/g) || []).length === 2 && (v.match(/<button type="button" class="friend-card"[^>]*disabled=""/g) || []).length === 2)
ok('collection d’un ami : étiquette « Double » sur chaque double, plus « En vente » quand il est annoncé', (v.match(/friend-tag">Double</g) || []).length === 2 && (v.match(/friend-tag sale">En vente</g) || []).length === 1)
ok('collection d’un ami : les cartes sont annoncées (rareté, double, album, en vente)', /aria-label="Commune, dans son album"/.test(v) && /aria-label="Commune, double, déjà possédé"/.test(v) && /aria-label="Commune, double, en vente, il te manque"/.test(v) && /aria-label="Super Rare"/.test(v))
ok('collection d’un ami : « Déjà possédé » sur un double dont tu as déjà l’emplacement, « Manquante » sinon', (v.match(/friend-tag owned">Déjà possédé</g) || []).length === 1 && (v.match(/friend-tag missing">Manquante</g) || []).length === 1)
ok('collection d’un ami : « Déjà possédé » n’empêche pas l’offre (la tuile reste cliquable)', (() => { const tile = v.split('<li>').find((x) => x.includes('Déjà possédé')); return !!tile && /class="friend-card double"/.test(tile) && !/disabled=""/.test(tile.split('>')[0] + '>') })())
ok('collection d’un ami : pas de marqueur sur les cartes qui ne sont pas des doubles (album, carte seule)', v.split('<li>').filter((x) => !x.includes('friend-card double')).every((x) => !/Déjà possédé|Manquante/.test(x)))
ok('collection d’un ami : serveur sans l’information (i_own absent) : aucun marqueur, offre toujours possible', (() => { const h = fc({ cards: cards.map(({ i_own, ...c }) => c) }); return !/Déjà possédé|Manquante/.test(h) && (h.match(/class="friend-card double"/g) || []).length === 2 })())
ok('collection d’un ami : une invitation courte à toucher un double', /Touche un double pour proposer une offre à Bea\./.test(v))
ok('collection d’un ami : « Voir plus » quand il reste des cartes, absent sinon', /Voir plus \(3\)/.test(fc({ total: 7 })) && !/Voir plus/.test(v))
ok('collection d’un ami : messages vides (aucun double, aucune carte), chargement, erreur', /Bea n’a aucun double pour le moment\./.test(fc({ cards: [], total: 0, doublesTotal: 0, doublesOnly: true })) && /Bea n’a aucune carte pour le moment\./.test(fc({ cards: [], total: 0, doublesTotal: 0 })) && /Chargement…/.test(fc({ cards: null, loading: true })) && /role="alert">Tu dois d’abord être ami/.test(fc({ error: 'Tu dois d’abord être ami avec ce joueur.' })))
ok('collection d’un ami : aucune donnée parasite (undefined, NaN)', !/undefined|NaN|null/.test(v))

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nAmis (rendu) : tous les contrôles sont passés.')

// Marché > Favoris : « manque à ton album » / « déjà dans ton album », bouton « Faire une offre » (formulaire d'offre jusqu'à l'envoi), avec jsdom.
//   node tests/market-favorites.test.mjs
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { JSDOM, VirtualConsole } from 'jsdom'

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://pp.1o1cards.cc/', pretendToBeVisual: true, virtualConsole: new VirtualConsole() })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })
const rpc = []
let offerFail = false
globalThis.fetch = async (url, init) => {
  const u = String(url); const body = init?.body ? JSON.parse(init.body) : {}
  if (u.includes('make_offer')) { rpc.push(['make_offer', body]); return offerFail ? json({ message: 'own_card' }, 400) : json({ offer_id: 7 }) }
  if (u.includes('toggle_favorite')) { rpc.push(['toggle_favorite', body]); return json({ favorited: false }) }
  return json([])
}

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-fav-'))
await build({
  stdin: { contents: "export { FavoritesPanel } from './src/components/Market.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = React
const { FavoritesPanel, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
const noop = () => {}

const rarityMap = { common: { id: 'common', name: 'Commune', kind: 'range', sort_order: 7, color: '#d9d4c5', color2: '#b5ad99', text_color: '#222' }, rare: { id: 'rare', name: 'Rare', kind: 'range', sort_order: 6, color: '#0a9d5c', color2: '#066b3d', text_color: '#fff' } }
const types = [{ id: 1, category_id: 1, name: 'CHAT’LET', image: '🐱' }, { id: 2, category_id: 1, name: 'CHAT PASSE', image: '🐶' }, { id: 3, category_id: 1, name: 'CHAT NOIR', image: '🐈‍⬛' }, { id: 4, category_id: 1, name: 'CHAT BLANC', image: '🐈' }]
const catalog = { typeMap: Object.fromEntries(types.map((t) => [t.id, t])), categoryMap: { 1: { id: 1, name: 'Chat’trapez', closed: false } }, cardRef: (id, base, n, s) => ` ${n}/${s}`, numberHidden: () => false, cardStyle: () => 'simple', checklist: (id) => ({ no: id, total: 4, secret: false }) }
const row = (over) => ({ card_type: 1, card_base: 'common', card_series: 5, card_number: 3, rarity_id: 'common', owner_id: 'u2', owner_name: 'IamTsuba', listing_id: null, listing_kind: null, listing_price: null, created_at: '2026-10-20', is_mine: false, i_own: false, ...over })
const rows = [
  row({ card_type: 1, listing_id: 9, listing_kind: 'buy_now', listing_price: 150, i_own: false }),                 // en vente, me manque
  row({ card_type: 2, i_own: true }),                                                                              // chez un joueur, je l'ai déjà
  row({ card_type: 3, owner_id: null, owner_name: null, i_own: false }),                                           // encore dans les boosters
  row({ card_type: 4, owner_id: 'me', owner_name: 'Moi', is_mine: true, i_own: true }),                            // ma carte
]
const mount = async (props = {}) => {
  const host = document.createElement('div'); document.body.appendChild(host)
  const reactRoot = createRoot(host)
  const calls = { listing: [], market: 0, reload: 0 }
  await act(async () => { reactRoot.render(React.createElement(GameContext.Provider, { value: { catalog, rarityMap, status: { direct_sell_price: 1, closed_categories: [] }, setStatus: noop } }, React.createElement(FavoritesPanel, { rows, loading: false, rarityMap, catalog, reload: async () => { calls.reload++ }, onOpenListing: (id) => calls.listing.push(id), onGoMarket: () => { calls.market++ }, ...props }))) })
  return { host, calls, unmount: async () => { await act(async () => reactRoot.unmount()); host.remove() } }
}
const items = (h) => [...h.querySelectorAll('.mine-list > li')]
const li = (h, name) => items(h).find((x) => x.textContent.includes(name))
const btn = (el, re) => [...el.querySelectorAll('button')].find((b) => re.test(b.textContent))
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) }) }

const m = await mount()
ok('4 favoris listés', items(m.host).length === 4)
ok('carte en vente qui me manque : « Manque à ton album » (vert), prix de l\'annonce, « Voir l\'annonce »', !!li(m.host, 'CHAT’LET').querySelector('.friend-tag.missing') && /Manque à ton album/.test(li(m.host, 'CHAT’LET').textContent) && /En vente à/.test(li(m.host, 'CHAT’LET').textContent) && !!btn(li(m.host, 'CHAT’LET'), /Voir l’annonce/))
ok('carte d\'un joueur dont j\'ai déjà l\'emplacement : « Déjà dans ton album » (gris), pas en vente', !!li(m.host, 'CHAT PASSE').querySelector('.friend-tag.owned') && /Déjà dans ton album/.test(li(m.host, 'CHAT PASSE').textContent) && /Possédée par IamTsuba, pas en vente/.test(li(m.host, 'CHAT PASSE').textContent))
ok('carte encore dans les boosters : elle manque (« Manque à ton album »)', /Manque à ton album/.test(li(m.host, 'CHAT NOIR').textContent) && /Encore dans les boosters/.test(li(m.host, 'CHAT NOIR').textContent))
ok('ma propre carte en favori : « C\'est ta carte », pas de « Manque » ni de « Déjà dans ton album »', /C’est ta carte/.test(li(m.host, 'CHAT BLANC').textContent) && !/Manque|Déjà dans ton album/.test(li(m.host, 'CHAT BLANC').textContent))
ok('« Faire une offre » : quand un autre joueur possède la carte (en vente ou non), jamais pour une carte encore dans les boosters ni pour ma carte', !!btn(li(m.host, 'CHAT’LET'), /Faire une offre/) && !!btn(li(m.host, 'CHAT PASSE'), /Faire une offre/) && !btn(li(m.host, 'CHAT NOIR'), /Faire une offre/) && !btn(li(m.host, 'CHAT BLANC'), /Faire une offre/))
ok('« Retirer des favoris » toujours présent pour chaque carte', items(m.host).every((x) => !!btn(x, /Retirer des favoris/)))
ok('mise en avant : « Faire une offre » est le bouton principal quand la carte n\'est pas en vente ; secondaire quand une annonce existe', /accent/.test(btn(li(m.host, 'CHAT PASSE'), /Faire une offre/).className) && /ghost/.test(btn(li(m.host, 'CHAT’LET'), /Faire une offre/).className))
await click(btn(li(m.host, 'CHAT’LET'), /Voir l’annonce/))
ok('« Voir l\'annonce » ouvre bien l\'annonce 9', m.calls.listing.join() === '9')

await click(btn(li(m.host, 'CHAT PASSE'), /Faire une offre/))
const dlg = () => m.host.querySelector('[role="dialog"][aria-label="Détail de la carte"]')
ok('« Faire une offre » ouvre la fiche de la carte avec le formulaire d\'offre à son propriétaire', !!dlg() && /Faire une offre/.test(dlg().textContent) && /Propose un prix à IamTsuba/.test(dlg().textContent) && !!dlg().querySelector('input[type="number"]'))
ok('la fiche dit que la carte est déjà dans l\'album (CHAT PASSE : i_own vrai)', /Tu as déjà une carte de cet emplacement dans ton album/.test(dlg().textContent))
ok('envoi impossible sans montant, possible avec un montant', btn(dlg(), /Envoyer l’offre/).disabled === true)
await act(async () => { const inp = dlg().querySelector('input[type="number"]'); Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(inp, '12'); inp.dispatchEvent(new window.Event('input', { bubbles: true })) })
ok('avec 12 pièces, « Envoyer l\'offre » s\'active', btn(dlg(), /Envoyer l’offre/).disabled === false)
await click(btn(dlg(), /Envoyer l’offre/)); await wait(40)
ok('l\'offre part au serveur avec la bonne carte et le bon montant (type 2, Commune 3/5, 12 pièces)', rpc.some((c) => c[0] === 'make_offer' && c[1].p_type === 2 && c[1].p_base === 'common' && c[1].p_series === 5 && c[1].p_number === 3 && c[1].p_amount === 12))
ok('confirmation « Offre envoyée à IamTsuba »', /Offre envoyée à IamTsuba/.test(dlg().textContent))
await click(dlg())   // le fond ferme la fiche
ok('toucher le fond ferme la fiche', !dlg())

await click(btn(li(m.host, 'CHAT’LET'), /Faire une offre/))
ok('carte en vente qui me manque : la fiche dit « Cette carte manque à ton album »', /Cette carte manque à ton album/.test(dlg().textContent))
const nOffers = rpc.filter((c) => c[0] === 'make_offer').length
offerFail = true
await act(async () => { const inp = dlg().querySelector('input[type="number"]'); Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(inp, '5'); inp.dispatchEvent(new window.Event('input', { bubbles: true })) })
await click(btn(dlg(), /Envoyer l’offre/)); await wait(40)
ok('offre refusée par le serveur (ta propre carte…) : message d\'erreur clair dans la fiche, pas de confirmation', rpc.filter((c) => c[0] === 'make_offer').length === nOffers + 1 && !!dlg().querySelector('[role="alert"]') && !/Offre envoyée/.test(dlg().textContent))
offerFail = false
await click(btn(dlg(), /Aller au marché/))
ok('« Aller au marché » ferme la fiche et ouvre l\'onglet « À vendre »', !dlg() && m.calls.market === 1)

await click(btn(li(m.host, 'CHAT PASSE'), /Retirer des favoris/)); await wait(30)
ok('« Retirer des favoris » retire la carte (appel serveur puis rechargement de la liste)', rpc.some((c) => c[0] === 'toggle_favorite' && c[1].p_type === 2) && m.calls.reload >= 1)
await m.unmount()

// anciens serveurs (sans i_own ni is_mine) : aucune mention, le bouton d'offre reste là
const old = [{ ...row({ card_type: 2 }), is_mine: undefined, i_own: undefined }]
const m2 = await mount({ rows: old })
ok('serveur de la version précédente : aucune mention « manque / déjà », pas de plantage, « Faire une offre » disponible', !m2.host.querySelector('.friend-tag') && !!btn(m2.host, /Faire une offre/) && !/undefined|NaN/.test(m2.host.textContent))
await m2.unmount()
const m3 = await mount({ rows: [] })
ok('aucun favori : le message d\'aide habituel', /Aucun favori pour l’instant/.test(m3.host.textContent) && !m3.host.querySelector('.mine-list'))
await m3.unmount()

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nMarché, favoris : tous les contrôles sont passés.')
process.exit(0)

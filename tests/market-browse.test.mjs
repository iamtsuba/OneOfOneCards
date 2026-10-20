// Marché > À vendre : filtre « Non possédées », filtre par rareté, pastille « Non possédée », état vide avec filtres, appel serveur, avec jsdom.
//   node tests/market-browse.test.mjs
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
const listing = (id, type, base, rid, extra = {}) => ({ listing_id: id, card_type: type, card_base: base, card_series: 5, card_number: 3, rarity_id: rid, seller_name: 'IamTsuba', kind: 'buy_now', price: 50, current_bid: null, bid_count: 0, ends_at: null, min_bid: null, is_mine: false, is_leading: false, total: 4, server_now: '2026-10-20T12:00:00Z', i_own: false, ...extra })
const ALL = [listing(1, 1, 'common', 'common', { i_own: true }), listing(2, 1, 'rare', 'rare'), listing(3, 2, 'common', 'common', { kind: 'auction', price: 5, ends_at: '2026-10-20T13:00:00Z', min_bid: 5 }), listing(4, 2, 'rare', 'rare', { i_own: true })]
let serverRows = ALL
globalThis.fetch = async (url, init) => {
  const u = String(url); const body = init?.body ? JSON.parse(init.body) : {}
  if (u.includes('market_list')) { rpc.push(body); return json(serverRows) }
  return json([])
}

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-mb-'))
await build({
  stdin: { contents: "export { BrowsePanel, default as Market } from './src/components/Market.jsx'; export { GameContext } from './src/game.js'; export * as api from './src/api.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { createRoot } = require('react-dom/client')
const { renderToStaticMarkup } = require('react-dom/server')
const { act } = React
const { BrowsePanel, Market, GameContext, api } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
const noop = () => {}
const R = (id, name, kind, order) => ({ id, name, kind, sort_order: order, color: '#ccc', color2: '#999', text_color: '#222' })
const rarityMap = { common: R('common', 'Commune', 'range', 7), rare: R('rare', 'Rare', 'range', 6), artrare: R('artrare', 'Art Rare', 'range', 4), alpha: R('alpha', 'Alpha', 'alpha', 2), unique: R('unique', 'Unique', 'unique', 1) }
const types = [{ id: 1, category_id: 1, name: 'CHAT’LET', image: '🐱' }, { id: 2, category_id: 1, name: 'CHAT PASSE', image: '🐶' }]
const catalog = { typeMap: Object.fromEntries(types.map((t) => [t.id, t])), categoryMap: { 1: { id: 1, name: 'Chats', closed: false } }, cardRef: () => '', numberHidden: () => false, cardStyle: () => 'simple', checklist: (id) => ({ no: id, total: 2, secret: false }) }
const html = (props = {}) => renderToStaticMarkup(React.createElement(GameContext.Provider, { value: { catalog, rarityMap } }, React.createElement(BrowsePanel, { rows: ALL, loading: false, kind: null, setKind: noop, sort: 'ending', setSort: noop, rarity: '', setRarity: noop, missing: false, setMissing: noop, rarityMap, catalog, left: () => null, onSelect: noop, ...props })))
const norm = (h) => h.replace(/\s+/g, ' ')

// ---------- rendu ----------
const h = html()
ok('pastille « Non possédée » sur chaque carte que je n\'ai pas (2 sur 4) et seulement sur celles-là', (h.match(/tile-flag missing">Non possédée</g) || []).length === 2 && h.indexOf('CHAT’LET') < h.indexOf('tile-flag missing'))
ok('pas de pastille quand la carte est à moi, quand c\'est ma vente, ni sans information (ancien serveur)', !/tile-flag missing/.test(html({ rows: [listing(1, 1, 'common', 'common', { i_own: true })] })) && !/tile-flag missing/.test(html({ rows: [listing(1, 1, 'common', 'common', { i_own: undefined })] })) && !/tile-flag missing/.test(html({ rows: [listing(1, 1, 'common', 'common', { i_own: true, is_mine: true })] })))
ok('les pastilles existantes sont gardées (« Ta vente », « Tu es en tête ») ; « Non possédée » peut s\'y ajouter', /Ta vente/.test(html({ rows: [listing(1, 1, 'common', 'common', { i_own: true, is_mine: true })] })) && /Tu es en tête/.test(html({ rows: [listing(1, 1, 'rare', 'rare', { is_leading: true })] })) && /Tu es en tête[\s\S]*tile-flag missing/.test(html({ rows: [listing(1, 1, 'rare', 'rare', { is_leading: true })] })))
ok('puce « Non possédées » après Toutes, Enchères, Achat direct (activée ou non)', /Toutes<\/button><button[^>]*>Enchères<\/button><button[^>]*>Achat direct<\/button><button class="chip " aria-pressed="false">Non possédées<\/button>/.test(h) && /class="chip on" aria-pressed="true">Non possédées</.test(html({ missing: true })))
const opts = (hh) => [...(hh.match(/<span class="sr">Filtrer par rareté<\/span><select[\s\S]*?<\/select>/) || [''])[0].matchAll(/<option value="([^"]*)"[^>]*>([^<]*)</g)].map((m) => `${m[1]}=${m[2]}`)
ok('filtre par rareté : « Toutes les raretés » puis TOUTES les raretés existantes, de la plus répandue à la plus rare (Art Rare, Alpha, Unique comprises)', opts(h).join('|') === '=Toutes les raretés|common=Commune|rare=Rare|artrare=Art Rare|alpha=Alpha|unique=Unique')
ok('une rareté créée plus tard apparaît toute seule dans le filtre', opts(html({ rarityMap: { ...rarityMap, ultra: R('ultra', 'Ultra Rare', 'range', 5) } })).includes('ultra=Ultra Rare'))
ok('rareté choisie sélectionnée dans le menu', /<option value="rare" selected="">Rare</.test(html({ rarity: 'rare' })))
const empty = html({ rows: [], missing: true })
ok('aucun résultat avec un filtre actif : « Aucune annonce ne correspond à ces filtres » et un bouton pour les retirer', /Aucune annonce ne correspond à ces filtres/.test(empty) && />Retirer les filtres</.test(empty) && !/Ouvre ta collection/.test(empty))
ok('aucune annonce du tout (sans filtre) : le message habituel, sans bouton de filtres', /Aucune annonce pour l’instant/.test(html({ rows: [] })) && !/Retirer les filtres/.test(html({ rows: [] })))
ok('compteur d\'annonces : 4 annonces ; « Chargement… » pendant le chargement', /4 annonces/.test(h) && /Chargement…/.test(html({ loading: true })))

// ---------- appel serveur : filtres envoyés seulement quand ils sont actifs ----------
ok('sans filtre, l\'appel est celui d\'avant (compatible avec un serveur plus ancien)', await (async () => { rpc.length = 0; await api.marketList({ kind: null, sort: 'ending', limit: 60 }); const b = rpc[0]; return !('p_rarity' in b) && !('p_missing' in b) && b.p_limit === 60 })())
ok('filtres actifs : p_rarity et p_missing envoyés', await (async () => { rpc.length = 0; await api.marketList({ rarity: 'rare', missing: true }); return rpc[0].p_rarity === 'rare' && rpc[0].p_missing === true })())

// ---------- page réelle : cliquer sur les filtres relance la recherche côté serveur ----------
const mount = async () => {
  const host = document.createElement('div'); document.body.appendChild(host)
  const reactRoot = createRoot(host)
  await act(async () => { reactRoot.render(React.createElement(GameContext.Provider, { value: { status: { coins: 100, coins_locked: 0, direct_sell_price: 1 }, setStatus: noop, refreshStatus: async () => ({}), rarityMap, catalog } }, React.createElement(Market))) })
  await wait(60)
  return { host, unmount: async () => { await act(async () => reactRoot.unmount()); host.remove() } }
}
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) }); await wait(60) }
const change = async (el, v) => { await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new window.Event('change', { bubbles: true })) }); await wait(60) }
{
  rpc.length = 0
  const m = await mount()
  ok('la page affiche les 4 annonces et les 2 pastilles « Non possédée »', m.host.querySelectorAll('.tiles > li').length === 4 && m.host.querySelectorAll('.tile-flag.missing').length === 2)
  serverRows = ALL.filter((r) => !r.i_own)
  await click([...m.host.querySelectorAll('.chip')].find((b) => b.textContent === 'Non possédées'))
  ok('« Non possédées » : nouvelle recherche avec p_missing, la liste ne garde que les cartes manquantes, la puce est activée', rpc.at(-1).p_missing === true && m.host.querySelectorAll('.tiles > li').length === 2 && [...m.host.querySelectorAll('.chip')].find((b) => b.textContent === 'Non possédées').getAttribute('aria-pressed') === 'true')
  serverRows = ALL.filter((r) => !r.i_own && r.rarity_id === 'rare')
  await change(m.host.querySelector('.toolbar-selects select'), 'rare')
  ok('rareté « Rare » en plus : recherche avec p_rarity = rare ET p_missing, une seule annonce', rpc.at(-1).p_rarity === 'rare' && rpc.at(-1).p_missing === true && m.host.querySelectorAll('.tiles > li').length === 1)
  serverRows = []
  await change(m.host.querySelector('.toolbar-selects select'), 'unique')
  ok('aucun résultat : message « ne correspond à ces filtres »', /ne correspond à ces filtres/.test(m.host.textContent))
  serverRows = ALL
  await click([...m.host.querySelectorAll('button')].find((b) => b.textContent === 'Retirer les filtres'))
  ok('« Retirer les filtres » : retour à toutes les annonces, filtres désactivés, appel sans filtre', !('p_missing' in rpc.at(-1)) && !('p_rarity' in rpc.at(-1)) && m.host.querySelectorAll('.tiles > li').length === 4 && m.host.querySelector('.toolbar-selects select').value === '')
  const nb = rpc.length
  await click([...m.host.querySelectorAll('.chip')].find((b) => b.textContent === 'Enchères'))
  ok('le type d\'annonce se combine avec les filtres (appel avec p_kind = auction)', rpc.length > nb && rpc.at(-1).p_kind === 'auction')
  await m.unmount()
}

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nMarché, à vendre (filtres) : tous les contrôles sont passés.')
process.exit(0)

// Marché : confirmation « elle est dans ton album » après un achat au prix fixe ou l'acceptation d'une contre-offre par l'acheteur, avec jsdom.
//   node tests/market-album.test.mjs
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
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
let placed = true
let fail = null
globalThis.fetch = async (url, init) => {
  const u = String(url); const body = init?.body ? JSON.parse(init.body) : {}
  const fn = ['buy_now', 'cancel_listing', 'respond_offer', 'counter_offer', 'cancel_offer'].find((n) => u.includes(n))
  if (fn) {
    rpc.push([fn, body])
    if (fail && fail.fn === fn) return json({ message: fail.message }, 400)
    if (fn === 'buy_now') return json({ status: { coins: 90 }, placed })
    if (fn === 'respond_offer') return json(body.p_accept ? { status: { coins: 90 }, placed } : { status: { coins: 90 } })   // un refus ne renvoie pas « placed »
    return json(fn === 'cancel_listing' || fn === 'cancel_offer' ? { ok: true } : { status: { coins: 90 } })
  }
  return json([])
}

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-malb-'))
await build({
  stdin: { contents: "export { OffersPanel, ListingModal, boughtMessage } from './src/components/Market.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = React
const { OffersPanel, ListingModal, boughtMessage, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const noop = () => {}
const wait = (ms = 30) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) }); await wait(40) }
const btn = (el, re) => [...el.querySelectorAll('button')].find((b) => re.test(b.textContent))
const rarityMap = { common: { id: 'common', name: 'Commune', kind: 'range', sort_order: 7, color: '#d9d4c5', color2: '#b5ad99', text_color: '#222' } }
const types = [{ id: 1, category_id: 1, name: 'CHATON', image: '🐱' }]
const catalog = { typeMap: { 1: types[0] }, categoryMap: { 1: { id: 1, name: 'Chat', closed: false } }, cardRef: (id, base, n, s) => ` ${n}/${s}`, numberHidden: () => false, cardStyle: () => 'simple', checklist: () => null, typeConfig: () => [], rarityConfig: () => [] }
const mount = async (node) => {
  const host = document.createElement('div'); document.body.appendChild(host); const r = createRoot(host)
  await act(async () => { r.render(React.createElement(GameContext.Provider, { value: { catalog, rarityMap, status: { coins: 100 }, setStatus: noop } }, node)) })
  await wait(20)
  return { host, unmount: async () => { await act(async () => r.unmount()); host.remove() } }
}

// ---------- le message ----------
ok('message : « Carte achetée : elle est dans ton album. » si la carte a été rangée, sinon « Carte achetée. » (emplacement déjà occupé, ancien serveur, réponse vide)', boughtMessage({ placed: true }) === 'Carte achetée : elle est dans ton album.' && boughtMessage({ placed: false }) === 'Carte achetée.' && boughtMessage({}) === 'Carte achetée.' && boughtMessage(undefined) === 'Carte achetée.' && boughtMessage(null) === 'Carte achetée.')

// ---------- achat au prix fixe ----------
const listing = (over) => ({ listing_id: 7, kind: 'buy_now', price: 10, card_type: 1, card_base: 'common', card_series: 5, card_number: 3, rarity_id: 'common', seller_name: 'Bea', role: 'buyer', is_mine: false, bid_count: 0, ...over })
const modal = (over, handlers) => React.createElement(ListingModal, { row: listing(over), ms: null, rarity: rarityMap.common, coins: 100, onClose: handlers.close, onStatus: handlers.status, onBought: handlers.onBought, reload: handlers.reload })
const handlers = () => { const h = { closed: 0, statuses: [], bought: [], reloads: 0 }; h.close = () => { h.closed++ }; h.status = (s) => h.statuses.push(s); h.onBought = (r) => h.bought.push(r); h.reload = async () => { h.reloads++ }; return h }
{
  placed = true; rpc.length = 0
  const h = handlers(); const m = await mount(modal({}, h))
  await click(btn(m.host, /^Acheter pour/))
  ok('achat : buy_now appelé pour l\'annonce 7, la fenêtre se ferme, le statut et la liste sont mis à jour', rpc.length === 1 && rpc[0][0] === 'buy_now' && rpc[0][1].p_id === 7 && h.closed === 1 && h.statuses.length === 1 && h.reloads >= 1)
  ok('la page est prévenue avec la réponse du serveur (carte placée dans l\'album : placed = vrai)', h.bought.length === 1 && h.bought[0].placed === true)
  await m.unmount()
}
{
  placed = false
  const h = handlers(); const m = await mount(modal({}, h))
  await click(btn(m.host, /^Acheter pour/))
  ok('emplacement déjà occupé : la page est prévenue avec placed = faux (message simple « Carte achetée. »)', h.bought.length === 1 && h.bought[0].placed === false && boughtMessage(h.bought[0]) === 'Carte achetée.')
  await m.unmount()
}
{
  const h = handlers(); const m = await mount(modal({ is_mine: true, role: 'seller' }, h))
  rpc.length = 0
  await click(btn(m.host, /^Retirer de la vente$/))
  ok('retirer MA propre annonce : la fenêtre se ferme mais AUCUN « Carte achetée » (la page n\'est pas prévenue d\'un achat)', rpc[0][0] === 'cancel_listing' && h.closed === 1 && h.bought.length === 0)
  await m.unmount()
}
{
  fail = { fn: 'buy_now', message: 'insufficient_coins' }
  const h = handlers(); const m = await mount(modal({}, h))
  await click(btn(m.host, /^Acheter pour/))
  ok('achat refusé : la fenêtre reste ouverte avec le message d\'erreur, aucune confirmation d\'achat', h.closed === 0 && h.bought.length === 0 && !!m.host.querySelector('[role="alert"]'))
  fail = null
  await m.unmount()
}

// ---------- contre-offre acceptée par l'acheteur ----------
const row = (over) => ({ offer_id: 1, card_type: 1, card_base: 'common', card_series: 5, card_number: 3, rarity_id: 'common', role: 'buyer', counterpart_name: 'Bea', amount: 20, status: 'pending', created_at: new Date().toISOString(), responded_at: null, proposed_by_me: false, waiting_on_me: true, rounds: 1, ...over })
const panel = (rows) => React.createElement(OffersPanel, { rows, loading: false, rarityMap, catalog, status: { coins: 100 }, setStatus: noop, reload: async () => {} })
{
  placed = true; rpc.length = 0
  const m = await mount(panel([row()]))
  await click(btn(m.host, /^Accepter$/))
  ok('l\'acheteur accepte la contre-offre : respond_offer (accepter), puis « Carte achetée : elle est dans ton album. » s\'affiche', rpc[0][0] === 'respond_offer' && rpc[0][1].p_accept === true && /Carte achetée : elle est dans ton album\./.test(m.host.querySelector('[role="status"]')?.textContent ?? ''))
  await m.unmount()
  placed = false
  const m2 = await mount(panel([row()]))
  await click(btn(m2.host, /^Accepter$/))
  ok('emplacement déjà occupé (placed = faux) : aucun message d\'album', !m2.host.querySelector('[role="status"]'))
  await m2.unmount()
  placed = true
  const m3 = await mount(panel([row()]))
  await click(btn(m3.host, /^Refuser$/))
  ok('refuser : respond_offer (refuser) et aucun message d\'album', rpc.at(-1)[1].p_accept === false && !m3.host.querySelector('[role="status"]'))
  await m3.unmount()
  const m4 = await mount(panel([row()]))
  await click(btn(m4.host, /^Accepter$/))
  const had = !!m4.host.querySelector('[role="status"]')
  fail = { fn: 'respond_offer', message: 'offer_unavailable' }
  await click(btn(m4.host, /^Accepter$/))
  ok('l\'ancien message disparaît à l\'action suivante ; une erreur n\'affiche jamais « dans ton album »', had && !m4.host.querySelector('[role="status"]') && !!m4.host.querySelector('[role="alert"]'))
  fail = null
  await m4.unmount()
}

// ---------- branchement dans la page ----------
{
  const src = readFileSync(path.join(root, 'src/components/Market.jsx'), 'utf8')
  ok('la page Marché affiche la confirmation après un achat (bandeau) et la fermeture par « Retirer de la vente » reste distincte', /onBought=\{\(res\) => setBought\(boughtMessage\(res\)\)\}/.test(src) && /\{bought && <p className="msg info" role="status">\{bought\}<\/p>\}/.test(src) && /api\.buyNow\(row\.listing_id\), 'bought'\)/.test(src) && /api\.cancelListing\(row\.listing_id\), 'close'\)/.test(src))
}

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nMarché > album : tous les contrôles sont passés.')
process.exit(0)

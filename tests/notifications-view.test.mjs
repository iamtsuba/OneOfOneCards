// Cloche de notifications : offres reçues, acceptées, refusées et NÉGOCIÉES (contre-offre reçue, contre-offre acceptée, contre-offre refusée), avec jsdom.
//   node tests/notifications-view.test.mjs
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
const now = new Date().toISOString()
const n = (id, kind, extra = {}) => ({ id, kind, card_type: 1, card_base: 'common', card_series: 5, card_number: 3, listing_id: null, offer_id: 10 + id, amount: 30, actor_name: 'Bea', read: false, created_at: now, unread_total: 6, ...extra })
const items = [n(1, 'offer_received'), n(2, 'offer_accepted'), n(3, 'offer_declined'), n(4, 'offer_countered', { amount: 45 }), n(5, 'offer_sold', { amount: 45, actor_name: 'Tom' }), n(6, 'offer_counter_declined', { amount: 45, actor_name: 'Tom' }), n(7, 'favorite_listed', { listing_id: 9, amount: 12 })]
const rpc = []
globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (u.includes('notifications_list')) return json(items)
  if (u.includes('notifications_mark_read')) { rpc.push(['mark_read', JSON.parse(init?.body ?? '{}')]); return json({}) }
  return json([])
}

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-notif-'))
await build({
  stdin: { contents: "export { default as NotificationBell } from './src/components/NotificationBell.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = React
const { NotificationBell, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const norm = (t) => t.replace(/\u202f|\u00a0/g, ' ')
const wait = (ms = 40) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) }); await wait(30) }

const catalog = { typeMap: { 1: { id: 1, name: 'CHATON' } }, cardRef: (id, base, num, s) => ` ${num}/${s}` }
const opened = { offers: 0, listing: [] }
const host = document.createElement('div'); document.body.appendChild(host)
const r = createRoot(host)
await act(async () => { r.render(React.createElement(GameContext.Provider, { value: { catalog, status: {} } }, React.createElement(NotificationBell, { onOpenListing: (id) => opened.listing.push(id), onOpenOffers: () => { opened.offers++ } }))) })
await wait(80)
await click(host.querySelector('.bell-btn'))
const lis = [...host.querySelectorAll('.bell-list li')]
const text = (i) => norm(lis[i].textContent)
const icon = (i) => lis[i].querySelector('.bell-icon').textContent
ok('7 notifications listées', lis.length === 7)
ok('offre reçue (comme avant)', /Bea te propose 30 pièces pour ta carte CHATON \(3\/5\)\./.test(text(0)))
ok('offre acceptée / refusée (comme avant), au prix demandé', /Ton offre de 30 pièces pour CHATON \(3\/5\) a été acceptée : la carte est à toi\./.test(text(1)) && /Ton offre de 30 pièces pour CHATON \(3\/5\) a été refusée\./.test(text(2)))
ok('contre-offre reçue : « Bea te fait une contre-offre de 45 pièces pour CHATON (3/5). »', /Bea te fait une contre-offre de 45 pièces pour CHATON \(3\/5\)\./.test(text(3)))
ok('contre-offre acceptée par l\'autre joueur : la carte est vendue, au prix négocié (45), avec son pseudo', /Tom a accepté ta contre-offre de 45 pièces pour CHATON \(3\/5\) : la carte est vendue\./.test(text(4)))
ok('contre-offre refusée : « Tom a refusé ta contre-offre de 45 pièces… »', /Tom a refusé ta contre-offre de 45 pièces pour CHATON \(3\/5\)\./.test(text(5)))
ok('chaque type de notification a sa pastille (pas de « • » par défaut pour les nouveaux)', [3, 4, 5].every((i) => icon(i) !== '•' && icon(i) !== '') && icon(3) !== icon(0))
ok('aucun texte vide ni « undefined » pour aucun type', lis.every((_, i) => text(i).length > 20 && !/undefined|null/.test(text(i))))
rpc.length = 0
await click(lis[3].querySelector('button'))
ok('cliquer sur une contre-offre reçue : marque lue et ouvre l\'onglet des offres du Marché', opened.offers === 1 && rpc.length === 1 && rpc[0][1].p_ids[0] === 4)
await click(host.querySelector('.bell-btn')); await wait(20)
const lis2 = [...host.querySelectorAll('.bell-list li')]
await click(lis2[4].querySelector('button'))
ok('cliquer sur « carte vendue » ouvre aussi les offres', opened.offers === 2)
await click(host.querySelector('.bell-btn')); await wait(20)
await click([...host.querySelectorAll('.bell-list li')][6].querySelector('button'))
ok('un favori mis en vente ouvre toujours l\'annonce (inchangé)', opened.listing.length === 1 && opened.listing[0] === 9)
await act(async () => r.unmount())

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nNotifications : tous les contrôles sont passés.')
process.exit(0)

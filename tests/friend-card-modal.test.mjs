// Fiche d'une carte d'AMI et de MA carte dans l'album (exception des cartes secrètes). L'offre est possible sur n'importe quelle carte (double ou non) ; texte adapté ; carte dans son album signalée. jsdom.
//   node tests/friend-card-modal.test.mjs
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
globalThis.fetch = async (url, init) => {
  const u = String(url); const body = init?.body ? JSON.parse(init.body) : {}
  if (u.includes('make_offer')) { rpc.push(['make_offer', body]); return json({ offer_id: 7 }) }
  return json([])
}
const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-fcm-'))
await build({
  stdin: { contents: "export { default as CardModal } from './src/components/CardModal.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = React
const { CardModal, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const noop = () => {}
const wait = (ms = 40) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
const norm = (t) => t.replace(/\u202f|\u00a0/g, ' ').replace(/\s+/g, ' ')
const rarityMap = { common: { id: 'common', name: 'Commune', kind: 'range', sort_order: 7, color: '#d9d4c5', color2: '#b5ad99', text_color: '#222' } }
const catalog = { typeMap: { 1: { id: 1, category_id: 1, name: 'CHAT’LET', image: '🐱' }, 2: { id: 2, category_id: 1, name: 'CHAT MYSTÈRE', image: '🐈‍⬛', secret: true } }, categoryMap: { 1: { id: 1, name: 'Chat’trapez', closed: false } }, cardRef: (id, base, n, s) => ` ${n}/${s}`, numberHidden: () => false, cardStyle: () => 'simple', checklist: () => ({ no: 1, total: 4, secret: false }) }
const sel = (over) => ({ typeId: 1, base: 'common', series: 5, number: 3, rarityId: 'common', state: 'taken', ownerName: 'Bea', friend: true, iOwn: false, isDouble: true, inAlbum: false, ...over })
const mount = async (s) => {
  const host = document.createElement('div'); document.body.appendChild(host); const r = createRoot(host)
  await act(async () => { r.render(React.createElement(GameContext.Provider, { value: { catalog, rarityMap, status: { direct_sell_price: 1, closed_categories: [] }, setStatus: noop } }, React.createElement(CardModal, { sel: s, rarity: rarityMap.common, onClose: noop, onChanged: noop, onRefresh: noop, goMarket: noop }))) })
  await wait()
  return { host, text: () => norm(document.body.textContent), unmount: async () => { await act(async () => r.unmount()); host.remove() } }
}
const btn = (re) => [...document.querySelectorAll('button')].find((b) => re.test(b.textContent))

{
  const m = await mount(sel({}))
  ok('un double : « Un double de Bea. Cette carte te manque. », offre possible, rien sur l’album', /Un double de Bea\. Cette carte te manque\. Propose-lui une offre/.test(m.text()) && !/album/.test(document.querySelector('.overlay-hint').textContent) && !!btn(/Envoyer l’offre/))
  await m.unmount()
}
{
  const m = await mount(sel({ isDouble: false, iOwn: true }))
  ok('une carte seule (pas un double) : « Une carte de Bea. », « Tu as déjà une carte de cet emplacement. », offre possible', /Une carte de Bea\. Tu as déjà une carte de cet emplacement\. Propose-lui une offre/.test(m.text()) && !/Un double/.test(m.text()) && !!btn(/Envoyer l’offre/))
  await m.unmount()
}
{
  const m = await mount(sel({ isDouble: false, inAlbum: true }))
  ok('une carte seule placée dans son album : le texte prévient que Bea devra l’en retirer pour accepter', /Une carte de Bea\. Cette carte te manque\. Elle est dans son album : Bea devra l’en retirer pour accepter\. Propose-lui une offre/.test(m.text()))
  const input = document.querySelector('input[type="number"]')
  await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, '30'); input.dispatchEvent(new window.Event('input', { bubbles: true })) })
  await act(async () => { btn(/Envoyer l’offre/).dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) }); await wait()
  ok('l’offre part normalement : make_offer avec la carte et 30 pièces', rpc.length === 1 && rpc[0][1].p_type === 1 && rpc[0][1].p_number === 3 && rpc[0][1].p_amount === 30)
  ok('confirmation « Offre envoyée à Bea »', /Offre envoyée à Bea/.test(m.text()))
  await m.unmount()
}
{
  // ma carte placée dans l'album : bloquée, sauf si elle est SECRÈTE (vendable à un autre joueur, elle quitte alors l'album)
  const mine = (over) => ({ typeId: 1, base: 'common', series: 5, number: 3, rarityId: 'common', state: 'mine', inAlbum: true, listingId: null, ...over })
  let m = await mount(mine({}))
  ok('ma carte ordinaire dans l’album : « elle ne peut pas être vendue », bouton « Retirer de l’album », aucun formulaire de vente', /ne peut pas être vendue/.test(m.text()) && !!btn(/Retirer de l’album/) && !/Mettre sur le marché/.test(m.text()) && !/Revendre/.test(m.text()))
  await m.unmount()
  m = await mount(mine({ typeId: 2 }))
  ok('ma carte SECRÈTE dans l’album : la note explique qu’elle se vend à un autre joueur et quitte l’album', /Carte secrète : tu peux la vendre à un autre joueur/.test(m.text()) && /elle quitte automatiquement ton album/.test(m.text()))
  ok('… la mise sur le marché est proposée, pas la revente à la banque (refusée tant qu’elle est dans l’album), plus de message « ne peut pas être vendue »', /Mettre sur le marché/.test(m.text()) && !!btn(/Mettre en vente/) && !/Revendre/.test(m.text()) && !/ne peut pas être vendue/.test(m.text()))
  await m.unmount()
  m = await mount(mine({ typeId: 2, inAlbum: false }))
  ok('ma carte secrète HORS album : la fiche habituelle (revente à la banque et marché), sans la note', /Revendre à la banque/.test(m.text()) && /Mettre sur le marché/.test(m.text()) && !/Carte secrète/.test(m.text()))
  await m.unmount()
  m = await mount(sel({ typeId: 2, isDouble: false, inAlbum: true }))
  ok('carte secrète d’un ami rangée dans son album : pas d’avertissement « devra l’en retirer » (elle peut être vendue), offre possible', !/devra l’en retirer/.test(m.text()) && /Une carte de Bea\./.test(m.text()) && !!btn(/Envoyer l’offre/))
  await m.unmount()
}
if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nFiche d’une carte d’ami : tous les contrôles sont passés.')
process.exit(0)

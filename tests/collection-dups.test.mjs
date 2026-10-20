// Mes cartes : tri « Plus de doublons » (option, appel serveur, badge du nombre d'exemplaires), avec jsdom.
//   node tests/collection-dups.test.mjs
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
const calls = []
const row = (type, base, series, number, rid, extra = {}) => ({ card_type: type, card_base: base, card_series: series, card_number: number, rarity_id: rid, obtained_at: '2026-10-20', listing_id: null, listing_kind: null, is_stack: false, stack_qty: 1, stack_free: 1, in_album: false, total: 4, cards_total: 6, dups: 0, ...extra })
const SERIES = [row(1, 'common', 5, 1, 'common', { is_stack: true, stack_qty: 3, stack_free: 2, dups: 2 }), row(2, 'rare', 5, 2, 'rare', { dups: 0 }), row(3, 'rare', 5, 2, 'rare', { dups: 1 }), row(3, 'rare', 5, 3, 'rare', { dups: 1 })]
const DUPS = [SERIES[0], SERIES[2], SERIES[3], SERIES[1]]
globalThis.fetch = async (url, init) => {
  const u = String(url); const body = init?.body ? JSON.parse(init.body) : {}
  if (u.includes('list_collection')) { calls.push(body); return json(body.p_sort === 'dups' ? DUPS : SERIES) }
  return json([])
}

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-cd-'))
await build({
  stdin: { contents: "export { MyCards } from './src/components/Collection.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = React
const { MyCards, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
const noop = () => {}
const R = (id, name, order) => ({ id, name, kind: 'range', sort_order: order, color: '#ccc', color2: '#999', text_color: '#222' })
const rarityMap = { common: R('common', 'Commune', 7), rare: R('rare', 'Rare', 6) }
const types = [1, 2, 3].map((id) => ({ id, category_id: 5, name: `T${id}`, image: '🐱' }))
const catalog = { typeMap: Object.fromEntries(types.map((t) => [t.id, t])), categoryMap: { 5: { id: 5, name: 'Chats' } }, cardRef: () => '', numberHidden: () => false, cardStyle: () => 'simple', checklist: (id) => ({ no: id, total: 3, secret: false }) }
const mount = async () => {
  const host = document.createElement('div'); document.body.appendChild(host)
  const reactRoot = createRoot(host)
  await act(async () => { reactRoot.render(React.createElement(GameContext.Provider, { value: { catalog, rarityMap, status: {} } }, React.createElement(MyCards, { catId: 5, catTypes: types, rarities: Object.values(rarityMap), rarityMap, stats: { by_rarity: [] }, version: 0, onSelect: noop, onStack: noop }))) })
  await wait(60)
  return { host, unmount: async () => { await act(async () => reactRoot.unmount()); host.remove() } }
}
const sortSelect = (h) => [...h.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'series'))
const change = async (el, v) => { await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new window.Event('change', { bubbles: true })) }); await wait(60) }
const badges = (h) => [...h.querySelectorAll('.grid > li')].map((li) => li.querySelector('.card-count')?.textContent ?? '')

const m = await mount()
const opts = [...sortSelect(m.host).options].map((o) => `${o.value}=${o.textContent}`)
ok('le menu de tri propose « Plus de doublons » après Par série, Par rareté, Plus récentes', opts.join('|') === 'series=Par série|rarity=Par rareté|recent=Plus récentes|dups=Plus de doublons')
ok('au départ : tri par série (appel p_sort = series) ; les piles montrent leur quantité (3), les cartes à numéro visible aucun badge', calls.at(-1).p_sort === 'series' && badges(m.host).join(',') === '3,,,')
await change(sortSelect(m.host), 'dups')
ok('« Plus de doublons » : nouvelle recherche avec p_sort = dups, la liste suit l\'ordre du serveur (pile de 3, puis les 2 rares de T3, puis la rare seule)', calls.at(-1).p_sort === 'dups' && calls.at(-1).p_offset === 0 && [...m.host.querySelectorAll('.grid > li')].length === 4)
ok('badge du nombre d\'exemplaires : 3 sur la pile, 2 sur chacune des deux rares en double, aucun sur la rare seule', badges(m.host).join(',') === '3,2,2,')
await change(sortSelect(m.host), 'series')
ok('retour au tri par série : les badges des cartes à numéro visible disparaissent', calls.at(-1).p_sort === 'series' && badges(m.host).join(',') === '3,,,')
await m.unmount()

// ancien serveur : pas de champ dups, aucun plantage ni badge « NaN »
const old = [row(3, 'rare', 5, 2, 'rare', { dups: undefined })]
globalThis.fetch = async (url, init) => { const body = init?.body ? JSON.parse(init.body) : {}; if (String(url).includes('list_collection')) { calls.push(body); return json(old) } return json([]) }
const m2 = await mount()
await change(sortSelect(m2.host), 'dups')
ok('serveur de la version précédente (sans doublons) : pas de plantage, aucun badge', !/NaN|undefined/.test(m2.host.textContent) && badges(m2.host).join(',') === '')
await m2.unmount()

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nMes cartes, doublons : tous les contrôles sont passés.')
process.exit(0)

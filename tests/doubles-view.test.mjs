// Mes cartes > « Vendre les doubles » (pass OneMore) : visibilité du bouton, fenêtre de vente par rareté, confirmation, erreurs, avec jsdom.
//   node tests/doubles-view.test.mjs
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
let summaryRows = []
let fail = null   // { fn, message }
globalThis.fetch = async (url, init) => {
  const u = String(url); const body = init?.body ? JSON.parse(init.body) : {}
  const fn = ['duplicates_summary', 'sell_duplicates'].find((n) => u.includes(n))
  if (fn) {
    rpc.push([fn, body])
    if (fail && fail.fn === fn) return json({ message: fail.message }, 400)
    if (fn === 'duplicates_summary') return json(summaryRows)
    return json({ status: { coins: 500 }, sold: 5, coins: 20, rarity: body.p_rarity })
  }
  return json([])
}

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-doubles-'))
await build({
  stdin: { contents: "export { default as Collection, MyCards, DuplicatesModal, canSellDoubles } from './src/components/Collection.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = React
const { Collection, MyCards, DuplicatesModal, canSellDoubles, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const norm = (t) => t.replace(/\u202f|\u00a0/g, ' ')
const wait = (ms = 40) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) }); await wait(30) }
const btn = (root2, re) => [...root2.querySelectorAll('button')].find((b) => re.test(b.textContent))
const pick = async (sel, v) => { await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(sel, v); sel.dispatchEvent(new window.Event('change', { bubbles: true })) }) }

const rarities = [{ id: 'common', name: 'Commune', kind: 'range', sort_order: 7, color: '#d9d4c5', color2: '#b5ad99', text_color: '#222' }, { id: 'rare', name: 'Rare', kind: 'range', sort_order: 6, color: '#e5405e', color2: '#8c1c35', text_color: '#fff' }]
const rarityMap = Object.fromEntries(rarities.map((r) => [r.id, r]))
const category = { id: 5, name: 'Chat’trapez les tous !', enabled: true, closed: false }
const catalog = { typeMap: {}, categoryMap: { 5: category }, cardRef: () => '', numberHidden: () => true, cardStyle: () => 'simple', checklist: () => null }
let sets = []
const mount = async (node, status = { coins: 100, subscription: { active: true, name: 'OneMore' }, closed_categories: [] }) => {
  const host = document.createElement('div'); document.body.appendChild(host)
  const r = createRoot(host)
  await act(async () => { r.render(React.createElement(GameContext.Provider, { value: { catalog, rarityMap, rarities, status, setStatus: (s) => sets.push(s) } }, node)) })
  await wait(60)
  return { host, unmount: async () => { await act(async () => r.unmount()); host.remove() } }
}

// ---------- la règle de visibilité ----------
ok('bouton visible seulement si le pass payant est actif', canSellDoubles({ subscription: { active: true } }) === true)
ok('pas de bouton : pass inactif, absent, statut absent ou valeur floue', [{ subscription: { active: false } }, { subscription: {} }, {}, null, undefined, { subscription: { active: 'true' } }, { subscription: { active: 1 } }].every((s) => canSellDoubles(s) === false))

// ---------- dans Mes cartes, à côté des filtres ----------
const myCards = (onSellDoubles) => React.createElement(MyCards, { catId: 5, catTypes: [], rarities, rarityMap, stats: { by_rarity: [] }, version: 0, onSelect: () => {}, onStack: () => {}, onSellDoubles })
{
  let opened = 0
  const m = await mount(myCards(() => { opened++ }))
  const tb = m.host.querySelector('.toolbar-selects')
  ok('membre : le bouton « Vendre les doubles » est dans la barre des filtres, à côté de « Toutes les cartes » et du tri', !!tb && !!btn(tb, /^Vendre les doubles$/) && tb.querySelectorAll('select').length === 2)
  await click(btn(tb, /^Vendre les doubles$/))
  ok('cliquer ouvre la vente des doubles', opened === 1)
  await m.unmount()
  const m2 = await mount(myCards(undefined), { coins: 100, subscription: { active: false } })
  ok('non-membre : aucun bouton, mais les filtres sont toujours là', !btn(m2.host, /Vendre les doubles/) && m2.host.querySelectorAll('.toolbar-selects select').length === 2 && !/doubles/i.test(m2.host.querySelector('.toolbar').textContent))
  await m2.unmount()
}

// ---------- la fenêtre ----------
const rows = [{ rarity_id: 'common', doubles: 5, type_count: 2, price: 4, coins: 20 }, { rarity_id: 'rare', doubles: 1, type_count: 1, price: 9, coins: 9 }]
const modal = (props = {}) => React.createElement(DuplicatesModal, { category, rarityMap, onClose: () => { closed++ }, onChanged: () => { changed++ }, ...props })
let closed = 0, changed = 0
{
  const m = await mount(modal({ initialRows: rows }))
  const dlg = m.host.querySelector('[role="dialog"]')
  ok('fenêtre : titre, collection concernée et règle (un exemplaire gardé, album gardé, cartes en vente non touchées)', dlg.getAttribute('aria-label') === 'Vente rapide des doubles' && /Collection « Chat’trapez les tous ! »/.test(dlg.textContent) && /on garde un exemplaire/.test(dlg.textContent) && /celui de ton album/.test(dlg.textContent) && /Les cartes en vente ne sont pas touchées/.test(dlg.textContent))
  const sel = dlg.querySelector('select')
  const opts = [...sel.options].map((o) => norm(o.textContent))
  ok('liste des raretés : seulement celles qui ont des doubles, avec leur nombre (singulier / pluriel)', opts.join('|') === 'Choisis une rareté|Commune : 5 doubles|Rare : 1 double')
  ok('rien n\'est proposé à la vente tant qu\'aucune rareté n\'est choisie', !btn(dlg, /^Vendre \d/))
  await pick(sel, 'common')
  const t1 = norm(dlg.textContent)
  ok('rareté choisie : 5 doubles (2 cartes différentes) à 4 pièces chacun, 20 pièces à recevoir, retrait définitif annoncé', /5 doubles \(2 cartes différentes\) à 4 pièces chacun : tu reçois 20 pièces\./.test(t1) && /définitivement retirées du jeu/.test(t1) && !!btn(dlg, /^Vendre 5 doubles pour 20 pièces$/))
  rpc.length = 0
  await click(btn(dlg, /^Vendre 5 doubles pour 20 pièces$/))
  ok('première étape : une confirmation « Oui, vendre 5 doubles » / « Annuler », aucun appel encore', !!btn(dlg, /^Oui, vendre 5 doubles$/) && !!btn(dlg, /^Annuler$/) && rpc.length === 0)
  await click(btn(dlg, /^Annuler$/))
  ok('Annuler revient au bouton de vente, sans appel', !!btn(dlg, /^Vendre 5 doubles pour 20 pièces$/) && !btn(dlg, /^Oui, vendre/) && rpc.length === 0)
  await pick(dlg.querySelector('select'), 'rare')
  ok('autre rareté : singulier correct (1 double, 1 carte différente, 9 pièces)', /1 double \(1 carte différente\) à 9 pièces chacun : tu reçois 9 pièces\./.test(norm(dlg.textContent)) && !!btn(dlg, /^Vendre 1 double pour 9 pièces$/))
  await pick(dlg.querySelector('select'), 'common')
  summaryRows = []
  await click(btn(dlg, /^Vendre 5 doubles pour 20 pièces$/)); await click(btn(dlg, /^Oui, vendre 5 doubles$/))
  const sell = rpc.filter((c) => c[0] === 'sell_duplicates')
  ok('confirmation : UN seul appel sell_duplicates (collection 5, rareté Commune)', sell.length === 1 && JSON.stringify(sell[0][1]) === JSON.stringify({ p_category: 5, p_rarity: 'common' }))
  ok('après la vente : le statut est mis à jour, la collection se rafraîchit, un message annonce « 5 cartes vendues : +20 pièces »', sets.length === 1 && sets[0].coins === 500 && changed === 1 && /5 cartes vendues : \+20 pièces\./.test(norm(dlg.textContent)))
  ok('l\'aperçu est rechargé depuis le serveur (plus de double : message adapté, plus de liste)', rpc.filter((c) => c[0] === 'duplicates_summary').length === 1 && /Plus aucun double à vendre dans cette collection\./.test(dlg.textContent) && !dlg.querySelector('select'))
  await click(btn(dlg, /^Fermer$/))
  ok('Fermer', closed === 1)
  await m.unmount()
}
{
  closed = 0
  const m = await mount(modal({ initialRows: rows }))
  fail = { fn: 'sell_duplicates', message: 'nothing_to_sell' }
  await pick(m.host.querySelector('select'), 'common'); await click(btn(m.host, /^Vendre 5 doubles/)); await click(btn(m.host, /^Oui, vendre/))
  ok('plus rien à vendre (quelqu\'un a agi entre-temps) : message clair, retour au bouton, rien ne change côté statut', /Il n’y a plus de double à vendre pour cette rareté\./.test(m.host.querySelector('[role="alert"]')?.textContent ?? '') && !btn(m.host, /^Oui, vendre/))
  fail = { fn: 'sell_duplicates', message: 'pro_required' }
  await click(btn(m.host, /^Vendre 5 doubles/)); await click(btn(m.host, /^Oui, vendre/))
  ok('pass révoqué entre-temps : « réservée aux membres du pass OneMore »', /réservée aux membres du pass OneMore/.test(m.host.querySelector('[role="alert"]')?.textContent ?? ''))
  fail = { fn: 'sell_duplicates', message: 'category_closed' }
  await click(btn(m.host, /^Vendre 5 doubles/)); await click(btn(m.host, /^Oui, vendre/))
  ok('collection terminée entre-temps : message de la collection terminée', /terminée|Cette catégorie/i.test(m.host.querySelector('[role="alert"]')?.textContent ?? ''))
  fail = null
  await m.unmount()
}
{
  summaryRows = rows; rpc.length = 0
  const m = await mount(modal())
  ok('sans aperçu fourni, la fenêtre le demande au serveur (collection 5) puis liste les raretés', rpc.length === 1 && JSON.stringify(rpc[0]) === JSON.stringify(['duplicates_summary', { p_category: 5 }]) && [...m.host.querySelector('select').options].length === 3)
  await m.unmount()
  fail = { fn: 'duplicates_summary', message: 'pro_required' }
  const m2 = await mount(modal())
  ok('aperçu refusé (pas membre) : message clair, aucune vente proposée', /réservée aux membres du pass OneMore/.test(m2.host.querySelector('[role="alert"]')?.textContent ?? '') && !m2.host.querySelector('select'))
  fail = null
  await m2.unmount()
  rpc.length = 0
  const m3 = await mount(modal(), { coins: 1, subscription: { active: true }, closed_categories: [5] })
  ok('collection terminée : indisponible, aucun appel au serveur, aucune liste', /Indisponible : la collection « Chat’trapez les tous ! » est terminée/.test(m3.host.textContent) && rpc.length === 0 && !m3.host.querySelector('select'))
  await m3.unmount()
  const m4 = await mount(modal({ initialRows: [] }))
  ok('aucun double : message simple', /Aucun double à vendre dans cette collection\./.test(m4.host.textContent) && !m4.host.querySelector('select'))
  await m4.unmount()
}

// ---------- la vraie page Collection ----------
{
  const catP = { id: 5, name: 'Chat’trapez les tous !', color: '#fff', color2: '#ccc', text_color: '#000', enabled: true, closed: false }
  const catalogP = { categories: [catP], types: [], typeMap: {}, categoryMap: { 5: catP }, cardRef: () => '', numberHidden: () => true, cardStyle: () => 'simple', checklist: () => null, typeConfig: () => [], rarityConfig: () => [] }
  const page = async (active) => {
    const host = document.createElement('div'); document.body.appendChild(host); const r = createRoot(host)
    await act(async () => { r.render(React.createElement(GameContext.Provider, { value: { catalog: catalogP, rarityMap, rarities, status: { coins: 5, active_category_id: 5, closed_categories: [], subscription: { active } }, setStatus() {} } }, React.createElement(Collection, { goMarket() {} }))) })
    await wait(60)
    return { host, unmount: async () => { await act(async () => r.unmount()); host.remove() } }
  }
  const tabsOf = (h) => [...h.querySelectorAll('[role="tab"]')]
  summaryRows = rows; rpc.length = 0
  const pm = await page(true)
  ok('page Collection, onglet Album : pas de bouton des doubles (il est dans « Mes cartes »)', !btn(pm.host, /Vendre les doubles/))
  await click(tabsOf(pm.host).find((b) => b.textContent === 'Mes cartes'))
  ok('page Collection, onglet Mes cartes, membre OneMore : le bouton est à côté des filtres', !!btn(pm.host.querySelector('.toolbar-selects'), /^Vendre les doubles$/))
  await click(btn(pm.host, /^Vendre les doubles$/)); await wait(60)
  ok('le bouton ouvre la vente des doubles de la collection affichée (aperçu demandé pour la collection 5)', !!pm.host.querySelector('[aria-label="Vente rapide des doubles"]') && rpc.some((c) => c[0] === 'duplicates_summary' && c[1].p_category === 5) && /Collection « Chat’trapez les tous ! »/.test(pm.host.textContent))
  await pm.unmount()
  const nm = await page(false)
  await click(tabsOf(nm.host).find((b) => b.textContent === 'Mes cartes'))
  ok('page Collection, non-membre : aucun bouton, les filtres restent', !btn(nm.host, /Vendre les doubles/) && nm.host.querySelectorAll('.toolbar-selects select').length === 2)
  await nm.unmount()
}

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nVente rapide des doubles : tous les contrôles sont passés.')
process.exit(0)

// Page Boosters et collections : une seule collection ouverte = son nom en texte sous « Booster » ; plusieurs = liste déroulante ; tous les boosters de la page suivent la collection choisie
// (paquets, stock lié, ouverture, achat, cartes tirées) ; choix retenu ; arrivée depuis l'annonce d'une récompense ; collection terminée. Avec jsdom.
//   node tests/collections-select.test.mjs
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
dom.window.confirm = () => true

const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })
const calls = []        // appels serveur : [nom, corps]
let openReply = null    // réponse simulée à une ouverture (null : erreur 400)
globalThis.fetch = async (url, init) => {
  const u = String(url); const body = init?.body ? JSON.parse(init.body) : {}
  const name = ['open_booster_of_type', 'open_booster', 'open_golden_pack', 'buy_booster', 'open_gold_reward'].find((n) => u.includes(n))
  if (name) {
    calls.push([name, body])
    if (name === 'buy_booster') return json({ ok: true, status: { ...currentStatus, coins: 350 } })
    return openReply ? json(openReply) : json({ message: 'ouverture simulée' }, 400)
  }
  return json([])
}

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-collsel-'))
await build({
  stdin: { contents: "export { default as Boosters } from './src/components/Boosters.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act, useState } = React
const { Boosters, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
const text = (h) => h.textContent.replace(/\s+/g, ' ')
const title = (h) => (h.querySelector('.pack-name')?.textContent ?? '').trim()
const coll = (h) => (h.querySelector('.pack-collection')?.textContent ?? '').trim()
const btn = (h, re) => [...h.querySelectorAll('button')].find((b) => re.test(b.textContent))
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) }); await wait(40) }
const select = (h) => h.querySelector('select[aria-label], label.pack-collection select')
const change = async (el, v) => { await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new window.Event('change', { bubbles: true })) }); await wait(40) }

const col = (id, name, extra = {}) => ({ id, name, color: '#f59e0b', color2: '#c2410c', text_color: '#fff', image: '🐱', ...extra })
const catalog = { categoryMap: { 5: col(5, 'Chat’trapez les tous !'), 6: col(6, 'Rat’trapez les tous !', { color: '#6366f1', color2: '#3730a3' }) }, typeMap: {}, types: [], rarities: [], cardRef: () => '', numberHidden: () => false }
const premium = { id: 30, name: 'Premium', cards: 5, color: '#9ca3af', glow: 'none', price: 150, quantity: 0 }
const c5 = { id: 5, name: 'Chat’trapez les tous !', cards_taken: 1500, total_cards: 12991836 }
const c6 = { id: 6, name: 'Rat’trapez les tous !', cards_taken: 40, total_cards: 800000 }
const base = { id: 'u1', username: 'Tsuba', boosters: 10, bonus_boosters: 0, coins: 500, coins_locked: 0, gold_rewards: [], reward_notices: [], max_boosters: 10, regen_minutes: 10, regen_amount: 10,
  active_category_id: 5, active_categories: [c5], linked_boosters: [], next_refill_at: null, cards_taken: 1500, total_cards: 12991836, next_category: null, cgv_version: 3, shop_enabled: false, booster_types: [],
  standard_booster: { id: 1, name: 'Standard', glow: 'none', color: '#e8452e' }, server_now: new Date().toISOString(), subscription: { enabled: false, active: false } }
let currentStatus = base

async function mountPage(initial, props = {}) {
  currentStatus = initial
  const host = document.createElement('div'); document.body.appendChild(host)
  const reactRoot = createRoot(host)
  function Harness() {
    const [status, setStatus] = useState(initial)
    return React.createElement(GameContext.Provider, { value: { status, setStatus, refreshStatus: async () => { setStatus(currentStatus); return currentStatus }, rarityMap: {}, catalog, setRevealing: () => {} } }, React.createElement(Boosters, { goCollection: () => {}, ...props }))
  }
  await act(async () => { reactRoot.render(React.createElement(Harness)) })
  await wait(50)
  return { host, unmount: async () => { await act(async () => reactRoot.unmount()); host.remove() } }
}
const clearSaved = () => { try { window.localStorage.removeItem('o1o_collection') } catch { /* rien */ } }

// ---------- une seule collection ouverte ----------
clearSaved()
{
  const m = await mountPage(base)
  ok('une seule collection ouverte : « Booster » puis son nom en TEXTE (pas de liste déroulante)', title(m.host) === 'Booster' && coll(m.host) === 'Chat’trapez les tous !' && !m.host.querySelector('label.pack-collection') && !m.host.querySelector('.pack-collection select'))
  ok('l\'ancien titre « Booster « … » » n\'existe plus', !/Booster «/.test(text(m.host)))
  ok('cartes tirées de la collection, sans phrase sur une « prochaine collection »', /Chat’trapez les tous ! : 1[  ]?500 cartes tirées sur 12[  ]?991[  ]?836\./.test(text(m.host)) && !/s’ouvrira|dernière collection|dernière collection/.test(text(m.host)))
  calls.length = 0
  await click(btn(m.host, /^Ouvrir un booster$/))
  ok('l\'ouverture demande la collection (p_category = 5)', calls.length === 1 && calls[0][0] === 'open_booster' && calls[0][1].p_category === 5)
  await m.unmount()
}
{
  const m = await mountPage({ ...base, active_categories: undefined, cards_taken: 7, total_cards: 70 })
  ok('serveur de la version précédente (sans liste de collections) : la collection active reste affichée en texte, ses chiffres aussi', coll(m.host) === 'Chat’trapez les tous !' && /7 cartes tirées sur 70/.test(text(m.host)))
  await m.unmount()
}

// ---------- plusieurs collections ouvertes ----------
clearSaved()
const two = { ...base, active_categories: [c5, c6] }
{
  const m = await mountPage(two)
  ok('plusieurs collections ouvertes : « Booster » puis une LISTE DÉROULANTE (la première sélectionnée), plus de texte seul', title(m.host) === 'Booster' && !!select(m.host) && [...select(m.host).options].map((o) => `${o.value}=${o.textContent}`).join('|') === '5=Chat’trapez les tous !|6=Rat’trapez les tous !' && select(m.host).value === '5' && !m.host.querySelector('p.pack-collection'))
  ok('le paquet affiche la collection choisie (titre du paquet) et les cartes tirées sont celles de cette collection', /Chat’trapez les tous !/.test(m.host.querySelector('.pack-wrap').textContent) && /1[  ]?500 cartes tirées sur/.test(text(m.host)))
  await change(select(m.host), '6')
  ok('changer de collection : TOUS les boosters de la page suivent (paquet, cartes tirées de la nouvelle collection)', select(m.host).value === '6' && /Rat’trapez les tous !/.test(m.host.querySelector('.pack-wrap').textContent) && /Rat’trapez les tous ! : 40 cartes tirées sur 800/.test(text(m.host)) && !/1[  ]?500 cartes tirées/.test(text(m.host)))
  calls.length = 0
  await click(btn(m.host, /^Ouvrir un booster$/))
  ok('l\'ouverture se fait dans la collection choisie (p_category = 6)', calls.length === 1 && calls[0][1].p_category === 6)
  ok('le choix est retenu d\'une visite à l\'autre', window.localStorage.getItem('o1o_collection') === '6')
  await m.unmount()
  const m2 = await mountPage(two)
  ok('à la visite suivante, la collection retenue est déjà choisie', select(m2.host).value === '6' && /Rat’trapez les tous !/.test(m2.host.querySelector('.pack-wrap').textContent))
  await m2.unmount()
}
{
  window.localStorage.setItem('o1o_collection', '99')
  const m = await mountPage(two)
  ok('collection retenue qui n\'est plus ouverte : retour à la première collection ouverte, sans plantage', select(m.host).value === '5')
  await m.unmount()
  clearSaved()
}
{
  const m = await mountPage(two, { initialCategory: 6 })
  ok('arrivée depuis l\'annonce d\'une récompense : la collection de la carte complétée est choisie', select(m.host).value === '6')
  await m.unmount()
  clearSaved()
}

// ---------- boosters liés à une collection ----------
{
  const linked = { ...two, booster_types: [premium], linked_boosters: [{ booster_type_id: 30, category_id: 6, quantity: 2 }] }
  const m = await mountPage(linked)
  ok('un Premium lié à Rat’trapez n\'apparaît PAS en stock sur Chat’trapez (il est seulement en vente)', !m.host.querySelector('.pack-shelf') && /Acheter/.test(text(m.host.querySelector('.extra-boosters'))) && !/en stock/.test(text(m.host.querySelector('.extra-boosters'))))
  await change(select(m.host), '6')
  ok('sur Rat’trapez : le Premium lié (×2) est en stock, dans l\'étagère, à côté du Standard', m.host.querySelectorAll('.shelf-pack').length === 2 && /Premium/.test(m.host.querySelectorAll('.shelf-pack')[1].getAttribute('aria-label')) && /×2/.test(m.host.querySelectorAll('.shelf-pack')[1].textContent))
  await click(m.host.querySelectorAll('.shelf-pack')[1])
  ok('Premium choisi : « Booster Premium », collection Rat’trapez, 2 boosters prêts', title(m.host) === 'Booster Premium' && /Rat’trapez les tous !/.test(m.host.textContent) && /2 boosters prêts/.test(text(m.host)))
  calls.length = 0
  await click(btn(m.host, /^Ouvrir un booster Premium$/))
  ok('« Ouvrir un booster Premium » : type 30 dans la collection 6', calls.length === 1 && calls[0][0] === 'open_booster_of_type' && calls[0][1].p_type === 30 && calls[0][1].p_category === 6)
  await m.unmount()
  clearSaved()
}
{
  const mixed = { ...two, booster_types: [{ ...premium, quantity: 1 }], linked_boosters: [{ booster_type_id: 30, category_id: 5, quantity: 1 }] }
  const m = await mountPage(mixed)
  ok('stock sans collection (1) + stock lié à la collection choisie (1) : 2 Premium prêts', /×2/.test(m.host.querySelectorAll('.shelf-pack')[1]?.textContent ?? ''))
  await change(select(m.host), '6')
  ok('sur l\'autre collection : seul le stock sans collection (1) reste utilisable', /×1/.test(m.host.querySelectorAll('.shelf-pack')[1]?.textContent ?? ''))
  await m.unmount()
  clearSaved()
}

// ---------- achat : lié à la collection choisie ----------
{
  const m = await mountPage({ ...two, booster_types: [premium] })
  await change(select(m.host), '6')
  calls.length = 0
  await click([...m.host.querySelectorAll('.extra-boosters button')].find((b) => /Acheter/.test(b.textContent)))
  ok('acheter un Premium : p_category = la collection choisie (6)', calls.length === 1 && calls[0][0] === 'buy_booster' && calls[0][1].p_type === 30 && calls[0][1].p_category === 6)
  ok('le message dit pour quelle collection il est acheté', /ajouté à ton stock pour la collection « Rat’trapez les tous ! »/.test(text(m.host)))
  await m.unmount()
  clearSaved()
}

// ---------- achat avec la remise du pass OneMore : prix barré, confirmation au prix réduit ----------
{
  const asked = []
  dom.window.confirm = (msg) => { asked.push(msg); return true }
  const norm = (t) => t.replace(/\u202f|\u00a0/g, ' ')
  const mem = await mountPage({ ...two, coins: 1000, booster_types: [{ ...premium, price: 150, member_price: 120 }] })
  const buyBtn = () => [...mem.host.querySelectorAll('.extra-boosters button')].find((b) => /Acheter/.test(b.textContent))
  ok('membre : le bouton montre l\'ancien prix barré (150) puis le prix membre (120)', /Acheter · 150 120 🪙/.test(norm(buyBtn().textContent)) && !!buyBtn().querySelector('s.price-old') && buyBtn().querySelector('.price-new').textContent.replace(/\s/g, '') === '120')
  await click(buyBtn())
  ok('la confirmation annonce le prix réduit ET l\'ancien : « pour 120 pièces (au lieu de 150 : remise membre) »', asked.length === 1 && /pour 120 pièces \(au lieu de 150 : remise membre\) \?/.test(norm(asked[0])))
  await mem.unmount(); clearSaved()
  asked.length = 0
  const non = await mountPage({ ...two, coins: 1000, booster_types: [{ ...premium, price: 150, member_price: 150 }] })
  const buyBtn2 = () => [...non.host.querySelectorAll('.extra-boosters button')].find((b) => /Acheter/.test(b.textContent))
  await click(buyBtn2())
  ok('non-membre : prix unique, aucun prix barré, confirmation simple « pour 150 pièces ? »', !buyBtn2().querySelector('s') && asked.length === 1 && /pour 150 pièces \?/.test(norm(asked[0])) && !/remise/.test(asked[0]))
  await non.unmount(); clearSaved()
  dom.window.confirm = () => true
}

// ---------- collection terminée pendant l'ouverture ----------
{
  openReply = { error: 'collection_closed', status: { ...two, active_categories: [c5], active_category_id: 5 } }
  const m = await mountPage(two)
  currentStatus = { ...two, active_categories: [c5], active_category_id: 5 }   // ce que le serveur renverra au rafraîchissement du statut
  await change(select(m.host), '6')
  await click(btn(m.host, /^Ouvrir un booster$/)); await wait(80)
  ok('collection terminée entre-temps : rien ne s\'ouvre, message clair, l\'écran d\'ouverture se ferme', !document.querySelector('.overlay') && /Cette collection n’est plus ouverte/.test(text(m.host)))
  ok('et la liste des collections est mise à jour (plus qu\'une : texte seul, sur la collection restante)', !m.host.querySelector('label.pack-collection') && coll(m.host) === 'Chat’trapez les tous !')
  openReply = null
  await m.unmount()
  clearSaved()
}

// ---------- booster ordinaire devenu Gold par hasard ----------
{
  const card = { type_id: 1, base_rarity: 'rare', series: 5, number: 3, rarity_id: 'rare', is_new: true }
  openReply = { cards: [card], golden: true, category_id: 5, booster: { id: 40, name: 'Gold', color: '#d4af37', glow: 'gold' }, status: base }
  const m = await mountPage(base)
  await click(btn(m.host, /^Ouvrir un booster$/))
  const t0 = Date.now()
  const hintOf = () => document.querySelector('.overlay-hint')?.textContent ?? ''
  while (Date.now() - t0 < 8000 && !/carte 1 sur 1/.test(hintOf())) await wait(50)
  const revealHint = hintOf()
  await wait(300)
  await click(document.querySelector('.reveal-card'))   // la carte est révélée : on passe au résumé
  const t1 = Date.now()
  while (Date.now() - t1 < 4000 && !document.querySelector('.overlay-title')) await wait(50)
  const title = document.querySelector('.overlay-title')?.textContent ?? ''
  ok('un booster ordinaire devenu Gold par hasard : annoncé « Booster Gold » (le nom du booster Gold du module Boosters) à la révélation puis au résumé, jamais « Booster doré »', /^Booster Gold : carte 1 sur 1/.test(revealHint) && title === 'Booster Gold' && !/doré/.test(document.body.textContent))
  ok('l\'ouverture a bien été demandée normalement (booster du stock gratuit, collection 5)', calls.at(-1)[0] === 'open_booster' && calls.at(-1)[1].p_category === 5)
  openReply = null
  await m.unmount()
}

// ---------- aucune collection ouverte ----------
{
  const m = await mountPage({ ...base, active_category_id: null, active_categories: [] })
  ok('aucune collection ouverte : message « Toutes les collections… », ni titre ni liste', /Toutes les collections de boosters ont été entièrement tirées/.test(text(m.host)) && !m.host.querySelector('.pack-name') && !m.host.querySelector('select'))
  await m.unmount()
}

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nPage Boosters et collections : tous les contrôles sont passés.')
process.exit(0)

// Marché > Offres : accepter, refuser, faire une CONTRE-OFFRE, retirer sa proposition, avec jsdom.
//   node tests/offers-view.test.mjs
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
let fail = null   // { fn: 'respond_offer', message: '…' }
globalThis.fetch = async (url, init) => {
  const u = String(url); const body = init?.body ? JSON.parse(init.body) : {}
  const fn = ['respond_offer', 'counter_offer', 'cancel_offer'].find((n) => u.includes(n))
  if (fn) { rpc.push([fn, body]); return fail && fail.fn === fn ? json({ message: fail.message }, 400) : json(fn === 'cancel_offer' ? { ok: true } : { status: { coins: 5 } }) }
  return json([])
}

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-offers-'))
await build({
  stdin: { contents: "export { OffersPanel } from './src/components/Market.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = React
const { OffersPanel, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const noop = () => {}
const norm = (t) => t.replace(/\u202f|\u00a0/g, ' ')

const rarityMap = { common: { id: 'common', name: 'Commune', kind: 'range', sort_order: 7, color: '#d9d4c5', color2: '#b5ad99', text_color: '#222' } }
const types = [{ id: 1, category_id: 1, name: 'CHATON', image: '🐱' }]
const catalog = { typeMap: { 1: types[0] }, categoryMap: { 1: { id: 1, name: 'Chat', closed: false } }, cardRef: (id, base, n, s) => ` ${n}/${s}`, numberHidden: () => false, typeConfig: () => [], rarityConfig: () => [] }
const row = (over) => ({ offer_id: 1, card_type: 1, card_base: 'common', card_series: 5, card_number: 3, rarity_id: 'common', role: 'seller', counterpart_name: 'Bea', amount: 20, status: 'pending',
  created_at: new Date().toISOString(), responded_at: null, proposed_by_me: false, waiting_on_me: true, rounds: 0, ...over })
let reloads = 0
const mount = async (rows) => {
  const host = document.createElement('div'); document.body.appendChild(host)
  const reactRoot = createRoot(host)
  await act(async () => {
    reactRoot.render(React.createElement(GameContext.Provider, { value: { catalog, rarityMap, status: { coins: 100 }, setStatus: noop } },
      React.createElement(OffersPanel, { rows, loading: false, rarityMap, catalog, status: { coins: 100 }, setStatus: noop, reload: async () => { reloads++ } })))
  })
  return { host, unmount: async () => { await act(async () => reactRoot.unmount()); host.remove() } }
}
const items = (h) => [...h.querySelectorAll('.mine-list > li')]
const btn = (el, re) => [...el.querySelectorAll('button')].find((b) => re.test(b.textContent))
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) }); await act(async () => { await new Promise((r) => setTimeout(r, 20)) }) }
const setValue = async (el, v) => { await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new window.Event('input', { bubbles: true })) }) }
const submit = async (form) => { await act(async () => { form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 20)) }) }

// ---------- offre reçue : accepter, refuser ou contre-offre ----------
{
  const m = await mount([row()])
  const li = items(m.host)[0]
  ok('offre reçue : « Offre de Bea : 20 pièces », en attente', /Offre de Bea : 20 pièces/.test(norm(li.textContent)) && /En attente/.test(li.textContent))
  ok('trois choix : Accepter, Refuser, Contre-offre ; pas de « Retirer »', !!btn(li, /^Accepter$/) && !!btn(li, /^Refuser$/) && !!btn(li, /^Contre-offre$/) && !btn(li, /Retirer/))
  rpc.length = 0; reloads = 0
  await click(btn(items(m.host)[0], /^Accepter$/))
  ok('Accepter : l\'offre est acceptée (respond_offer, accepter), la liste se recharge', JSON.stringify(rpc.at(-1)) === JSON.stringify(['respond_offer', { p_id: 1, p_accept: true }]) && reloads === 1)
  await click(btn(items(m.host)[0], /^Refuser$/))
  ok('Refuser : respond_offer, refuser', JSON.stringify(rpc.at(-1)) === JSON.stringify(['respond_offer', { p_id: 1, p_accept: false }]))
  await click(btn(items(m.host)[0], /^Contre-offre$/))
  const form = () => items(m.host)[0].querySelector('form.counter-form')
  const input = () => form().querySelector('input')
  ok('Contre-offre : un champ prérempli avec le prix actuel (20), « Envoyer la contre-offre » et « Annuler » ; les trois boutons de réponse disparaissent', !!form() && input().value === '20' && !!btn(form(), /^Envoyer la contre-offre$/) && !!btn(form(), /^Annuler$/) && !btn(items(m.host)[0], /^Accepter$/))
  ok('le prix actuel ne peut pas être renvoyé tel quel (bouton inactif)', btn(form(), /Envoyer/).disabled === true)
  for (const v of ['', '0', '-3', '1.5', 'abc']) { await setValue(input(), v); if (!btn(form(), /Envoyer/).disabled) { ok(`prix « ${v} » refusé`, false) } }
  ok('prix vide, 0, négatif, décimal ou texte : bouton inactif', true)
  const before = rpc.length
  await setValue(input(), '0'); await submit(form())
  ok('envoyer un prix invalide ne fait aucun appel', rpc.length === before)
  await setValue(input(), '35')
  ok('35 pièces : le bouton s\'active', btn(form(), /Envoyer/).disabled === false)
  await click(btn(form(), /^Envoyer la contre-offre$/))
  ok('contre-offre envoyée : counter_offer avec le montant (35), la liste se recharge, le formulaire se ferme', JSON.stringify(rpc.at(-1)) === JSON.stringify(['counter_offer', { p_id: 1, p_amount: 35 }]) && !items(m.host)[0].querySelector('form') && reloads >= 3)
  await click(btn(items(m.host)[0], /^Contre-offre$/)); await click(btn(form(), /^Annuler$/))
  ok('Annuler referme le formulaire sans rien envoyer', !items(m.host)[0].querySelector('form') && rpc.at(-1)[0] === 'counter_offer' && rpc.filter((c) => c[0] === 'counter_offer').length === 1)
  await m.unmount()
}

// ---------- ma proposition en attente ----------
{
  const m = await mount([row({ offer_id: 2, role: 'buyer', proposed_by_me: true, waiting_on_me: false }), row({ offer_id: 3, role: 'seller', proposed_by_me: true, waiting_on_me: false, rounds: 2, counterpart_name: 'Tom', amount: 50 })])
  const [a, b] = items(m.host)
  ok('mon offre : « Ton offre à Bea : 20 pièces », « En attente de la réponse de Bea. », bouton « Retirer l\'offre », ni Accepter ni Refuser ni Contre-offre', /Ton offre à Bea : 20 pièces/.test(norm(a.textContent)) && /En attente de la réponse de Bea\./.test(a.textContent) && !!btn(a, /^Retirer l’offre$/) && !btn(a, /Accepter|Refuser|Contre-offre/))
  ok('ma contre-offre (échange en cours), même en tant que propriétaire : « Ta contre-offre à Tom : 50 pièces », « Retirer ma contre-offre »', /Ta contre-offre à Tom : 50 pièces/.test(norm(b.textContent)) && !!btn(b, /^Retirer ma contre-offre$/) && !btn(b, /Accepter|Refuser/))
  rpc.length = 0
  await click(btn(items(m.host)[0], /^Retirer l’offre$/))
  ok('Retirer : cancel_offer', JSON.stringify(rpc.at(-1)) === JSON.stringify(['cancel_offer', { p_id: 2 }]))
  await m.unmount()
}

// ---------- contre-offre reçue (je suis l'acheteur) ----------
{
  const m = await mount([row({ offer_id: 4, role: 'buyer', counterpart_name: 'Tom', amount: 40, rounds: 1, proposed_by_me: false, waiting_on_me: true })])
  const li = items(m.host)[0]
  ok('contre-offre reçue : « Contre-offre de Tom : 40 pièces » avec Accepter, Refuser et Contre-offre (l\'acheteur aussi peut répondre)', /Contre-offre de Tom : 40 pièces/.test(norm(li.textContent)) && !!btn(li, /^Accepter$/) && !!btn(li, /^Refuser$/) && !!btn(li, /^Contre-offre$/) && !btn(li, /Retirer/))
  rpc.length = 0
  await click(btn(li, /^Accepter$/))
  ok('l\'acheteur accepte la contre-offre : respond_offer, accepter', JSON.stringify(rpc.at(-1)) === JSON.stringify(['respond_offer', { p_id: 4, p_accept: true }]))
  await m.unmount()
}

// ---------- offres terminées ----------
{
  const m = await mount([row({ offer_id: 5, status: 'accepted', waiting_on_me: false }), row({ offer_id: 6, status: 'declined', waiting_on_me: false, role: 'buyer' }), row({ offer_id: 7, status: 'cancelled', waiting_on_me: false })])
  ok('offres terminées (acceptée, refusée, annulée) : leur état, aucun bouton', items(m.host).length === 3 && /Acceptée/.test(items(m.host)[0].textContent) && /Refusée/.test(items(m.host)[1].textContent) && /Annulée/.test(items(m.host)[2].textContent) && items(m.host).every((x) => !x.querySelector('button')))
  await m.unmount()
}

// ---------- serveur de la version précédente (sans waiting_on_me) ----------
{
  const old = (o) => { const r = row(o); delete r.waiting_on_me; delete r.proposed_by_me; delete r.rounds; return r }
  const m = await mount([old({ offer_id: 8, role: 'seller' }), old({ offer_id: 9, role: 'buyer' })])
  const [s, b] = items(m.host)
  ok('ancien serveur : le propriétaire garde Accepter et Refuser (pas de Contre-offre, qu\'il ne saurait pas faire), l\'acheteur « Retirer l\'offre »', !!btn(s, /^Accepter$/) && !!btn(s, /^Refuser$/) && !btn(s, /Contre-offre/) && !!btn(b, /^Retirer l’offre$/) && /Offre de Bea/.test(s.textContent) && /Ton offre à Bea/.test(b.textContent))
  await m.unmount()
}

// ---------- messages d'erreur ----------
{
  const m = await mount([row()])
  const alertText = () => m.host.querySelector('[role="alert"]')?.textContent ?? ''
  fail = { fn: 'respond_offer', message: 'buyer_insufficient_coins' }
  await click(btn(items(m.host)[0], /^Accepter$/))
  ok('acheteur sans assez de pièces (propriétaire qui accepte) : message clair, l\'offre reste', /L’acheteur n’a plus assez de pièces/.test(alertText()) && !!btn(items(m.host)[0], /^Accepter$/))
  fail = { fn: 'respond_offer', message: 'not_enough_coins' }
  await click(btn(items(m.host)[0], /^Accepter$/))
  ok('acheteur qui accepte sans assez de pièces : « Tu n\'as pas assez de pièces. »', /Tu n’as pas assez de pièces\./.test(alertText()))
  fail = { fn: 'counter_offer', message: 'too_many_counters' }
  await click(btn(items(m.host)[0], /^Contre-offre$/)); await setValue(items(m.host)[0].querySelector('input'), '33'); await click(btn(items(m.host)[0], /^Envoyer la contre-offre$/))
  ok('trop de contre-offres : message, le formulaire reste ouvert pour pouvoir annuler', /Trop de contre-offres échangées/.test(alertText()) && !!items(m.host)[0].querySelector('form'))
  fail = { fn: 'counter_offer', message: 'same_price' }
  await click(btn(items(m.host)[0], /^Envoyer la contre-offre$/))
  ok('même prix : « Propose un prix différent… »', /Propose un prix différent/.test(alertText()))
  fail = { fn: 'counter_offer', message: 'offer_unavailable' }
  await click(btn(items(m.host)[0], /^Envoyer la contre-offre$/))
  ok('offre plus disponible : message', /Cette offre n’est plus disponible\./.test(alertText()))
  fail = null
  await m.unmount()
}

// ---------- liste vide ----------
{
  const m = await mount([])
  ok('aucune offre : message d\'accueil inchangé', /Aucune offre pour l’instant\./.test(m.host.textContent))
  await m.unmount()
}

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nMarché > Offres : tous les contrôles sont passés.')
process.exit(0)

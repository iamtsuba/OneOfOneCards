// Retour du paiement d'un abonnement sur la page Boosters (vraie page, jsdom) : activation en cours sans bouton d'abonnement, confirmation envoyée au serveur,
// puis état d'abonné avec son booster et son cadeau.
//   node tests/subscription-return.test.mjs
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { JSDOM, VirtualConsole } from 'jsdom'

const SID = 'cs_test_a1B2c3D4e5F6g7'
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: `https://pp.1o1cards.cc/?subscription=success&session_id=${SID}`, pretendToBeVisual: true, virtualConsole: new VirtualConsole() })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }

const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })
const calls = []
let confirmAnswer = () => json({ ok: true, active: true })
globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (u.includes('/functions/v1/')) { calls.push({ name: u.split('/functions/v1/')[1], body: init?.body ? JSON.parse(init.body) : undefined }); return confirmAnswer() }
  return json([])
}

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-ret-'))
await build({
  stdin: { contents: "export { default as Boosters } from './src/components/Boosters.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_CHECKOUT_FUNCTION: 'pp-o1ocards-checkout', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act, useState, useCallback } = React
const { Boosters, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })

const sub = { enabled: true, name: 'OneMore', price_cents: 499, active: false, period_end: null, cancel_at_period_end: false, regen_minutes: 5, booster_name: 'OneMore', booster_color: '#7c3aed', gift_id: 7, gift_name: 'Art Rare assuré', gift_quantity: 1 }
const base = { id: 'u1', username: 'Tsuba', boosters: 7, bonus_boosters: 0, coins: 0, coins_locked: 0, golden_packs: 0, gold_rewards: [], unseen_rewards: [], max_boosters: 10, regen_minutes: 10, regen_amount: 10,
  active_category_id: 5, next_refill_at: null, cards_taken: 10, total_cards: 100, cgv_version: 3, shop_enabled: false, booster_types: [], standard_booster: { id: 1, name: 'Standard', glow: 'none' }, server_now: new Date().toISOString(), subscription: sub }
const activeStatus = { ...base, standard_booster: { id: 9, name: 'OneMore', color: '#7c3aed', glow: 'gold' }, regen_minutes: 5, subscription: { ...sub, active: true, period_end: '2026-11-19T10:00:00+00:00' },
  booster_types: [{ id: 7, name: 'Art Rare assuré', cards: 5, color: '#f59e0b', price: null, quantity: 1 }] }
const catalog = { categoryMap: { 5: { id: 5, name: 'Chattrapez les tous !', color: '#f59e0b', color2: '#c2410c', text_color: '#fff', image: '🐱' } }, typeMap: {}, types: [], rarities: [], cardRef: () => '' }

// La page, avec un « serveur » de statut : getStatus() donne l'état suivant
async function mountPage(getStatus) {
  const host = document.createElement('div'); document.body.appendChild(host)
  const reactRoot = createRoot(host)
  const refreshCalls = []
  function Harness() {
    const [status, setStatus] = useState(base)
    const refreshStatus = useCallback(async () => { refreshCalls.push(1); const s = await getStatus(); setStatus(s); return s }, [])
    return React.createElement(GameContext.Provider, { value: { status, setStatus, refreshStatus, rarityMap: {}, catalog, setRevealing: () => {} } }, React.createElement(Boosters, { goCollection: () => {} }))
  }
  await act(async () => { reactRoot.render(React.createElement(Harness)) })
  return { host, refreshCalls, unmount: async () => { await act(async () => reactRoot.unmount()); host.remove() } }
}
const bandText = (h) => (h.querySelector('.pack-stage .pack-band')?.textContent ?? '')
const text = (h) => h.textContent.replace(/\s+/g, ' ')
const btn = (h, re) => [...h.querySelectorAll('button')].find((b) => re.test(b.textContent))

// ---- Scénario 1 : retour de paiement, le serveur confirme tout de suite
{
  let confirmed = false
  confirmAnswer = () => { confirmed = true; return json({ ok: true, active: true }) }
  const m = await mountPage(async () => (confirmed ? activeStatus : base))
  ok('adresse nettoyée : plus de ?subscription=… ni session_id dans la barre d\'adresse', window.location.search === '')
  ok('la confirmation est demandée une seule fois à la fonction de l\'environnement, avec l\'identifiant de session du retour', calls.length === 1 && calls[0].name === 'pp-o1ocards-subscribe' && JSON.stringify(calls[0].body) === JSON.stringify({ action: 'confirm', session_id: SID }))
  await wait(120)
  ok('abonnement actif : « Abonné OneMore », plus aucun bouton « S’abonner »', /Abonné OneMore/.test(text(m.host)) && !btn(m.host, /S’abonner/) && !/Activation de/.test(text(m.host)))
  ok('message de bienvenue', /Bienvenue dans OneMore ! Tes avantages sont actifs\./.test(text(m.host)))
  ok('on voit le booster OneMore (page, titre du paquet et bouton) et le cadeau avec son bouton Ouvrir', /Booster OneMore « Chattrapez les tous ! »/.test(text(m.host)) && !!btn(m.host, /^Ouvrir un booster OneMore$/) && /Ton cadeau du mois/.test(text(m.host)) && /1 à ouvrir/.test(text(m.host)))
  ok('le paquet affiche le nom du booster sur sa bande (« OneMore » à la place de « 1/1 Cards ») avec un halo doré', bandText(m.host) === 'OneMore' && /has-glow glow-gold/.test(m.host.querySelector('.pack-stage .pack-wrap')?.className ?? ''))
  ok('le cadeau est aussi dans « Autres boosters » (même stock) et s\'ouvre avec un bouton Ouvrir', (m.host.textContent.match(/Art Rare assuré/g) || []).length >= 2 && [...m.host.querySelectorAll('button')].filter((b) => b.textContent === 'Ouvrir').length >= 2)
  await m.unmount()
}

// ---- Scénario 2 : la confirmation échoue, c'est la mise à jour par Stripe (webhook) qui active ; pendant l'attente, aucun bouton d'abonnement
{
  calls.length = 0
  dom.reconfigure({ url: `https://pp.1o1cards.cc/?subscription=success&session_id=${SID}` })
  confirmAnswer = () => json({ error: 'server_error' }, 500)
  let polls = 0
  // 1er appel : rafraîchissement au chargement de la page ; 2e : première vérification après la confirmation ratée ; 3e : 2,5 s plus tard, Stripe a prévenu
  const m = await mountPage(async () => (++polls >= 3 ? activeStatus : base))
  await wait(300)
  ok('confirmation en erreur : l\'attente continue sans bouton « S’abonner » ni message d\'erreur bloquant', /Activation de OneMore…/.test(text(m.host)) && !btn(m.host, /S’abonner/) && !m.host.querySelector('.subscription .msg.error'))
  await wait(3000)
  ok('dès que le serveur annonce l\'abonnement (webhook), l\'état d\'abonné s\'affiche tout seul', /Abonné OneMore/.test(text(m.host)) && !btn(m.host, /S’abonner/) && /Bienvenue dans OneMore/.test(text(m.host)) && polls >= 3)
  await m.unmount()
}

// ---- Scénario 3 : retour sans identifiant de session (ancienne adresse) : pas de confirmation, attente puis activation par le webhook
{
  calls.length = 0
  dom.reconfigure({ url: 'https://pp.1o1cards.cc/?subscription=success' })
  let polls = 0
  const m = await mountPage(async () => (++polls >= 1 ? activeStatus : base))
  await wait(150)
  ok('sans identifiant de session : aucun appel de confirmation, l\'abonnement s\'active quand même par le statut', calls.length === 0 && /Abonné OneMore/.test(text(m.host)))
  await m.unmount()
}

// ---- Scénario 4 : abandon du paiement, et visite normale
{
  calls.length = 0
  dom.reconfigure({ url: 'https://pp.1o1cards.cc/?subscription=cancel' })
  const m = await mountPage(async () => base)
  await wait(100)
  ok('paiement abandonné : message « tu n\'as pas été débité », l\'offre et son bouton restent, aucune confirmation', /Abonnement annulé : tu n’as pas été débité\./.test(text(m.host)) && !!btn(m.host, /S’abonner à OneMore/) && calls.length === 0 && window.location.search === '')
  await m.unmount()
  dom.reconfigure({ url: 'https://pp.1o1cards.cc/' })
  const m2 = await mountPage(async () => base)
  await wait(100)
  ok('visite normale d\'un non abonné : le bouton d\'abonnement est là, ni attente ni confirmation', !!btn(m2.host, /S’abonner à OneMore/) && !/Activation de/.test(text(m2.host)) && calls.length === 0 && /Booster « Chattrapez les tous ! »/.test(text(m2.host)) && !!btn(m2.host, /^Ouvrir un booster$/) && bandText(m2.host) === 'Standard' && !/glow/.test(m2.host.querySelector('.pack-stage .pack-wrap')?.className ?? ''))
  await m2.unmount()
}

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nRetour de paiement (abonnement) : tous les contrôles sont passés.')
process.exit(0)

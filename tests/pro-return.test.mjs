// Pass Pro : retour du paiement sur la vraie page Profil (jsdom) : activation en cours sans bouton d'achat, confirmation envoyée au serveur, puis état de membre
// avec son booster et son cadeau ; et la page Boosters, qui ne propose plus le pass (il s'achète dans le profil).
//   node tests/pro-return.test.mjs
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { JSDOM, VirtualConsole } from 'jsdom'

const SID = 'cs_test_a1B2c3D4e5F6g7'
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: `https://pp.1o1cards.cc/?pro=success&session_id=${SID}`, pretendToBeVisual: true, virtualConsole: new VirtualConsole() })
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
  if (u.includes('my_stats')) return json({ unique_owned: 12, types_completed: 1, series_started: 3, rarest: null })
  return json([])
}

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-ret-'))
await build({
  stdin: { contents: "export { default as Profile } from './src/components/Profile.jsx'; export { default as Boosters } from './src/components/Boosters.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_CHECKOUT_FUNCTION: 'pp-o1ocards-checkout', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act, useState, useCallback } = React
const { Profile, Boosters, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })

const sub = { enabled: true, name: 'OneMore', price_cents: 999, active: false, since: null, regen_minutes: 5, booster_name: 'OneMore', booster_color: '#7c3aed', gift_id: 7, gift_name: 'Art Rare assuré', gift_quantity: 1 }
const base = { id: 'u1', username: 'Tsuba', boosters: 7, bonus_boosters: 0, coins: 0, coins_locked: 0, golden_packs: 0, gold_rewards: [], unseen_rewards: [], max_boosters: 10, regen_minutes: 10, regen_amount: 10,
  active_category_id: 5, next_refill_at: null, cards_taken: 10, total_cards: 100, cgv_version: 3, shop_enabled: false, booster_types: [], standard_booster: { id: 1, name: 'Standard', glow: 'none' }, server_now: new Date().toISOString(), subscription: sub }
const activeStatus = { ...base, standard_booster: { id: 9, name: 'OneMore', color: '#7c3aed', glow: 'gold' }, regen_minutes: 5, subscription: { ...sub, active: true, since: '2026-10-19T10:00:00+00:00' },
  booster_types: [{ id: 7, name: 'Art Rare assuré', cards: 5, color: '#f59e0b', price: null, quantity: 1 }] }
const catalog = { categoryMap: { 5: { id: 5, name: 'Chattrapez les tous !', color: '#f59e0b', color2: '#c2410c', text_color: '#fff', image: '🐱' } }, typeMap: {}, types: [], rarities: [], cardRef: () => '', numberHidden: () => false }
const session = { user: { email: 'tsuba@test.fr' } }

// Une page (Profil ou Boosters) avec un « serveur » de statut : getStatus() donne l'état suivant
async function mountPage(Page, getStatus, props = {}, initial = base) {
  const host = document.createElement('div'); document.body.appendChild(host)
  const reactRoot = createRoot(host)
  function Harness() {
    const [status, setStatus] = useState(initial)
    const refreshStatus = useCallback(async () => { const s = await getStatus(); setStatus(s); return s }, [])
    return React.createElement(GameContext.Provider, { value: { status, setStatus, refreshStatus, rarityMap: {}, catalog, setRevealing: () => {} } }, React.createElement(Page, props))
  }
  await act(async () => { reactRoot.render(React.createElement(Harness)) })
  return { host, unmount: async () => { await act(async () => reactRoot.unmount()); host.remove() } }
}
const text = (h) => h.textContent.replace(/\s+/g, ' ')
const btn = (h, re) => [...h.querySelectorAll('button')].find((b) => re.test(b.textContent))
const bandText = (h) => (h.querySelector('.pack-stage .pack-band')?.textContent ?? '')

// ---- Scénario 1 : retour de paiement, le serveur confirme tout de suite
{
  let confirmed = false
  confirmAnswer = () => { confirmed = true; return json({ ok: true, active: true }) }
  const m = await mountPage(Profile, async () => (confirmed ? activeStatus : base), { session })
  ok('adresse nettoyée : plus de ?pro=… ni session_id dans la barre d\'adresse', window.location.search === '')
  ok('la confirmation est demandée une seule fois à la fonction de l\'environnement, avec l\'identifiant de session du retour', calls.length === 1 && calls[0].name === 'pp-o1ocards-subscribe' && JSON.stringify(calls[0].body) === JSON.stringify({ action: 'confirm', session_id: SID }))
  await wait(120)
  ok('membre : « Membre OneMore à vie », plus aucun bouton d\'achat', /Membre OneMore à vie/.test(text(m.host)) && !btn(m.host, /Devenir/) && !/Activation de/.test(text(m.host)))
  ok('message de bienvenue (à vie)', /Bienvenue dans OneMore ! Tes avantages sont actifs, à vie\./.test(text(m.host)))
  ok('on voit le booster OneMore et le cadeau Pro (1 à ouvrir) dans le profil', /Ton booster/.test(text(m.host)) && /Ton cadeau Pro/.test(text(m.host)) && /1 à ouvrir/.test(text(m.host)))
  ok('le reste du profil est toujours là (pseudo, tuiles de statistiques)', /Tsuba/.test(text(m.host)) && /Cartes complétées/.test(text(m.host)))
  await m.unmount()
}

// ---- Scénario 2 : la confirmation échoue, c'est la mise à jour par Stripe (webhook) qui active ; pendant l'attente, aucun bouton d'achat
{
  calls.length = 0
  dom.reconfigure({ url: `https://pp.1o1cards.cc/?pro=success&session_id=${SID}` })
  confirmAnswer = () => json({ error: 'server_error' }, 500)
  let polls = 0
  // 1er appel : première vérification après la confirmation ratée ; 2e : 2,5 s plus tard, le webhook a donné le pass
  const m = await mountPage(Profile, async () => (++polls >= 2 ? activeStatus : base), { session })
  await wait(300)
  ok('confirmation en erreur : l\'attente continue sans bouton d\'achat ni message d\'erreur bloquant', /Activation de OneMore…/.test(text(m.host)) && !btn(m.host, /Devenir/) && !m.host.querySelector('.subscription .msg.error'))
  await wait(3000)
  ok('dès que le serveur annonce le pass (webhook), l\'état de membre s\'affiche tout seul', /Membre OneMore à vie/.test(text(m.host)) && !btn(m.host, /Devenir/) && /Bienvenue dans OneMore/.test(text(m.host)) && polls >= 2)
  await m.unmount()
}

// ---- Scénario 3 : retour sans identifiant de session : pas de confirmation, activation par le webhook
{
  calls.length = 0
  dom.reconfigure({ url: 'https://pp.1o1cards.cc/?pro=success' })
  const m = await mountPage(Profile, async () => activeStatus, { session })
  await wait(150)
  ok('sans identifiant de session : aucun appel de confirmation, le pass s\'active quand même par le statut', calls.length === 0 && /Membre OneMore à vie/.test(text(m.host)))
  await m.unmount()
}

// ---- Scénario 4 : abandon du paiement, et visite normale du profil
{
  calls.length = 0
  dom.reconfigure({ url: 'https://pp.1o1cards.cc/?pro=cancel' })
  const m = await mountPage(Profile, async () => base, { session })
  await wait(100)
  ok('paiement abandonné : message « tu n\'as pas été débité », l\'offre et son bouton restent, aucune confirmation', /Achat annulé : tu n’as pas été débité\./.test(text(m.host)) && !!btn(m.host, /Devenir OneMore à vie/) && calls.length === 0 && window.location.search === '')
  await m.unmount()
  dom.reconfigure({ url: 'https://pp.1o1cards.cc/' })
  const m2 = await mountPage(Profile, async () => base, { session })
  await wait(100)
  ok('visite normale d\'un non membre : l\'offre du pass est dans le profil (prix une seule fois, avantages), ni attente ni confirmation', !!btn(m2.host, /Devenir OneMore à vie/) && /9,99 € une seule fois/.test(text(m2.host).replace(/[\u202f\u00a0]/g, ' ')) && !/Activation de/.test(text(m2.host)) && calls.length === 0)
  await m2.unmount()
  const m3 = await mountPage(Profile, async () => base, { session }, { ...base, subscription: { ...sub, enabled: false } })
  ok('vente fermée : aucune offre dans le profil', !btn(m3.host, /Devenir/) && !m3.host.querySelector('.subscription'))
  await m3.unmount()
}

// ---- Scénario 5 : le bouton d'achat ouvre la fenêtre de paiement (consentement)
{
  const m = await mountPage(Profile, async () => base, { session })
  await wait(100)
  await act(async () => { btn(m.host, /Devenir OneMore à vie/).dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  ok('« Devenir OneMore à vie » ouvre la fenêtre de consentement à deux cases', !!m.host.querySelector('[role="dialog"][aria-label="Devenir OneMore à vie"]') && m.host.querySelectorAll('[role="dialog"] input[type="checkbox"]').length === 2)
  await m.unmount()
}

// ---- Page Boosters : plus de pass ici ; le booster des membres y est reconnaissable
{
  const mb = await mountPage(Boosters, async () => base, { goCollection: () => {} })
  await wait(100)
  ok('page Boosters, non membre : aucune offre ni bouton d\'achat du pass (il s\'achète dans le profil), paquet « Standard » sans halo', !mb.host.querySelector('.subscription') && !btn(mb.host, /Devenir|S’abonner/) && !/OneMore/.test(text(mb.host)) && bandText(mb.host) === 'Standard' && !/glow/.test(mb.host.querySelector('.pack-stage .pack-wrap')?.className ?? ''))
  await mb.unmount()
  const mm = await mountPage(Boosters, async () => activeStatus, { goCollection: () => {} }, activeStatus)
  await wait(100)
  const host = mm.host
  ok('page Boosters, membre : paquet « Booster OneMore » avec halo doré et bouton d\'ouverture OneMore, le cadeau dans « Autres boosters », mais pas de panneau du pass ni de bouton de gestion', bandText(host) === 'OneMore' && /has-glow glow-gold/.test(host.querySelector('.pack-stage .pack-wrap')?.className ?? '') && !!btn(host, /^Ouvrir un booster OneMore$/) && /Art Rare assuré/.test(text(host)) && !host.querySelector('.subscription') && !btn(host, /Gérer/))
  await mm.unmount()
}

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nPass Pro (retour de paiement, profil) : tous les contrôles sont passés.')
process.exit(0)

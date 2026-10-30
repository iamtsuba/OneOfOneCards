// Pass Pro (achat unique, à vie) côté interface : panneau (offre / membre), consentement à deux cases, appels vers les fonctions serveur, avec jsdom.
//   node tests/pro-view.test.mjs
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

// Réseau simulé : seules les infos légales sont lues ici (les fonctions serveur sont simulées plus bas)
const json = (v) => new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } })
const invoked = []
let answer = { status: 200, body: { url: 'https://checkout.stripe.test/sub' } }   // réponse des fonctions serveur simulées
globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (u.includes('/functions/v1/')) {
    invoked.push({ name: u.split('/functions/v1/')[1], body: init?.body ? JSON.parse(init.body) : undefined })
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'content-type': 'application/json' } })
  }
  if (u.includes('_legal')) return json([{ key: 'consent_cgv_text', value: 'J’accepte les CGV.' }, { key: 'consent_withdrawal_text', value: 'Je renonce à me rétracter.' }])
  if (u.includes('_config')) return json([{ key: 'stripe_pack_boosters', value: 10 }, { key: 'stripe_pack_price_cents', value: 199 }, { key: 'cgv_version', value: 3 }])
  return json([])
}

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-sub-'))
await build({
  stdin: { contents: "export { ProPanel, ProForm, ProConsent } from './src/components/Pro.jsx'; export * as api from './src/api.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_CHECKOUT_FUNCTION: 'pp-o1ocards-checkout', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { createRoot } = require('react-dom/client')
const { act } = React
const { ProPanel, ProForm, ProConsent, api } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const norm = (h) => h.replace(/\u202f|\u00a0/g, ' ')
const noop = () => {}

// ---------- panneau ----------
const offer = { enabled: true, name: 'OneMore', price_cents: 999, active: false, since: null, regen_minutes: 5, booster_name: 'OneMore', booster_color: '#7c3aed', gift_id: 7, gift_name: 'Art Rare assuré', gift_quantity: 1, discount_percent: 20 }
const panel = (sub, props = {}) => norm(renderToStaticMarkup(React.createElement(ProPanel, { sub, baseMinutes: 10, onBuy: noop, ...props })))
const o = panel(offer)
ok('rien du tout sans information (ancien serveur) ni quand la vente est fermée et que le joueur n\'est pas membre', panel(undefined) === '' && panel(null) === '' && panel({ ...offer, enabled: false }) === '')
ok('offre : nom, prix en euros « une seule fois, avantages à vie, sans abonnement », bouton « Devenir OneMore à vie »', /<strong class="sub-title">OneMore<\/strong>/.test(o) && /<strong>9,99 €<\/strong> une seule fois, avantages à vie, sans abonnement/.test(o) && />Devenir OneMore à vie</.test(o))
ok('offre : plus aucune notion de mensualité (mois, renouvellement, résiliation, gérer)', !/mois|renouvel|résili|Gérer|S’abonner/i.test(o.replace(/une seule fois, avantages à vie, sans abonnement/, '')))
ok('offre : cinq avantages, un par ligne avec sa pastille (boosters toutes les 5 minutes au lieu de 10, −20 % sur tous les boosters, bouton Vente rapide par rareté, booster des membres à la place du Standard, booster cadeau)', (o.match(/<li><span class="perk-ico"/g) || []).length === 5 && /<strong>Boosters toutes les 5 minutes<\/strong><small>au lieu de 10 minutes<\/small>/.test(o) && /<strong>−20 % sur tous les boosters<\/strong>/.test(o) && /<strong>Bouton Vente rapide par rareté<\/strong>/.test(o) && /<strong>Le booster OneMore remplace le Standard<\/strong>/.test(o) && /<strong>1 booster Art Rare assuré offert<\/strong><small>à l’achat<\/small>/.test(o))
ok('offre : sans cadeau (quantité 0 ou booster absent) la ligne disparaît ; sans booster des membres aussi ; recharge identique : pas de « au lieu de » ; remise à 0 ou inconnue (ancien serveur) : pas de ligne de remise', !/offert/.test(panel({ ...offer, gift_quantity: 0 })) && !/offert/.test(panel({ ...offer, gift_name: null })) && !/remplace le Standard/.test(panel({ ...offer, booster_name: null })) && !/au lieu de/.test(panel({ ...offer, regen_minutes: 10 })) && !/sur tous les boosters/.test(panel({ ...offer, discount_percent: 0 })) && !/sur tous les boosters/.test(panel({ ...offer, discount_percent: undefined })) && /−35 % sur tous les boosters/.test(panel({ ...offer, discount_percent: 35 })))
ok('offre : le prix et le nom suivent les réglages (12,99 €, Premium)', /12,99 €/.test(panel({ ...offer, price_cents: 1299 })) && /Devenir Premium à vie/.test(panel({ ...offer, name: 'Premium' })) && /aria-label="Pass Premium"/.test(panel({ ...offer, name: 'Premium' })))
const member = { ...offer, active: true, since: '2026-10-19T10:00:00+00:00' }
const giftItem = { id: 7, name: 'Art Rare assuré', color: '#f59e0b', quantity: 1 }
const a = panel(member, { gift: giftItem })
ok('membre : « Membre OneMore à vie », date depuis laquelle, « aucun renouvellement », plus aucun bouton', /Membre OneMore à vie/.test(a) && /Depuis le 19 octobre 2026\. Aucun renouvellement : c’est à toi pour toujours\./.test(a) && !/<button/.test(a) && !/Devenir/.test(a))
ok('membre : ses avantages en pastilles (boosters toutes les 5 minutes, −20 % sur tous les boosters, bouton Vente rapide par rareté) ; plus de liste à puces simple', (a.match(/<li><span class="perk-ico"/g) || []).length === 3 && /<strong>Boosters toutes les 5 minutes<\/strong>/.test(a) && !/au lieu de/.test(a) && /<strong>−20 % sur tous les boosters<\/strong>/.test(a) && /<strong>Bouton Vente rapide par rareté<\/strong>/.test(a) && !/Recharge de tes boosters/.test(a) && !/Le booster OneMore remplace/.test(a))
ok('membre : on voit SON booster (OneMore, à la place du Standard) et SON cadeau Pro (1 à ouvrir, où le trouver)', /Ton booster<\/small><strong>OneMore<\/strong><small>à la place du Standard/.test(a) && /Ton cadeau Pro<\/small><strong>Art Rare assuré<\/strong><small>1 à ouvrir \(page Boosters, « Autres boosters »\)/.test(a) && /--c:#7c3aed/.test(a) && /--c:#f59e0b/.test(a) && /toutes les 5 minutes/.test(a) && !/au lieu de/.test(a))
ok('membre : cadeau déjà ouvert ou pas dans le stock -> « déjà ouvert » ; sans cadeau configuré, la ligne disparaît ; sans booster, aussi', /déjà ouvert/.test(panel(member, { gift: { ...giftItem, quantity: 0 } })) && /déjà ouvert/.test(panel(member)) && !/Ton cadeau Pro/.test(panel({ ...member, gift_quantity: 0 })) && !/Ton cadeau Pro/.test(panel({ ...member, gift_name: null })) && !/Ton booster/.test(panel({ ...member, booster_name: null })))
ok('membre quand la vente est fermée aux nouveaux : le panneau reste ; sans date connue : pas de phrase de date, pas de plantage', /Membre OneMore à vie/.test(panel({ ...member, enabled: false })) && !/Invalid|NaN|undefined|Depuis/.test(panel({ ...member, since: null })))
const pend = panel(offer, { pending: true })
ok('retour de paiement : « Activation de OneMore… », plus aucun bouton d\'achat, indiqué comme occupé', /Activation de OneMore…/.test(pend) && !/Devenir/.test(pend) && !/<button/.test(pend) && /aria-busy="true"/.test(pend) && /Ton paiement est validé/.test(pend))
ok('activation en cours même si la vente est fermée ; dès que le pass est actif, l\'état de membre remplace l\'attente ; tout fermé : rien', /Activation de OneMore…/.test(panel({ ...offer, enabled: false }, { pending: true })) && /Membre OneMore à vie/.test(panel(member, { pending: true })) && !/Activation de/.test(panel(member, { pending: true })) && panel({ ...offer, enabled: false }, { pending: false }) === '')
ok('erreur affichée en alerte ; bouton d\'achat désactivé pendant une action', /role="alert">Oups/.test(panel(offer, { error: 'Oups' })) && /disabled="">Devenir OneMore à vie/.test(panel(offer, { busy: true })))
{
  const { readFileSync } = await import('node:fs')
  const css = readFileSync(path.join(root, 'src/styles.css'), 'utf8')
  ok('bouton d\'achat du pass centré sous les avantages (plus aligné à gauche)', /\.subscription \.btn \{ justify-self: center; \}/.test(css) && !/\.subscription \.btn \{ justify-self: start; \}/.test(css))
  ok('fond du jeu : doré clair pour un membre (html.subscriber), gris clair sinon', /html\.subscriber \{ --bg: #fbf1d3; \}/.test(css) && /:root \{\s*--bg: #e9ebf4;/.test(css))
}

// ---------- formulaire de consentement ----------
const mount = async (element) => {
  const host = document.createElement('div'); document.body.appendChild(host)
  const reactRoot = createRoot(host)
  await act(async () => { reactRoot.render(element) })
  return { host, unmount: async () => { await act(async () => reactRoot.unmount()); host.remove() } }
}
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) }) }
const texts = { cgv: 'J’accepte les CGV.', withdrawal: 'Je renonce à me rétracter.' }
{
  const calls = []
  const m = await mount(React.createElement(ProForm, { texts, name: 'OneMore', price: '9,99 €', busy: false, error: '', onConfirm: () => calls.push('ok'), onCancel: () => calls.push('annule'), onOpenTerms: () => calls.push('cgv') }))
  const boxes = [...m.host.querySelectorAll('input[type="checkbox"]')]
  const submit = () => [...m.host.querySelectorAll('button')].find((b) => /Payer/.test(b.textContent))
  ok('consentement : DEUX cases seulement (CGV, renonciation à la rétractation), aucune case de renouvellement ; prix payé une seule fois, sans abonnement', boxes.length === 2 && !/renouvelé/.test(m.host.textContent) && /9,99 €/.test(norm(m.host.textContent)) && /payé une seule fois\. Pas d’abonnement, pas de renouvellement/.test(norm(m.host.textContent)) && /Payer 9,99 €/.test(norm(submit().textContent)))
  ok('consentement : bouton désactivé tant que les deux cases ne sont pas cochées', submit().disabled === true)
  await click(boxes[0])
  ok('consentement : une case sur deux ne suffit pas', submit().disabled === true)
  await click(submit())
  ok('consentement : un clic sur le bouton désactivé ne déclenche rien', calls.length === 0)
  await click(boxes[1])
  ok('consentement : les deux cochées, le bouton s\'active', submit().disabled === false)
  await click(boxes[1])
  ok('consentement : décocher une case le désactive de nouveau', submit().disabled === true)
  await click(boxes[1]); await click(submit())
  ok('consentement : confirmer appelle l\'achat une seule fois', calls.join() === 'ok')
  await click([...m.host.querySelectorAll('button')].find((b) => b.textContent === 'Annuler')); await click([...m.host.querySelectorAll('button.link')][0])
  ok('consentement : Annuler et « Lire les conditions de vente » fonctionnent', calls.join() === 'ok,annule,cgv')
  await m.unmount()
}
{
  const m = await mount(React.createElement(ProForm, { texts: null, name: 'OneMore', price: '9,99 €', busy: false, error: '', onConfirm: noop, onCancel: noop, onOpenTerms: noop }))
  for (const b of m.host.querySelectorAll('input[type="checkbox"]')) await click(b)
  ok('consentement : tant que les textes légaux ne sont pas chargés, impossible de payer même avec les cases cochées', [...m.host.querySelectorAll('button')].find((b) => /Payer/.test(b.textContent)).disabled === true && /Chargement…/.test(m.host.textContent))
  await m.unmount()
}
{
  const m = await mount(React.createElement(ProForm, { texts, name: 'OneMore', price: '9,99 €', busy: true, error: 'Oups', onConfirm: noop, onCancel: noop, onOpenTerms: noop }))
  ok('consentement : pendant la redirection, « Redirection… » et Annuler désactivés ; l\'erreur est lue en alerte', /Redirection…/.test(m.host.textContent) && [...m.host.querySelectorAll('button')].find((b) => b.textContent === 'Annuler').disabled === true && m.host.querySelector('[role="alert"]')?.textContent === 'Oups')
  await m.unmount()
}

// ---------- appels vers les fonctions serveur ----------
const failWith = (code, status = 409) => ({ status, body: { error: code } })
const consent = { cgv: true, withdrawal: true, version: 3 }
ok('achat : appelle la fonction de l\'environnement (pp-o1ocards-subscribe) avec les deux consentements et renvoie l\'adresse Stripe', (await api.startSubscription(consent)) === 'https://checkout.stripe.test/sub' && invoked.at(-1).name === 'pp-o1ocards-subscribe' && JSON.stringify(invoked.at(-1).body) === JSON.stringify({ consent }))
ok('plus de portail de gestion d\'abonnement : la fonction n\'existe plus côté interface', api.openSubscriptionPortal === undefined)
answer = failWith('already_subscribed')
ok('déjà membre : message clair', await api.startSubscription(consent).then(() => '', (e) => api.explain(e)) === 'Tu as déjà ce pass : il est à toi pour toujours.')
answer = failWith('subscription_disabled', 403)
ok('vente fermée : message clair', await api.startSubscription(consent).then(() => '', (e) => api.explain(e)) === 'Le pass n’est pas disponible pour le moment.')
answer = failWith('consent_required', 400)
ok('consentement manquant : message clair (« les deux cases »)', /coche les deux cases/.test(await api.startSubscription(consent).then(() => '', (e) => api.explain(e))))
answer = failWith('cgv_outdated', 409)
ok('conditions de vente changées : message clair', /Les conditions de vente ont changé/.test(await api.startSubscription(consent).then(() => '', (e) => api.explain(e))))
answer = { status: 200, body: {} }
ok('réponse sans adresse : erreur claire, pas de redirection vers « undefined »', await api.startSubscription(consent).then(() => '', (e) => e.message) === 'checkout:no_url')

// ---------- fenêtre complète : textes légaux chargés, deux cases, appel avec la version des CGV ----------
{
  answer = { status: 200, body: { url: 'https://checkout.stripe.test/sub' } }
  invoked.length = 0
  const status = { cgv_version: 3, subscription: { name: 'OneMore', price_cents: 999 } }
  const m = await mount(React.createElement(ProConsent, { status, onClose: noop }))
  await act(async () => { await new Promise((r) => setTimeout(r, 60)) })
  ok('fenêtre : les textes légaux de la base sont affichés dans les deux premières cases', /J’accepte les CGV\./.test(m.host.textContent) && /Je renonce à me rétracter\./.test(m.host.textContent))
  for (const b of m.host.querySelectorAll('input[type="checkbox"]')) await click(b)
  await click([...m.host.querySelectorAll('button')].find((b) => /Payer/.test(b.textContent)))
  await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
  ok('fenêtre : l\'achat est demandé avec les deux consentements et la version des CGV de la base (3)', invoked.length === 1 && invoked[0].name === 'pp-o1ocards-subscribe' && JSON.stringify(invoked[0].body) === JSON.stringify({ consent: { cgv: true, withdrawal: true, version: 3 } }))
  answer = failWith('stripe_error', 502); invoked.length = 0
  await m.unmount()
  const m2 = await mount(React.createElement(ProConsent, { status, onClose: noop }))
  await act(async () => { await new Promise((r) => setTimeout(r, 60)) })
  for (const b of m2.host.querySelectorAll('input[type="checkbox"]')) await click(b)
  await click([...m2.host.querySelectorAll('button')].find((b) => /Payer/.test(b.textContent)))
  await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
  ok('fenêtre : si Stripe refuse, l\'erreur s\'affiche et on peut réessayer (bouton de nouveau actif)', !!m2.host.querySelector('[role="alert"]') && [...m2.host.querySelectorAll('button')].find((b) => /Payer/.test(b.textContent))?.disabled === false)
  await m2.unmount()
}

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nPass Pro (interface) : tous les contrôles sont passés.')
process.exit(0)

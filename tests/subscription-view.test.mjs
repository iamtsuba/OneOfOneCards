// Abonnement côté interface : panneau (offre / abonné), consentement à trois cases, appels vers les fonctions serveur, avec jsdom.
//   node tests/subscription-view.test.mjs
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
  stdin: { contents: "export { SubscriptionPanel, SubscribeForm, SubscribeConsent } from './src/components/Subscription.jsx'; export * as api from './src/api.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_CHECKOUT_FUNCTION: 'pp-o1ocards-checkout', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { createRoot } = require('react-dom/client')
const { act } = React
const { SubscriptionPanel, SubscribeForm, SubscribeConsent, api } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const norm = (h) => h.replace(/\u202f|\u00a0/g, ' ')
const noop = () => {}

// ---------- panneau ----------
const offer = { enabled: true, name: 'OneMore', price_cents: 499, active: false, period_end: null, cancel_at_period_end: false, regen_minutes: 5, booster_name: 'OneMore', gift_name: 'Art Rare assuré', gift_quantity: 1 }
const panel = (sub, props = {}) => norm(renderToStaticMarkup(React.createElement(SubscriptionPanel, { sub, baseMinutes: 10, onSubscribe: noop, onManage: noop, ...props })))
const o = panel(offer)
ok('rien du tout sans information d\'abonnement (ancien serveur) ni quand l\'abonnement est fermé et que le joueur n\'est pas abonné', panel(undefined) === '' && panel(null) === '' && panel({ ...offer, enabled: false }) === '')
ok('offre : nom, prix mensuel en euros, « résiliable à tout moment », bouton « S’abonner à OneMore »', /<strong class="sub-title">OneMore<\/strong>/.test(o) && /<strong>4,99 €<\/strong> par mois, résiliable à tout moment/.test(o) && />S’abonner à OneMore</.test(o) && !/Gérer mon abonnement/.test(o))
ok('offre : les trois avantages (recharge 5 min au lieu de 10, booster des abonnés à la place du Standard, booster cadeau chaque mois)', /Recharge de tes boosters toutes les 5 minutes au lieu de 10/.test(o) && /Le booster OneMore \(de meilleures cartes\) remplace le booster Standard/.test(o) && /1 booster Art Rare assuré offert chaque mois/.test(o))
ok('offre : pluriel du cadeau (3 boosters offerts) ; sans cadeau (quantité 0 ou booster absent) la ligne disparaît', /3 booster Art Rare assuré offert chaque mois/.test(panel({ ...offer, gift_quantity: 3 })) && !/offert chaque mois/.test(panel({ ...offer, gift_quantity: 0 })) && !/offert chaque mois/.test(panel({ ...offer, gift_name: null })))
ok('offre : sans booster des abonnés, la ligne disparaît ; recharge identique au normal : pas de « au lieu de »', !/remplace le booster Standard/.test(panel({ ...offer, booster_name: null })) && !/au lieu de/.test(panel({ ...offer, regen_minutes: 10 })))
ok('offre : le prix suit le réglage (7,99 €) et le nom suit le réglage (Premium)', /7,99 €/.test(panel({ ...offer, price_cents: 799 })) && /S’abonner à Premium/.test(panel({ ...offer, name: 'Premium' })) && /aria-label="Abonnement Premium"/.test(panel({ ...offer, name: 'Premium' })))
const active = { ...offer, active: true, period_end: '2026-11-01T10:00:00+00:00' }
const a = panel(active)
ok('abonné : « Abonné OneMore », date du prochain renouvellement, avantages en cours, bouton « Gérer mon abonnement », plus de bouton d\'abonnement', /Abonné OneMore/.test(a) && /Prochain renouvellement le 1 novembre 2026/.test(a) && /toutes les 5 minutes/.test(a) && !/au lieu de/.test(a) && />Gérer mon abonnement</.test(a) && !/S’abonner/.test(a))
const giftItem = { id: 7, name: 'Art Rare assuré', color: '#f59e0b', quantity: 1 }
const ag = panel({ ...active, booster_color: '#7c3aed', gift_id: 7 }, { gift: giftItem })
ok('abonné : on voit SON booster (OneMore, à la place du Standard) et SON cadeau du mois (Art Rare assuré, 1 à ouvrir) avec un bouton Ouvrir', /Ton booster<\/small><strong>OneMore<\/strong><small>à la place du Standard/.test(ag) && /Ton cadeau du mois<\/small><strong>Art Rare assuré<\/strong><small>1 à ouvrir/.test(ag) && /<button type="button" class="btn small">Ouvrir<\/button>/.test(ag) && /--c:#7c3aed/.test(ag) && /--c:#f59e0b/.test(ag))
ok('abonné : cadeau pas (encore) dans le stock -> « aucun en stock pour l\'instant », sans bouton Ouvrir', /aucun en stock pour l’instant/.test(panel(active, { gift: { ...giftItem, quantity: 0 } })) && !/>Ouvrir</.test(panel(active, { gift: { ...giftItem, quantity: 0 } })) && /aucun en stock pour l’instant/.test(panel(active)))
ok('abonné : sans cadeau configuré (quantité 0 ou booster absent), seule la ligne du booster reste', !/Ton cadeau du mois/.test(panel({ ...active, gift_quantity: 0 })) && !/Ton cadeau du mois/.test(panel({ ...active, gift_name: null })) && /Ton booster/.test(panel({ ...active, gift_name: null })) && !/Ton booster/.test(panel({ ...active, booster_name: null })))
const pend = panel(offer, { pending: true })
ok('retour de paiement : « Activation de OneMore… », plus aucun bouton d\'abonnement, indiqué comme occupé', /Activation de OneMore…/.test(pend) && !/S’abonner/.test(pend) && !/<button/.test(pend) && /aria-busy="true"/.test(pend) && /Ton paiement est validé/.test(pend))
ok('activation en cours même si l\'abonnement est fermé aux nouveaux ; dès que l\'abonnement est actif, l\'état d\'abonné remplace l\'attente', /Activation de OneMore…/.test(panel({ ...offer, enabled: false }, { pending: true })) && /Abonné OneMore/.test(panel(active, { pending: true })) && !/Activation de/.test(panel(active, { pending: true })))
ok('ni offre ni attente quand tout est fermé : rien', panel({ ...offer, enabled: false }, { pending: false }) === '')
ok('abonné qui a résilié : « se termine le … » à la place du renouvellement', /Ton abonnement se termine le 1 novembre 2026\./.test(panel({ ...active, cancel_at_period_end: true })) && !/Prochain renouvellement/.test(panel({ ...active, cancel_at_period_end: true })))
ok('abonné quand l\'abonnement est fermé aux nouveaux : le panneau reste (gérer / résilier), sans proposer de s\'abonner', /Gérer mon abonnement/.test(panel({ ...active, enabled: false })) && !/S’abonner/.test(panel({ ...active, enabled: false })))
ok('abonné sans date connue : pas de phrase de date, pas de plantage', !/Invalid|NaN|undefined/.test(panel({ ...active, period_end: null })) && !/renouvellement/.test(panel({ ...active, period_end: null })))
ok('erreur affichée en alerte ; bouton désactivé pendant une action', /role="alert">Portail indisponible/.test(panel(active, { error: 'Portail indisponible' })) && /disabled="">Ouverture…/.test(panel(active, { busy: true })) && /disabled="">S’abonner à OneMore/.test(panel(offer, { busy: true })))

// ---------- le cadeau s'ouvre depuis le panneau ----------
{
  const opened = []
  const host0 = document.createElement('div'); document.body.appendChild(host0)
  const r0 = createRoot(host0)
  await act(async () => { r0.render(React.createElement(SubscriptionPanel, { sub: { ...active, gift_id: 7 }, baseMinutes: 10, onSubscribe: noop, onManage: noop, gift: giftItem, onOpenGift: (it) => opened.push(it.id) })) })
  await act(async () => { [...host0.querySelectorAll('button')].find((b) => b.textContent === 'Ouvrir').dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  ok('cadeau : « Ouvrir » demande l\'ouverture du booster cadeau (identifiant 7)', opened.join() === '7')
  await act(async () => r0.unmount()); host0.remove()
}
{
  const { readFileSync } = await import('node:fs')
  const css = readFileSync(path.join(root, 'src/styles.css'), 'utf8')
  ok('fond du jeu : doré clair pour un abonné (html.subscriber), gris clair sinon', /html\.subscriber \{ --bg: #fbf1d3; \}/.test(css) && /:root \{\s*--bg: #e9ebf4;/.test(css))
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
  const m = await mount(React.createElement(SubscribeForm, { texts, name: 'OneMore', price: '4,99 €', busy: false, error: '', onConfirm: () => calls.push('ok'), onCancel: () => calls.push('annule'), onOpenTerms: () => calls.push('cgv') }))
  const boxes = [...m.host.querySelectorAll('input[type="checkbox"]')]
  const submit = () => [...m.host.querySelectorAll('button')].find((b) => /S’abonner/.test(b.textContent))
  ok('consentement : trois cases (CGV, renonciation à la rétractation, renouvellement automatique) et le prix mensuel annoncé', boxes.length === 3 && /renouvelé automatiquement chaque mois jusqu’à sa résiliation/.test(m.host.textContent) && /4,99 € par mois/.test(norm(m.host.textContent)) && /S’abonner · 4,99 € \/ mois/.test(norm(submit().textContent)))
  ok('consentement : bouton désactivé tant que les trois cases ne sont pas cochées', submit().disabled === true)
  await click(boxes[0]); await click(boxes[1])
  ok('consentement : deux cases sur trois ne suffisent pas', submit().disabled === true)
  await click(submit())
  ok('consentement : un clic sur le bouton désactivé ne déclenche rien', calls.length === 0)
  await click(boxes[2])
  ok('consentement : les trois cochées, le bouton s\'active', submit().disabled === false)
  await click(boxes[1])
  ok('consentement : décocher une case le désactive de nouveau', submit().disabled === true)
  await click(boxes[1]); await click(submit())
  ok('consentement : confirmer appelle la souscription une seule fois', calls.join() === 'ok')
  await click([...m.host.querySelectorAll('button')].find((b) => b.textContent === 'Annuler')); await click([...m.host.querySelectorAll('button.link')][0])
  ok('consentement : Annuler et « Lire les conditions de vente » fonctionnent', calls.join() === 'ok,annule,cgv')
  await m.unmount()
}
{
  const m = await mount(React.createElement(SubscribeForm, { texts: null, name: 'OneMore', price: '4,99 €', busy: false, error: '', onConfirm: noop, onCancel: noop, onOpenTerms: noop }))
  for (const b of m.host.querySelectorAll('input[type="checkbox"]')) await click(b)
  ok('consentement : tant que les textes légaux ne sont pas chargés, impossible de payer même avec les cases cochées', [...m.host.querySelectorAll('button')].find((b) => /S’abonner/.test(b.textContent)).disabled === true && /Chargement…/.test(m.host.textContent))
  await m.unmount()
}
{
  const m = await mount(React.createElement(SubscribeForm, { texts, name: 'OneMore', price: '4,99 €', busy: true, error: 'Oups', onConfirm: noop, onCancel: noop, onOpenTerms: noop }))
  ok('consentement : pendant la redirection, « Redirection… » et Annuler désactivés ; l\'erreur est lue en alerte', /Redirection…/.test(m.host.textContent) && [...m.host.querySelectorAll('button')].find((b) => b.textContent === 'Annuler').disabled === true && m.host.querySelector('[role="alert"]')?.textContent === 'Oups')
  await m.unmount()
}

// ---------- appels vers les fonctions serveur ----------
const failWith = (code, status = 409) => ({ status, body: { error: code } })
const consent = { cgv: true, withdrawal: true, recurring: true, version: 3 }
ok('souscription : appelle la fonction de l\'environnement (pp-o1ocards-subscribe) avec les trois consentements et renvoie l\'adresse Stripe', (await api.startSubscription(consent)) === 'https://checkout.stripe.test/sub' && invoked.at(-1).name === 'pp-o1ocards-subscribe' && JSON.stringify(invoked.at(-1).body) === JSON.stringify({ consent }))
ok('portail : appelle pp-o1ocards-subscription-portal sans rien envoyer du navigateur (le client est retrouvé côté serveur)', (await api.openSubscriptionPortal()) === 'https://checkout.stripe.test/sub' && invoked.at(-1).name === 'pp-o1ocards-subscription-portal' && JSON.stringify(invoked.at(-1).body) === '{}')
answer = failWith('already_subscribed')
ok('déjà abonné : message clair', await api.startSubscription(consent).then(() => '', (e) => api.explain(e)) === 'Tu es déjà abonné : utilise « Gérer mon abonnement ».')
answer = failWith('subscription_disabled', 403)
ok('abonnement fermé : message clair', await api.startSubscription(consent).then(() => '', (e) => api.explain(e)) === 'L’abonnement n’est pas disponible pour le moment.')
answer = failWith('consent_required', 400)
ok('consentement manquant : message clair (« toutes les cases »)', /coche toutes les cases/.test(await api.startSubscription(consent).then(() => '', (e) => api.explain(e))))
answer = failWith('no_subscription', 404)
ok('portail sans abonnement : message clair', await api.openSubscriptionPortal().then(() => '', (e) => api.explain(e)) === 'Aucun abonnement à gérer pour ce compte.')
answer = failWith('cgv_outdated', 409)
ok('conditions de vente changées : message clair', /Les conditions de vente ont changé/.test(await api.startSubscription(consent).then(() => '', (e) => api.explain(e))))
answer = { status: 200, body: {} }
ok('réponse sans adresse : erreur claire, pas de redirection vers « undefined »', await api.startSubscription(consent).then(() => '', (e) => e.message) === 'checkout:no_url')

// ---------- fenêtre complète : textes légaux chargés, trois cases, appel avec la version des CGV ----------
{
  answer = { status: 200, body: { url: 'https://checkout.stripe.test/sub' } }
  invoked.length = 0
  const status = { cgv_version: 3, subscription: { name: 'OneMore', price_cents: 499 } }
  const m = await mount(React.createElement(SubscribeConsent, { status, onClose: noop }))
  await act(async () => { await new Promise((r) => setTimeout(r, 60)) })
  ok('fenêtre : les textes légaux de la base sont affichés dans les deux premières cases', /J’accepte les CGV\./.test(m.host.textContent) && /Je renonce à me rétracter\./.test(m.host.textContent))
  for (const b of m.host.querySelectorAll('input[type="checkbox"]')) await click(b)
  await click([...m.host.querySelectorAll('button')].find((b) => /S’abonner ·/.test(b.textContent)))
  await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
  ok('fenêtre : la souscription est demandée avec les trois consentements et la version des CGV de la base (3)', invoked.length === 1 && invoked[0].name === 'pp-o1ocards-subscribe' && JSON.stringify(invoked[0].body) === JSON.stringify({ consent: { cgv: true, withdrawal: true, recurring: true, version: 3 } }))
  answer = failWith('stripe_error', 502); invoked.length = 0
  await m.unmount()
  const m2 = await mount(React.createElement(SubscribeConsent, { status, onClose: noop }))
  await act(async () => { await new Promise((r) => setTimeout(r, 60)) })
  for (const b of m2.host.querySelectorAll('input[type="checkbox"]')) await click(b)
  await click([...m2.host.querySelectorAll('button')].find((b) => /S’abonner ·/.test(b.textContent)))
  await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
  ok('fenêtre : si Stripe refuse, l\'erreur s\'affiche et on peut réessayer (bouton de nouveau actif)', !!m2.host.querySelector('[role="alert"]') && [...m2.host.querySelectorAll('button')].find((b) => /S’abonner ·/.test(b.textContent))?.disabled === false)
  await m2.unmount()
}

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nAbonnement (interface) : tous les contrôles sont passés.')
process.exit(0)

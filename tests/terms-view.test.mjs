// Conditions générales d'utilisation : texte, onglet dans la fenêtre des conditions, fenêtre obligatoire d'acceptation, avec jsdom.
//   node tests/terms-view.test.mjs
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
let acceptFail = null
let legalRows = [{ key: 'seller_name', value: 'Thomas Martin' }, { key: 'seller_email', value: 'contact@example.com' }, { key: 'seller_address', value: '1 rue du Jeu, 75000 Paris' }]
let configRows = [{ key: 'cgv_version', value: 1 }, { key: 'cgu_version', value: 2 }, { key: 'stripe_pack_price_cents', value: 199 }, { key: 'stripe_pack_boosters', value: 10 }]
globalThis.fetch = async (url, init) => {
  const u = String(url); const body = init?.body ? JSON.parse(init.body) : {}
  if (u.includes('accept_terms')) { rpc.push(['accept_terms', body]); return acceptFail ? json({ message: acceptFail }, 400) : json({ status: { cgu_accepted: true, cgu_version: body.p_version } }) }
  if (u.includes('_legal')) return json(legalRows)
  if (u.includes('_config')) return json(configRows)
  return json([])
}

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-terms-'))
await build({
  stdin: { contents: "export { CguGate } from './src/components/Terms.jsx'; export { TermsDocument } from './src/components/TermsText.jsx'; export { default as LegalSheet } from './src/components/Legal.jsx'; export { GameContext } from './src/game.js'; export { supabase } from './src/supabase.js'; export { CGU_VERSION } from './src/terms.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { createRoot } = require('react-dom/client')
const { act } = React
const { CguGate, TermsDocument, LegalSheet, GameContext, supabase, CGU_VERSION } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const norm = (t) => t.replace(/\u202f|\u00a0/g, ' ')
const wait = (ms = 40) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) }); await wait(30) }
const btn = (root2, re) => [...root2.querySelectorAll('button')].find((b) => re.test(b.textContent))

// ---------- le texte ----------
const doc = renderToStaticMarkup(React.createElement(TermsDocument, { legal: legalRows.reduce((o, r) => ({ ...o, [r.key]: r.value }), {}), version: 2 }))
const heads = [...doc.matchAll(/<h3>([^<]*)<\/h3>/g)].map((m) => m[1])
ok('texte : titre « Conditions générales d\'utilisation » et version', /<h2>Conditions générales d’utilisation<\/h2>/.test(doc) && /Version 2\./.test(doc))
ok('texte : 13 articles numérotés dans l\'ordre', heads.length === 13 && heads.every((h, i) => h.startsWith(`${i + 1}. `)))
ok('texte : couvre compte et pseudo définitif, absence d\'email, objets virtuels, échanges (offres, contre-offre, revente rapide), sanctions, modification', /Le pseudo est unique et définitif/.test(doc) && /sans adresse email/.test(doc) && /n’ont pas de valeur monétaire/.test(doc) && /contre-offre/.test(doc) && /revente rapide à la banque/.test(doc) && /suspendre ou supprimer le compte/.test(doc) && /La nouvelle version t’est présentée/.test(doc))
ok('texte : l\'éditeur et son contact viennent des réglages légaux', /Thomas Martin/.test(doc) && /contact@example\.com/.test(doc) && /1 rue du Jeu/.test(doc) && !/\[à compléter\]/.test(doc))
const empty = renderToStaticMarkup(React.createElement(TermsDocument, { legal: {} }))
ok('texte : une information d\'éditeur manquante est signalée « [à compléter] » (jamais « undefined »)', /\[à compléter\]/.test(empty) && !/undefined|null/.test(empty) && /Version 1\./.test(empty))

// ---------- la fenêtre des conditions : deux onglets ----------
const mountSheet = async (props = {}) => {
  const host = document.createElement('div'); document.body.appendChild(host)
  const r = createRoot(host)
  await act(async () => { r.render(React.createElement(LegalSheet, { onClose: () => {}, ...props })) })
  await wait(60)
  return { host, unmount: async () => { await act(async () => r.unmount()); host.remove() } }
}
{
  const m = await mountSheet()
  const tabs = [...m.host.querySelectorAll('[role="tab"]')]
  ok('fenêtre : deux onglets, Conditions de vente (ouvert par défaut) et Conditions d\'utilisation', tabs.length === 2 && tabs[0].textContent === 'Conditions de vente' && tabs[1].textContent === 'Conditions d’utilisation' && tabs[0].getAttribute('aria-selected') === 'true')
  ok('fenêtre : par défaut, les conditions de vente', /<h2>Conditions générales de vente<\/h2>/.test(m.host.innerHTML) && !/Conditions générales d’utilisation<\/h2>/.test(m.host.innerHTML) && m.host.querySelector('[role="dialog"]').getAttribute('aria-label') === 'Conditions de vente')
  await click(tabs[1])
  ok('onglet « Conditions d\'utilisation » : le texte d\'utilisation, avec la version du serveur (2)', /Conditions générales d’utilisation<\/h2>/.test(m.host.innerHTML) && /Version 2\./.test(m.host.textContent) && !/<h2>Conditions générales de vente/.test(m.host.innerHTML) && m.host.querySelector('[role="dialog"]').getAttribute('aria-label') === 'Conditions d’utilisation')
  await click([...m.host.querySelectorAll('[role="tab"]')][0])
  ok('retour à l\'onglet des conditions de vente', /<h2>Conditions générales de vente<\/h2>/.test(m.host.innerHTML))
  await m.unmount()
  const m2 = await mountSheet({ initial: 'cgu' })
  ok('ouverte avec initial = « cgu » (lien des conditions d\'utilisation) : directement sur ce texte', /Conditions générales d’utilisation<\/h2>/.test(m2.host.innerHTML) && [...m2.host.querySelectorAll('[role="tab"]')][1].getAttribute('aria-selected') === 'true')
  await m2.unmount()
}

// ---------- la fenêtre obligatoire ----------
const mountGate = async (status) => {
  const host = document.createElement('div'); document.body.appendChild(host)
  const r = createRoot(host)
  const set = []
  await act(async () => { r.render(React.createElement(GameContext.Provider, { value: { status, setStatus: (s) => set.push(s) } }, React.createElement(CguGate))) })
  return { host, set, unmount: async () => { await act(async () => r.unmount()); host.remove() } }
}
{
  const g = await mountGate({ cgu_version: 3, cgu_accepted: false })
  ok('fenêtre obligatoire : titre, version en vigueur (3), case à cocher, « Continuer » inactif tant que la case n\'est pas cochée', /Conditions générales d’utilisation/.test(g.host.textContent) && /version 3/.test(g.host.textContent) && !!g.host.querySelector('input[type="checkbox"]') && btn(g.host, /^Continuer$/).disabled === true && !!btn(g.host, /^Me déconnecter$/))
  ok('fenêtre obligatoire : un lien pour LIRE les conditions, aucune croix pour fermer', !!btn(g.host, /Lire les conditions générales d’utilisation/) && !btn(g.host, /Fermer|×/))
  rpc.length = 0
  await click(btn(g.host, /^Continuer$/))
  ok('bouton inactif : aucun appel', rpc.length === 0)
  await click(g.host.querySelector('input[type="checkbox"]'))
  ok('case cochée : « Continuer » actif', btn(g.host, /^Continuer$/).disabled === false)
  await click(btn(g.host, /^Continuer$/))
  ok('accepter : accept_terms avec la version EN VIGUEUR du serveur (3), le statut renvoyé remplace l\'ancien', rpc.length === 1 && rpc[0][1].p_version === 3 && g.set.length === 1 && g.set[0].cgu_accepted === true)
  await g.unmount()
  const g2 = await mountGate({ cgu_version: 4, cgu_accepted: false })
  acceptFail = 'terms_outdated'
  await click(g2.host.querySelector('input[type="checkbox"]')); await click(btn(g2.host, /^Continuer$/))
  ok('version périmée côté serveur : message clair, la fenêtre reste', /Les conditions d’utilisation viennent de changer/.test(g2.host.querySelector('[role="alert"]')?.textContent ?? '') && g2.set.length === 0 && !!btn(g2.host, /^Continuer$/))
  acceptFail = null
  let signedOut = 0
  const realSignOut = supabase.auth.signOut; supabase.auth.signOut = async () => { signedOut++ }
  await click(btn(g2.host, /^Me déconnecter$/))
  supabase.auth.signOut = realSignOut
  ok('« Me déconnecter » : quitte la partie sans accepter', signedOut === 1)
  await click(btn(g2.host, /Lire les conditions générales d’utilisation/)); await wait(60)
  ok('« Lire » ouvre le texte des conditions d\'utilisation (par-dessus la fenêtre)', /Conditions générales d’utilisation<\/h2>/.test(g2.host.innerHTML) && !!g2.host.querySelector('.legal-overlay .legal-overlay, .legal-panel .legal-overlay'))
  await g2.unmount()
}
ok('version connue du site à l\'inscription : 1', CGU_VERSION === 1)

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nConditions d\'utilisation : tous les contrôles sont passés.')
process.exit(0)

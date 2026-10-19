// Lien d'invitation d'ami : logique pure (lecture du lien, stockage, acceptation), bloc « Inviter par lien » de l'écran Amis, bandeau « invité par … » de la
// connexion, avec jsdom.
//   node tests/invite.test.mjs
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { JSDOM, VirtualConsole } from 'jsdom'

const CODE = '0123456789abcdef0123'
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://pp.1o1cards.cc/', pretendToBeVisual: true, virtualConsole: new VirtualConsole() })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }

const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })
const rpcCalls = []
let inviteCode = CODE
let previewName = 'Tsuba'
globalThis.fetch = async (url, init) => {
  const u = String(url)
  const body = init?.body ? JSON.parse(init.body) : {}
  if (u.includes('friend_invite_code')) { rpcCalls.push(['code', body]); if (body.p_reset) inviteCode = 'f'.repeat(20); return json(inviteCode) }
  if (u.includes('friend_invite_preview')) { rpcCalls.push(['preview', body]); return json(body.p_code === CODE ? previewName : null) }
  if (u.includes('friends_list')) return json([])
  if (u.includes('/status') || u.includes('get_status')) return json({})
  return json([])
}

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-inv-'))
await build({
  stdin: { contents: "export * as inv from './src/invite.js'; export { default as Friends, FriendsView, InviteBlock } from './src/components/Friends.jsx'; export { default as Auth } from './src/components/Auth.jsx'; export { GameContext } from './src/game.js'; export { explain } from './src/api.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { createRoot } = require('react-dom/client')
const { act } = React
const { inv, Friends, FriendsView, InviteBlock, Auth, GameContext, explain } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const noop = () => {}
const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m } }

// ---------- logique pure ----------
ok('code valide : 20 caractères hexadécimaux en minuscules, rien d\'autre', inv.isInviteCode(CODE) && !inv.isInviteCode('ABCDEF0123456789ABCD') && !inv.isInviteCode('abc') && !inv.isInviteCode('') && !inv.isInviteCode(null) && !inv.isInviteCode(undefined) && !inv.isInviteCode(CODE + '0') && !inv.isInviteCode('0123456789abcdef012g') && !inv.isInviteCode(12345678901234567890))
ok('lien : adresse du site (préproduction ou production) + ?ami=code, sans double barre', inv.inviteLink('https://pp.1o1cards.cc', CODE) === `https://pp.1o1cards.cc/?ami=${CODE}` && inv.inviteLink('https://1o1cards.cc/', CODE) === `https://1o1cards.cc/?ami=${CODE}`)
ok('lecture du lien : code valide trouvé, adresse nettoyée', (() => { const r = inv.readInvite(`?ami=${CODE}`); return r.present && r.code === CODE && r.search === '' })())
ok('lecture du lien : les autres paramètres sont gardés (?pro=success&ami=…)', (() => { const r = inv.readInvite(`?pro=success&ami=${CODE}&x=1`); return r.code === CODE && r.search === '?pro=success&x=1' })())
ok('lecture du lien : code mal formé = présent mais invalide (nettoyé, jamais retenu)', (() => { const r = inv.readInvite('?ami=n-importe-quoi'); return r.present && r.code === null && r.search === '' })() && inv.readInvite('?ami=').code === null)
ok('lecture du lien : sans paramètre ami, rien ne change', (() => { const r = inv.readInvite('?pro=cancel'); return !r.present && r.code === null && r.search === '?pro=cancel' })() && !inv.readInvite('').present && !inv.readInvite(undefined).present)
{
  const st = memory()
  inv.savePendingInvite(st, CODE); inv.savePendingInvite(st, 'mauvais')
  ok('stockage : seul un code valide est retenu ; il se relit ; il s\'efface', inv.loadPendingInvite(st) === CODE && (inv.clearPendingInvite(st), inv.loadPendingInvite(st) === null))
  const broken = { getItem() { throw new Error('bloqué') }, setItem() { throw new Error('bloqué') }, removeItem() { throw new Error('bloqué') } }
  ok('stockage bloqué (navigation privée) : aucune erreur, simplement rien de retenu', (() => { inv.savePendingInvite(broken, CODE); inv.clearPendingInvite(broken); return inv.loadPendingInvite(broken) === null })())
  st.setItem(inv.PENDING_KEY, 'corrompu')
  ok('valeur corrompue dans le stockage : ignorée', inv.loadPendingInvite(st) === null)
}
{
  const d2 = new JSDOM('<!doctype html>', { url: `https://pp.1o1cards.cc/?ami=${CODE}&pro=success#haut`, virtualConsole: new VirtualConsole() })
  const code = inv.captureInviteFromUrl(d2.window)
  ok('à l\'arrivée sur le site : le code est retenu, l\'adresse nettoyée (autres paramètres et ancre gardés)', code === CODE && inv.loadPendingInvite(d2.window.localStorage) === CODE && d2.window.location.search === '?pro=success' && d2.window.location.hash === '#haut')
  const d3 = new JSDOM('<!doctype html>', { url: 'https://pp.1o1cards.cc/?ami=faux', virtualConsole: new VirtualConsole() })
  ok('lien invalide à l\'arrivée : rien retenu, adresse nettoyée', inv.captureInviteFromUrl(d3.window) === null && inv.loadPendingInvite(d3.window.localStorage) === null && d3.window.location.search === '')
  const d4 = new JSDOM('<!doctype html>', { url: 'https://pp.1o1cards.cc/', virtualConsole: new VirtualConsole() })
  ok('arrivée normale : rien retenu', inv.captureInviteFromUrl(d4.window) === null && inv.loadPendingInvite(d4.window.localStorage) === null)
}
{
  const st = memory(); const calls = []
  ok('rien en attente : rien à faire, aucun appel', (await inv.runPendingInvite(st, async (c) => calls.push(c))).kind === 'none' && calls.length === 0)
  inv.savePendingInvite(st, CODE)
  const r = await inv.runPendingInvite(st, async (c) => { calls.push(c); return { ok: true, already: false, friend: 'Tsuba' } })
  ok('invitation acceptée : « joined », le pseudo de l\'ami, appel avec le code, code effacé (jamais rejoué)', r.kind === 'joined' && r.friend === 'Tsuba' && calls.join() === CODE && inv.loadPendingInvite(st) === null && inv.inviteMessage(r, explain) === 'Tu es maintenant ami avec Tsuba !')
  inv.savePendingInvite(st, CODE)
  const r2 = await inv.runPendingInvite(st, async () => ({ ok: true, already: true, friend: 'Tsuba' }))
  ok('déjà amis : message adapté, code effacé', r2.kind === 'already' && inv.inviteMessage(r2, explain) === 'Tu es déjà ami avec Tsuba.' && inv.loadPendingInvite(st) === null)
  for (const code of ['invalid_invite', 'cannot_friend_self', 'inviter_full', 'too_many_friends']) {
    inv.savePendingInvite(st, CODE)
    const r3 = await inv.runPendingInvite(st, async () => { throw new Error(code) })
    ok(`refus définitif (${code}) : message clair et code effacé`, r3.kind === 'error' && inv.loadPendingInvite(st) === null && inv.inviteMessage(r3, explain).length > 10 && !/Error|undefined/.test(inv.inviteMessage(r3, explain)))
  }
  inv.savePendingInvite(st, CODE)
  const r4 = await inv.runPendingInvite(st, async () => { throw new Error('Failed to fetch') })
  ok('réseau coupé : le code est GARDÉ pour réessayer à la prochaine ouverture', r4.kind === 'error' && inv.loadPendingInvite(st) === CODE)
}
ok('messages : lien périmé et ami complet expliqués', /n’est plus valide/.test(explain(new Error('invalid_invite'))) && /limite de 200 amis/.test(explain(new Error('inviter_full'))))

// ---------- bloc « Inviter par lien » (rendu) ----------
const view = (invite) => renderToStaticMarkup(React.createElement(InviteBlock, { invite, onCopy: noop, onShare: noop, onReset: noop }))
const idle = { link: '', copied: false, canShare: false, busy: false, error: '' }
ok('bloc : explication claire et bouton « Copier mon lien d\'invitation » ; pas encore de lien affiché', /vous devenez amis automatiquement/.test(view(idle)) && />Copier mon lien d’invitation</.test(view(idle)) && !/<input/.test(view(idle)) && !/Nouveau lien/.test(view(idle)))
ok('bloc : une fois le lien prêt, il s\'affiche (lecture seule) avec « Nouveau lien » ; « Partager » seulement si le téléphone le permet', /<input class="invite-link" readonly="" [^>]*value="https:\/\/pp\.1o1cards\.cc\/\?ami=0123/.test(view({ ...idle, link: `https://pp.1o1cards.cc/?ami=${CODE}` })) && />Nouveau lien</.test(view({ ...idle, link: 'https://x/?ami=a' })) && !/Partager/.test(view({ ...idle, link: 'https://x/?ami=a' })) && />Partager</.test(view({ ...idle, link: 'https://x/?ami=a', canShare: true })))
ok('bloc : « Lien copié ✓ » après la copie ; boutons désactivés pendant une action ; erreur lue en alerte', />Lien copié ✓</.test(view({ ...idle, copied: true })) && /disabled="">Copier/.test(view({ ...idle, busy: true })) && /role="alert">Oups/.test(view({ ...idle, error: 'Oups' })))
ok('écran Amis : le bloc est présent entre « Ajouter un ami » et les listes ; sans info d\'invitation (anciens tests), il n\'apparaît pas', (() => { const full = renderToStaticMarkup(React.createElement(FriendsView, { rows: [], results: null, query: '', notice: '', error: '', busy: false, invite: idle, onCopyInvite: noop, onShareInvite: noop, onResetInvite: noop, onQuery: noop, onSearch: noop, onRequest: noop, onRespond: noop, onRemove: noop, onOpen: noop })); const without = renderToStaticMarkup(React.createElement(FriendsView, { rows: [], results: null, query: '', notice: '', error: '', busy: false, onQuery: noop, onSearch: noop, onRequest: noop, onRespond: noop, onRemove: noop, onOpen: noop })); return full.indexOf('Ajouter un ami') < full.indexOf('Inviter un ami par lien') && full.indexOf('Inviter un ami par lien') < full.indexOf('Mes amis') && !/Inviter un ami par lien/.test(without) })())

// ---------- écran Amis réel : copie du lien, partage, nouveau lien ----------
const mount = async (element) => {
  const host = document.createElement('div'); document.body.appendChild(host)
  const reactRoot = createRoot(host)
  await act(async () => { reactRoot.render(element) })
  return { host, unmount: async () => { await act(async () => reactRoot.unmount()); host.remove() } }
}
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) }) }
const btn = (h, re) => [...h.querySelectorAll('button')].find((b) => re.test(b.textContent))
const ctx = { status: {}, setStatus: noop, refreshStatus: async () => ({}) }
{
  const copied = []
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async (t) => { copied.push(t) } }, configurable: true })
  const m = await mount(React.createElement(GameContext.Provider, { value: ctx }, React.createElement(Friends)))
  await wait(60)
  ok('l\'écran demande le code dès l\'ouverture (la copie part directement du toucher) et affiche le lien du site actuel', rpcCalls.some((c) => c[0] === 'code' && c[1].p_reset === false) && m.host.querySelector('.invite-link')?.value === `https://pp.1o1cards.cc/?ami=${CODE}`)
  await click(btn(m.host, /Copier mon lien d’invitation/)); await wait(20)
  ok('toucher « Copier mon lien d\'invitation » copie le lien et affiche « Lien copié ✓ »', copied.at(-1) === `https://pp.1o1cards.cc/?ami=${CODE}` && /Lien copié ✓/.test(m.host.textContent))
  await wait(2700)
  ok('« Lien copié ✓ » disparaît après quelques secondes', !/Lien copié ✓/.test(m.host.textContent) && !!btn(m.host, /Copier mon lien d’invitation/))
  window.confirm = () => false
  const before = rpcCalls.length
  await click(btn(m.host, /Nouveau lien/))
  ok('« Nouveau lien » demande confirmation ; refusée : rien ne change', rpcCalls.length === before && m.host.querySelector('.invite-link').value.endsWith(CODE))
  window.confirm = () => true
  await click(btn(m.host, /Nouveau lien/)); await wait(40)
  ok('confirmé : un nouveau code est demandé (reset) et le lien affiché change ; l\'ancien lien n\'est plus montré', rpcCalls.at(-1)[1].p_reset === true && m.host.querySelector('.invite-link').value === `https://pp.1o1cards.cc/?ami=${'f'.repeat(20)}`)
  ok('pas de bouton « Partager » quand le navigateur ne sait pas partager', !btn(m.host, /Partager/))
  await m.unmount()
  // partage natif
  const shared = []
  Object.defineProperty(window.navigator, 'share', { value: async (d) => { shared.push(d) }, configurable: true })
  inviteCode = CODE
  const m2 = await mount(React.createElement(GameContext.Provider, { value: ctx }, React.createElement(Friends)))
  await wait(60)
  await click(btn(m2.host, /Partager/))
  ok('« Partager » ouvre le partage du téléphone avec le lien', shared.length === 1 && shared[0].url === `https://pp.1o1cards.cc/?ami=${CODE}` && /ami/.test(shared[0].text))
  await m2.unmount()
  // copie impossible
  delete window.navigator.share
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async () => { throw new Error('refusé') } }, configurable: true })
  const m3 = await mount(React.createElement(GameContext.Provider, { value: ctx }, React.createElement(Friends)))
  await wait(60)
  await click(btn(m3.host, /Copier mon lien d’invitation/)); await wait(20)
  ok('copie refusée par le navigateur : message clair et lien à sélectionner à la main (pas de faux « copié »)', /Copie automatique impossible/.test(m3.host.textContent) && !/Lien copié ✓/.test(m3.host.textContent) && !!m3.host.querySelector('.invite-link'))
  await m3.unmount()
}

// ---------- bandeau « invité par … » sur l'écran de connexion ----------
{
  window.localStorage.setItem(inv.PENDING_KEY, CODE)
  const m = await mount(React.createElement(Auth))
  await wait(60)
  ok('lien ouvert avant la connexion : « Tu as été invité par Tsuba », amitié automatique après connexion', /Tu as été invité par Tsuba/.test(m.host.textContent) && /vous deviendrez amis automatiquement/.test(m.host.textContent))
  await m.unmount()
  previewName = null
  const m2 = await mount(React.createElement(Auth))
  await wait(60)
  ok('code qui n\'existe plus (aperçu vide) : aucun bandeau', !/invité par/.test(m2.host.textContent))
  await m2.unmount()
  window.localStorage.removeItem(inv.PENDING_KEY)
  rpcCalls.length = 0
  const m3 = await mount(React.createElement(Auth))
  await wait(60)
  ok('connexion normale : aucun bandeau, aucun appel d\'aperçu', !/invité par/.test(m3.host.textContent) && !rpcCalls.some((c) => c[0] === 'preview'))
  await m3.unmount()
}

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nLien d\'invitation d\'ami : tous les contrôles sont passés.')
process.exit(0)

// Console admin > Utilisateurs : liste, tri, recherche, détail par collection, offrir / retirer OneMore, avec jsdom.
//   node tests/admin-users.test.mjs
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { JSDOM, VirtualConsole } from 'jsdom'

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://pp.1o1cards.cc/', pretendToBeVisual: true, virtualConsole: new VirtualConsole() })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
dom.window.matchMedia = dom.window.matchMedia ?? (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const adminData = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/admin_data.json'), 'utf8'))

const cats = [{ id: 1, name: 'Chat’trapez les tous !', closed: false }, { id: 2, name: 'Ancienne collection', closed: true }]
const U = (o) => ({ created_at: '2026-10-01T10:00:00Z', pro: null, collections: [], ...o })
const usersFixture = () => ({
  total: 5, shown: 5, categories: cats,
  users: [
    U({ id: 'u1', username: 'Alice', cards: 10, doubles: 6, collections: [{ category_id: 1, cards: 8, doubles: 5 }, { category_id: 2, cards: 2, doubles: 1 }] }),
    U({ id: 'u2', username: 'Bob', cards: 2, doubles: 1, pro: { active: true, source: 'paid', since: '2026-10-19T10:00:00Z' }, collections: [{ category_id: 1, cards: 2, doubles: 1 }] }),
    U({ id: 'u3', username: 'Cleo', cards: 0, doubles: 0, pro: { active: true, source: 'admin', since: '2026-10-20T10:00:00Z' } }),
    U({ id: 'u4', username: 'david', cards: 1, doubles: 0, collections: [{ category_id: 1, cards: 1, doubles: 0 }] }),
    U({ id: 'u5', username: 'Emma', cards: 4, doubles: 9, collections: [{ category_id: 1, cards: 4, doubles: 9 }] }),
  ],
})

const rpc = []
let grantReply = { ok: true, gift_granted: true }
let usersReply = usersFixture()
globalThis.fetch = async (url, init) => {
  const u = String(url); const body = init?.body ? JSON.parse(init.body) : {}
  if (u.includes('admin_users')) { rpc.push(['admin_users', body]); return json(usersReply) }
  if (u.includes('admin_grant_pro')) { rpc.push(['admin_grant_pro', body]); return json(grantReply) }
  if (u.includes('admin_revoke_pro')) { rpc.push(['admin_revoke_pro', body]); return json({ ok: true }) }
  if (u.includes('admin_data')) { rpc.push(['admin_data', body]); return json(adminData) }
  return json([])
}

const require = createRequire(import.meta.url)
const out = mkdtempSync(path.join(root, 'tests', '.out-ausers-'))
await build({
  stdin: { contents: "export { default as Admin, UsersTab, AdminShell } from './src/components/Admin.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = React
const { Admin, UsersTab, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const wait = (ms = 40) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) }); await wait(30) }
const type = async (el, v) => { await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new window.Event('input', { bubbles: true })) }) }
const pick = async (sel, v) => { await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(sel, v); sel.dispatchEvent(new window.Event('change', { bubbles: true })) }) }
const submit = async (form) => { await act(async () => { form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 40)) }) }
const btn = (el, re) => [...el.querySelectorAll('button')].find((b) => re.test(b.textContent))
const norm = (t) => t.replace(/\u202f|\u00a0/g, ' ').replace(/\s+/g, ' ')
const names = (h) => [...h.querySelectorAll('.user-name')].map((n) => n.textContent)
const card = (h, name) => [...h.querySelectorAll('.user-card')].find((c) => c.querySelector('.user-name').textContent === name)

// ---------- l'onglet seul ----------
const loads = []; const runs = []
let notice = ''
const run = async (action, message) => { runs.push(message); const res = await action('mdp-admin'); notice = typeof message === 'function' ? message(res) : message }
const mount = async (props) => {
  const host = document.createElement('div'); document.body.appendChild(host); const r = createRoot(host)
  await act(async () => { r.render(React.createElement(UsersTab, { users: usersFixture(), onLoad: (s) => loads.push(s), run, busy: false, ...props })) })
  await wait(30)
  return { host, unmount: async () => { await act(async () => r.unmount()); host.remove() } }
}
{
  const m = await mount({ users: null })
  ok('premier affichage : « Chargement… » et la liste est demandée au serveur UNE fois (sans recherche)', /Chargement…/.test(m.host.textContent) && loads.length === 1 && loads[0] === '')
  await m.unmount(); loads.length = 0
}
{
  const m = await mount()
  ok('liste déjà chargée : aucun rechargement automatique', loads.length === 0)
  ok('résumé : 5 joueurs affichés, 2 avec OneMore', /5 joueurs affichés · 2 avec OneMore/.test(norm(m.host.querySelector('.users-count').textContent)))
  ok('tri par défaut : le plus de cartes d\'abord (Alice 10, Emma 4, Bob 2, david 1, Cleo 0)', names(m.host).join(',') === 'Alice,Emma,Bob,david,Cleo')
  await pick(m.host.querySelector('.users-sort select'), 'doubles')
  ok('tri « Plus de doublons » : Emma (9), Alice (6), Bob (1), puis david et Cleo (0, départagés par les cartes)', names(m.host).join(',') === 'Emma,Alice,Bob,david,Cleo')
  await pick(m.host.querySelector('.users-sort select'), 'name')
  ok('tri par pseudo (sans tenir compte de la casse) : Alice, Bob, Cleo, david, Emma', names(m.host).join(',') === 'Alice,Bob,Cleo,david,Emma')
  const a = card(m.host, 'Alice'), b = card(m.host, 'Bob'), c = card(m.host, 'Cleo'), d = card(m.host, 'david')
  ok('chaque joueur : son nombre de cartes et de doublons, avec le singulier (« 1 carte », « 0 doublon », « 1 doublon »)', /10 cartes/.test(a.textContent) && /6 doublons/.test(a.textContent) && /1 carte(?!s)/.test(d.querySelector('.user-stats').textContent) && /0 doublon(?!s)/.test(d.querySelector('.user-stats').textContent) && /1 doublon(?!s)/.test(b.querySelector('.user-stats').textContent))
  ok('pastilles du pass : Bob « OneMore · payé », Cleo « OneMore · offert », Alice rien', /OneMore · payé/.test(b.textContent) && /OneMore · offert/.test(c.textContent) && !a.querySelector('.chip-pro') && b.querySelector('.chip-pro').classList.contains('paid') && c.querySelector('.chip-pro').classList.contains('admin'))
  ok('boutons : Alice « Offrir OneMore » ; Cleo (offert) « Retirer OneMore » ; Bob (payé) aucun bouton, seulement l\'explication Stripe', !!btn(a, /^Offrir OneMore$/) && !!btn(c, /^Retirer OneMore$/) && !btn(b, /OneMore/) && /Pass payé : remboursement dans Stripe/.test(b.textContent))
  ok('détail par collection : un lien pour les joueurs qui ont des cartes, aucun pour Cleo (0 carte) ; replié au départ', !!btn(a, /^Détail par collection$/) && !btn(c, /Détail/) && !a.querySelector('.user-collections'))
  await click(btn(a, /^Détail par collection$/))
  const lines = [...a.querySelectorAll('.user-collections li')].map((li) => norm(li.textContent))
  ok('détail : le nom de chaque collection, ses cartes et ses doublons ; « (terminée) » pour une collection fermée', lines.length === 2 && /Chat’trapez les tous !8 cartes · 5 doublons/.test(lines[0]) && /Ancienne collection \(terminée\)2 cartes · 1 doublon/.test(lines[1]))
  ok('le lien devient « Masquer… » (déplié) ; un seul détail ouvert à la fois', !!btn(a, /^Masquer le détail par collection$/) && a.querySelector('button.link').getAttribute('aria-expanded') === 'true')
  await click(btn(b, /^Détail par collection$/))
  ok('ouvrir celui de Bob referme celui d\'Alice', !card(m.host, 'Alice').querySelector('.user-collections') && !!card(m.host, 'Bob').querySelector('.user-collections'))
  await m.unmount()
}
{
  // recherche
  loads.length = 0
  const m = await mount({ users: { ...usersFixture(), total: 12, shown: 5 } })
  ok('plus de joueurs que montrés : « 5 joueurs affichés sur 12 »', /5 joueurs affichés sur 12/.test(norm(m.host.querySelector('.users-count').textContent)))
  ok('pas de bouton « Tout afficher » sans recherche', !btn(m.host, /Tout afficher/))
  await type(m.host.querySelector('#users-q'), '  ali ')
  await submit(m.host.querySelector('form.users-search'))
  ok('recherche : la liste est redemandée avec le morceau de pseudo sans espaces superflus (« ali »)', loads.length === 1 && loads[0] === 'ali')
  ok('« Tout afficher » apparaît et la recherche est rappelée dans le résumé', !!btn(m.host, /^Tout afficher$/) && /pour « ali »/.test(m.host.querySelector('.users-count').textContent))
  await click(btn(m.host, /^Tout afficher$/))
  ok('« Tout afficher » : recherche effacée, liste complète redemandée', loads.length === 2 && loads[1] === '' && m.host.querySelector('#users-q').value === '' && !btn(m.host, /Tout afficher/))
  await m.unmount()
  const e = await mount({ users: { ...usersFixture(), total: 0, shown: 0, users: [] } })
  ok('aucun joueur : message simple, résumé « 0 joueur affiché · 0 avec OneMore »', /Aucun joueur trouvé\./.test(e.host.textContent) && /0 joueur affiché · 0 avec OneMore/.test(norm(e.host.querySelector('.users-count').textContent)))
  await e.unmount()
}
{
  // offrir OneMore : confirmation en deux temps
  loads.length = 0; rpc.length = 0; runs.length = 0; notice = ''
  const m = await mount()
  const a = () => card(m.host, 'Alice')
  await click(btn(a(), /^Offrir OneMore$/))
  ok('« Offrir OneMore » demande d\'abord confirmation (« Offrir OneMore à Alice ? »), rien n\'est envoyé', /Offrir OneMore à Alice \?/.test(a().textContent) && !!btn(a(), /^Confirmer l’offre$/) && !!btn(a(), /^Annuler$/) && rpc.length === 0 && runs.length === 0)
  await click(btn(a(), /^Annuler$/))
  ok('Annuler : retour au bouton, rien d\'envoyé', !!btn(a(), /^Offrir OneMore$/) && rpc.length === 0)
  await click(btn(a(), /^Offrir OneMore$/)); await click(btn(card(m.host, 'Emma'), /^Offrir OneMore$/))
  ok('une seule confirmation à la fois (celle d\'Emma remplace celle d\'Alice)', !btn(a(), /Confirmer/) && !!btn(card(m.host, 'Emma'), /^Confirmer l’offre$/))
  await click(btn(a(), /^Offrir OneMore$/))
  await click(btn(a(), /^Confirmer l’offre$/))
  ok('confirmer : UN appel admin_grant_pro avec le mot de passe admin et l\'identifiant d\'Alice', rpc.length === 1 && rpc[0][0] === 'admin_grant_pro' && rpc[0][1].p_password === 'mdp-admin' && rpc[0][1].p_user === 'u1')
  ok('message de succès avec le pseudo et le booster cadeau', notice === 'OneMore offert à Alice (booster cadeau Pro compris).')
  ok('la liste est redemandée juste après (état à jour)', loads.length === 1)
  grantReply = { ok: true, gift_granted: false }
  await click(btn(card(m.host, 'Emma'), /^Offrir OneMore$/)); await click(btn(card(m.host, 'Emma'), /^Confirmer l’offre$/))
  ok('sans booster cadeau : message sans mention du cadeau', notice === 'OneMore offert à Emma.')
  grantReply = { ok: true, gift_granted: true }
  // retirer
  rpc.length = 0
  const c = () => card(m.host, 'Cleo')
  await click(btn(c(), /^Retirer OneMore$/))
  ok('« Retirer OneMore » : confirmation « Retirer OneMore à Cleo ? » puis « Confirmer le retrait »', /Retirer OneMore à Cleo \?/.test(c().textContent) && !!btn(c(), /^Confirmer le retrait$/) && rpc.length === 0)
  await click(btn(c(), /^Confirmer le retrait$/))
  ok('confirmer le retrait : admin_revoke_pro (Cleo), message « OneMore retiré à Cleo. »', rpc.length === 1 && rpc[0][0] === 'admin_revoke_pro' && rpc[0][1].p_user === 'u3' && notice === 'OneMore retiré à Cleo.')
  await m.unmount()
  // pendant une opération : boutons figés
  const busy = await mount({ busy: true })
  ok('opération en cours : les boutons sont désactivés (pas de double envoi)', [...busy.host.querySelectorAll('.user-actions button, .users-search button')].every((b) => b.disabled))
  await busy.unmount()
}

// ---------- dans la vraie console admin (mot de passe, onglets, appels serveur) ----------
{
  rpc.length = 0; usersReply = usersFixture(); grantReply = { ok: true, gift_granted: true }
  const host = document.createElement('div'); document.body.appendChild(host); const r = createRoot(host)
  await act(async () => { r.render(React.createElement(GameContext.Provider, { value: { refreshCatalog: async () => {}, refreshStatus: async () => {}, status: {} } }, React.createElement(Admin, { onClose: () => {} }))) })
  await type(host.querySelector('input[type="password"]'), 'mon-mdp')
  await submit(host.querySelector('form'))
  await wait(60)
  const tabs = [...host.querySelectorAll('[role="tab"]')].map((t) => t.textContent.replace(/\d+$/, '').trim())
  ok('console admin : un onglet « Utilisateurs » entre « Raretés » et « 1/1 gagnées »', tabs.indexOf('Utilisateurs') > 0 && tabs[tabs.indexOf('Utilisateurs') - 1] === 'Raretés' && tabs[tabs.indexOf('Utilisateurs') + 1] === '1/1 gagnées')
  ok('la liste n\'est pas chargée tant qu\'on n\'ouvre pas l\'onglet (rien de lourd à la connexion)', !rpc.some((c) => c[0] === 'admin_users'))
  await click([...host.querySelectorAll('[role="tab"]')].find((t) => /^Utilisateurs/.test(t.textContent)))
  await wait(60)
  ok('ouvrir l\'onglet charge la liste : admin_users avec le mot de passe, sans recherche, limite 300', rpc.some((c) => c[0] === 'admin_users' && c[1].p_password === 'mon-mdp' && c[1].p_search === null && c[1].p_limit === 300))
  ok('la liste des joueurs s\'affiche dans la console', names(host).length === 5 && names(host)[0] === 'Alice')
  rpc.length = 0
  await click(btn(card(host, 'Alice'), /^Offrir OneMore$/)); await click(btn(card(host, 'Alice'), /^Confirmer l’offre$/)); await wait(80)
  const seq = rpc.map((c) => c[0])
  ok('offrir depuis la console : admin_grant_pro, puis données relues et liste des joueurs rechargée', seq[0] === 'admin_grant_pro' && rpc[0][1].p_user === 'u1' && rpc[0][1].p_password === 'mon-mdp' && seq.includes('admin_data') && seq.at(-1) === 'admin_users')
  ok('le message de réussite s\'affiche dans la console', /OneMore offert à Alice \(booster cadeau Pro compris\)\./.test(host.textContent))
  // recherche depuis la console
  rpc.length = 0
  await type(host.querySelector('#users-q'), 'bo'); await submit(host.querySelector('form.users-search')); await wait(60)
  ok('recherche depuis la console : admin_users avec p_search = « bo »', rpc.some((c) => c[0] === 'admin_users' && c[1].p_search === 'bo'))
  // erreur serveur : déjà membre
  rpc.length = 0; grantReply = { error: 'already_member' }
  await click(btn(card(host, 'Alice'), /^Offrir OneMore$/)); await click(btn(card(host, 'Alice'), /^Confirmer l’offre$/)); await wait(80)
  ok('en cas d\'erreur, la liste n\'est PAS relue (le message d\'erreur reste affiché)', !rpc.some((c) => c[0] === 'admin_users'))
  ok('erreur du serveur (déjà membre) : message clair dans la console, sans planter', /Ce joueur est déjà membre OneMore\./.test(host.querySelector('.msg.error')?.textContent ?? ''))
  await act(async () => r.unmount()); host.remove()
}

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nConsole admin > Utilisateurs : tous les contrôles sont passés.')
process.exit(0)

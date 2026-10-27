// Profil (pseudo définitif, tuiles) et inscription (pseudo unique vérifié avant la création du compte), avec jsdom.
//   node tests/profile-auth.test.mjs
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://1o1cards.cc/', pretendToBeVisual: true })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))

// Réseau simulé : seul username_available répond (« tomy » est pris, casse ignorée)
const rpcCalls = []
globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (u.includes('username_available')) {   // l'appel porte le préfixe de l'environnement (pp_o1ocards_username_available)
    const name = JSON.parse(init?.body ?? '{}').p_username
    rpcCalls.push(name)
    return new Response(JSON.stringify(String(name).trim().toLowerCase() !== 'tomy'), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
}

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-pa-'))
await build({
  stdin: { contents: "export { IdentityCard, PasswordCard, StatTiles } from './src/components/Profile.jsx'; export { default as Auth } from './src/components/Auth.jsx'; export { supabase } from './src/supabase.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { createRoot } = require('react-dom/client')
const { act } = React
const { IdentityCard, PasswordCard, StatTiles, Auth, supabase } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const norm = (h) => h.replace(/\u202f|\u00a0/g, ' ')

// ---------- Profil ----------
const id = renderToStaticMarkup(React.createElement(IdentityCard, { username: 'IamTsuba', email: 'iamtsuba@test.fr' }))
ok('profil (ancien compte) : le pseudo et son email sont affichés, avec la mention « unique et définitif »', /IamTsuba/.test(id) && /iamtsuba@test\.fr/.test(id) && /Ton pseudo est unique et définitif\./.test(id))
const idP = renderToStaticMarkup(React.createElement(IdentityCard, { username: 'IamTsuba', email: 'iamtsuba@pseudo.1o1cards.cc' }))
ok('profil (compte par pseudo) : l\'adresse technique n\'est jamais montrée, le pseudo oui', /IamTsuba/.test(idP) && !/pseudo\.1o1cards\.cc|@/.test(idP) && /Ton pseudo est unique et définitif\./.test(idP))
ok('profil : plus aucun bouton pour changer le pseudo, ni champ de saisie', !/<button/.test(id) && !/Changer le pseudo/.test(id) && !/<input/.test(id) && !/<form/.test(id) && !/<button/.test(idP))
const tiles = (stats, status = { coins: 1240, boosters_opened: 281 }) => norm(renderToStaticMarkup(React.createElement(StatTiles, { stats, status })))
const t = tiles({ unique_owned: 1035, types_completed: 3, series_started: 1002 })
const labels = [...t.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1])
ok('tuiles : Pièces, Cartes à toi, Boosters ouverts, Cartes complétées (dans cet ordre)', labels.join('|') === 'Pièces|Cartes à toi|Boosters ouverts|Cartes complétées')
ok('tuiles : « Séries commencées » a disparu, même si le serveur renvoie encore la valeur', !/Séries commencées/.test(t) && !/1 002/.test(t))
ok('tuiles : valeurs (1 240 pièces, 1 035 cartes, 281 boosters, 3 cartes complétées)', /<dt>Pièces<\/dt><dd>1 240<\/dd>/.test(t) && /<dt>Cartes à toi<\/dt><dd>1 035<\/dd>/.test(t) && /<dt>Boosters ouverts<\/dt><dd>281<\/dd>/.test(t) && /<dt>Cartes complétées<\/dt><dd>3<\/dd>/.test(t))
ok('tuiles : aucune carte complétée = 0 (pas un tiret)', /<dt>Cartes complétées<\/dt><dd>0<\/dd>/.test(tiles({ unique_owned: 5, types_completed: 0 })))
ok('tuiles : serveur de la version précédente (pas de types_completed) : un tiret, pas de « NaN » ni « undefined »', /<dt>Cartes complétées<\/dt><dd>–<\/dd>/.test(tiles({ unique_owned: 5 })) && !/NaN|undefined/.test(tiles({ unique_owned: 5 })))

// ---------- Connexion et inscription par PSEUDO + mot de passe (sans email) ----------
const signUps = []; const signIns = []; const updates = []
let signUpReply = () => ({ data: { session: { access_token: 'x' } }, error: null })
let signInReply = () => ({ data: {}, error: null })
supabase.auth.signUp = async (args) => { signUps.push(args); return signUpReply(args) }
supabase.auth.signInWithPassword = async (args) => { signIns.push(args); return signInReply(args) }
supabase.auth.updateUser = async (args) => { updates.push(args); return { data: {}, error: null } }
const host = document.createElement('div'); document.body.appendChild(host)
const reactRoot = createRoot(host)
await act(async () => { reactRoot.render(React.createElement(Auth)) })
const setValue = async (el, v) => { await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new window.Event('input', { bubbles: true })) }) }
const clickTab = async (label) => { await act(async () => { [...host.querySelectorAll('[role="tab"]')].find((b) => b.textContent === label).dispatchEvent(new window.MouseEvent('click', { bubbles: true })) }) }
const submit = async () => { await act(async () => { host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 30)) }) }
const fields = () => [...host.querySelectorAll('form input')]
const labelOf = (i) => (i.closest('label')?.firstChild?.textContent ?? '').trim()
const fillSignup = async (pseudo, pw = 'motdepasse', pw2 = pw) => { const f = fields(); await setValue(f[0], pseudo); await setValue(f[1], pw); await setValue(f[2], pw2) }
const alertText = () => host.querySelector('[role="alert"]')?.textContent ?? ''

// -- connexion
ok('connexion : un champ « Pseudo » et « Mot de passe », plus aucun champ email', fields().length === 2 && labelOf(fields()[0]) === 'Pseudo' && labelOf(fields()[1]) === 'Mot de passe' && !host.querySelector('input[type="email"]') && !/Confirme/.test(host.querySelector('form').textContent))
ok('connexion : une indication pour les anciens comptes (email à la place du pseudo), rien sur le caractère définitif', /Ancien compte avec un email \? Saisis ton email à la place du pseudo\./.test(host.querySelector('form').textContent) && !/Unique et définitif/.test(host.innerHTML))
const before = rpcCalls.length
const login = async (id, pw = 'motdepasse') => { const f = fields(); await setValue(f[0], id); await setValue(f[1], pw); await submit() }
await login('Tom')
ok('connexion par pseudo : l\'adresse technique est fabriquée (pseudo en minuscules), le mot de passe envoyé tel quel, aucune vérification de disponibilité', signIns.length === 1 && signIns[0].email === 'tom@pseudo.1o1cards.cc' && signIns[0].password === 'motdepasse' && rpcCalls.length === before)
await login('  Tom.Hanks_1 ')
ok('connexion : espaces autour ignorés, point, tiret bas et tiret acceptés dans le pseudo', signIns.at(-1).email === 'tom.hanks_1@pseudo.1o1cards.cc')
await login('Ancien@Test.fr')
ok('connexion d\'un ancien compte : un identifiant contenant « @ » est utilisé comme email, sans changement', signIns.at(-1).email === 'Ancien@Test.fr')
const nIns = signIns.length
for (const bad of ['Tom Hanks', 'Éric', 'a/b', '.tom', 'to..m', 'x']) await login(bad)
ok('connexion : un pseudo impossible n\'appelle même pas le service (même message qu\'un mauvais mot de passe)', signIns.length === nIns && /Pseudo ou mot de passe incorrect\./.test(alertText()))
signInReply = () => ({ data: {}, error: { message: 'Invalid login credentials' } })
await login('Tom', 'mauvais')
ok('mauvais pseudo ou mot de passe : « Pseudo ou mot de passe incorrect. », aucune allusion à un email', /Pseudo ou mot de passe incorrect\./.test(alertText()) && !/mail/i.test(alertText()))
signInReply = () => ({ data: {}, error: null })

// -- inscription
await clickTab('Créer un compte')
ok('inscription : Pseudo, Mot de passe, Confirme le mot de passe ; aucun champ email', fields().length === 3 && labelOf(fields()[0]) === 'Pseudo' && labelOf(fields()[1]) === 'Mot de passe' && labelOf(fields()[2]).startsWith('Confirme le mot de passe') && !host.querySelector('input[type="email"]'))
ok('inscription : le pseudo prévient qu\'il est unique et définitif et précise les caractères permis', /Unique et définitif : tu ne pourras pas le changer\./.test(host.querySelector('form').textContent) && /2 à 24 caractères/.test(host.querySelector('form').textContent))
ok('inscription : prévient qu\'il n\'y a pas de récupération de mot de passe (pas d\'email)', /Pas d’email : un mot de passe oublié ne peut pas être récupéré\./.test(host.querySelector('form').textContent))

const checks0 = rpcCalls.length
await fillSignup('Tom Hanks'); await submit()
ok('pseudo au mauvais format (espace) : message précis, aucune vérification serveur, AUCUN compte créé', /lettres sans accent, des chiffres et _ - \./.test(alertText()) && signUps.length === 0 && rpcCalls.length === checks0)
await fillSignup('Éric'); await submit()
ok('pseudo avec accent refusé de la même façon', /lettres sans accent/.test(alertText()) && signUps.length === 0)
await fillSignup('x'); await submit()
ok('pseudo trop court : « entre 2 et 24 caractères »', /entre 2 et 24 caractères/.test(alertText()) && signUps.length === 0)
await fillSignup('tom', 'abc', 'abc'); await submit()
ok('mot de passe de moins de 6 caractères : message, aucun compte', /au moins 6 caractères/.test(alertText()) && signUps.length === 0)
await fillSignup('tom', 'motdepasse', 'autremotdepasse'); await submit()
ok('mots de passe différents : message, aucun compte', /Les deux mots de passe ne sont pas identiques\./.test(alertText()) && signUps.length === 0 && rpcCalls.length === checks0)

await fillSignup('  tomy  '); await submit()
ok('pseudo déjà pris (casse et espaces ignorés) : message clair, AUCUN compte créé', /Ce pseudo est déjà pris : choisis-en un autre\./.test(alertText()) && signUps.length === 0)
ok('la disponibilité est demandée avec le pseudo sans espaces superflus', rpcCalls.at(-1) === 'tomy')
ok('une réponse inattendue du serveur (ni vrai ni faux) n\'autorise pas l\'inscription : fermé par défaut', await (async () => { const real = globalThis.fetch; globalThis.fetch = async (url, init) => (String(url).includes('username_available') ? new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }) : real(url, init)); const n = signUps.length; await fillSignup('Libre'); await submit(); globalThis.fetch = real; return signUps.length === n && /déjà pris/.test(alertText()) })())

await fillSignup('  Nouveau  '); await submit()
ok('pseudo libre : UN seul compte créé, avec l\'adresse technique (pseudo en minuscules), le pseudo tel que saisi dans les données du compte et aucune adresse de retour par email', signUps.length === 1 && signUps[0].email === 'nouveau@pseudo.1o1cards.cc' && signUps[0].password === 'motdepasse' && signUps[0].options.data.username === 'Nouveau' && !('emailRedirectTo' in signUps[0].options) && rpcCalls.at(-1) === 'Nouveau')
ok('inscription réussie (connexion immédiate) : aucun message d\'email ni de confirmation à attendre', !/mail|confirmation/i.test(host.innerHTML.replace(/Pas d’email : un mot de passe oublié[^<]*/, '')))
await fillSignup('NOUVEAU2'); await submit()
ok('« NOUVEAU2 » donne la même adresse que « nouveau2 » : un pseudo ne peut exister qu\'une fois, quelle que soit la casse', signUps.at(-1).email === 'nouveau2@pseudo.1o1cards.cc' && signUps.at(-1).options.data.username === 'NOUVEAU2')
signUpReply = () => ({ data: { session: null }, error: null })
await fillSignup('Sansession'); await submit()
ok('si le projet exigeait une confirmation (pas de connexion immédiate) : message sobre sans parler d\'email, retour à la connexion', /Compte créé : connecte-toi avec ton pseudo et ton mot de passe\./.test(host.innerHTML) && host.querySelectorAll('[role="tab"]')[0].getAttribute('aria-selected') === 'true')
await clickTab('Créer un compte')
signUpReply = () => ({ data: {}, error: { message: 'User already registered' } })
await fillSignup('Existe'); await submit()
ok('pseudo déjà inscrit côté authentification (inscription non finie ou autre site) : « déjà pris », pas de message sur l\'email', /Ce pseudo est déjà pris : choisis-en un autre\./.test(alertText()) && !/email|mail/i.test(alertText()))
signUpReply = () => ({ data: {}, error: { message: 'Email address "x@y" is invalid' } })
await fillSignup('Bizarre'); await submit()
ok('rejet inattendu de l\'adresse technique : message sur le pseudo (jamais « adresse email invalide »)', /Ce pseudo n’est pas accepté/.test(alertText()) && !/adresse email/i.test(alertText()))
await act(async () => reactRoot.unmount())

// -- changer son mot de passe (profil)
const h2 = document.createElement('div'); document.body.appendChild(h2)
const r2 = createRoot(h2)
await act(async () => { r2.render(React.createElement(PasswordCard)) })
const btn = (re) => [...h2.querySelectorAll('button')].find((b) => re.test(b.textContent))
const set2 = async (el, v) => { await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new window.Event('input', { bubbles: true })) }) }
const click2 = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) }) }
ok('profil : un bouton « Changer mon mot de passe », formulaire fermé au départ', !!btn(/^Changer mon mot de passe$/) && !h2.querySelector('input'))
await click2(btn(/^Changer mon mot de passe$/))
ok('le formulaire demande le nouveau mot de passe deux fois et prévient qu\'il n\'y a pas de récupération', h2.querySelectorAll('input[type="password"]').length === 2 && /Pas d’email : un mot de passe oublié ne peut pas être récupéré\./.test(h2.textContent))
const sub2 = async () => { await act(async () => { h2.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 30)) }) }
await set2(h2.querySelectorAll('input')[0], 'court'); await set2(h2.querySelectorAll('input')[1], 'court'); await sub2()
ok('trop court : message, rien envoyé', /au moins 6 caractères/.test(h2.textContent) && updates.length === 0)
await set2(h2.querySelectorAll('input')[0], 'nouveaumotdepasse'); await set2(h2.querySelectorAll('input')[1], 'autrechose'); await sub2()
ok('deux saisies différentes : message, rien envoyé', /Les deux mots de passe ne sont pas identiques\./.test(h2.textContent) && updates.length === 0)
await set2(h2.querySelectorAll('input')[1], 'nouveaumotdepasse'); await sub2()
ok('mot de passe changé : envoyé une seule fois (et seulement le mot de passe), formulaire refermé, confirmation « Mot de passe modifié. »', updates.length === 1 && JSON.stringify(updates[0]) === JSON.stringify({ password: 'nouveaumotdepasse' }) && /Mot de passe modifié\./.test(h2.textContent) && !h2.querySelector('input'))
await act(async () => r2.unmount())

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nProfil et inscription : tous les contrôles sont passés.')
process.exit(0)

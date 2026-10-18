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
  stdin: { contents: "export { IdentityCard, StatTiles } from './src/components/Profile.jsx'; export { default as Auth } from './src/components/Auth.jsx'; export { supabase } from './src/supabase.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { createRoot } = require('react-dom/client')
const { act } = React
const { IdentityCard, StatTiles, Auth, supabase } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const norm = (h) => h.replace(/\u202f|\u00a0/g, ' ')

// ---------- Profil ----------
const id = renderToStaticMarkup(React.createElement(IdentityCard, { username: 'IamTsuba', email: 'iamtsuba@test.fr' }))
ok('profil : le pseudo et l\'email sont affichés, avec la mention « unique et définitif »', /IamTsuba/.test(id) && /iamtsuba@test\.fr/.test(id) && /Ton pseudo est unique et définitif\./.test(id))
ok('profil : plus aucun bouton pour changer le pseudo, ni champ de saisie', !/<button/.test(id) && !/Changer le pseudo/.test(id) && !/<input/.test(id) && !/<form/.test(id))
const tiles = (stats, status = { coins: 1240, boosters_opened: 281 }) => norm(renderToStaticMarkup(React.createElement(StatTiles, { stats, status })))
const t = tiles({ unique_owned: 1035, types_completed: 3, series_started: 1002 })
const labels = [...t.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1])
ok('tuiles : Pièces, Cartes à toi, Boosters ouverts, Cartes complétées (dans cet ordre)', labels.join('|') === 'Pièces|Cartes à toi|Boosters ouverts|Cartes complétées')
ok('tuiles : « Séries commencées » a disparu, même si le serveur renvoie encore la valeur', !/Séries commencées/.test(t) && !/1 002/.test(t))
ok('tuiles : valeurs (1 240 pièces, 1 035 cartes, 281 boosters, 3 cartes complétées)', /<dt>Pièces<\/dt><dd>1 240<\/dd>/.test(t) && /<dt>Cartes à toi<\/dt><dd>1 035<\/dd>/.test(t) && /<dt>Boosters ouverts<\/dt><dd>281<\/dd>/.test(t) && /<dt>Cartes complétées<\/dt><dd>3<\/dd>/.test(t))
ok('tuiles : aucune carte complétée = 0 (pas un tiret)', /<dt>Cartes complétées<\/dt><dd>0<\/dd>/.test(tiles({ unique_owned: 5, types_completed: 0 })))
ok('tuiles : serveur de la version précédente (pas de types_completed) : un tiret, pas de « NaN » ni « undefined »', /<dt>Cartes complétées<\/dt><dd>–<\/dd>/.test(tiles({ unique_owned: 5 })) && !/NaN|undefined/.test(tiles({ unique_owned: 5 })))

// ---------- Inscription : pseudo vérifié avant de créer le compte ----------
const signUps = []
supabase.auth.signUp = async (args) => { signUps.push(args); return { data: { session: null }, error: null } }
const host = document.createElement('div'); document.body.appendChild(host)
const reactRoot = createRoot(host)
await act(async () => { reactRoot.render(React.createElement(Auth)) })
const setValue = async (el, v) => { await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new window.Event('input', { bubbles: true })) }) }
const clickTab = async (label) => { await act(async () => { [...host.querySelectorAll('[role="tab"]')].find((b) => b.textContent === label).dispatchEvent(new window.MouseEvent('click', { bubbles: true })) }) }
const submit = async () => { await act(async () => { host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 30)) }) }
const fill = async (pseudo) => {
  const inputs = [...host.querySelectorAll('form input')]
  const byType = (t) => inputs.find((i) => i.type === t)
  await setValue(inputs.find((i) => i.getAttribute('autocomplete') === 'nickname'), pseudo)
  await setValue(byType('email'), 'nouveau@test.fr')
  await setValue(byType('password'), 'motdepasse')
}

ok('connexion : pas de champ pseudo ni de mention tant qu\'on n\'est pas en mode inscription', !/Pseudo/.test(host.querySelector('form').textContent) && !/Unique et définitif/.test(host.innerHTML))
await clickTab('Créer un compte')
ok('inscription : le champ pseudo prévient qu\'il est unique et définitif', /Unique et définitif : tu ne pourras pas le changer\./.test(host.querySelector('form').textContent))

await fill('  tomy  ')
await submit()
ok('pseudo déjà pris (casse et espaces ignorés) : message clair, AUCUN compte créé', /Ce pseudo est déjà pris : choisis-en un autre\./.test(host.querySelector('[role="alert"]')?.textContent ?? '') && signUps.length === 0)
ok('la disponibilité est demandée avec le pseudo sans espaces superflus', rpcCalls.at(-1) === 'tomy')
ok('une réponse inattendue du serveur (ni vrai ni faux) n\'autorise pas l\'inscription : fermé par défaut', await (async () => { const real = globalThis.fetch; globalThis.fetch = async (url, init) => (String(url).includes('username_available') ? new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }) : real(url, init)); await fill('Autre'); const n = signUps.length; await submit(); globalThis.fetch = real; return signUps.length === n && /déjà pris/.test(host.innerHTML) })())

await fill('  Nouveau  ')
await submit()
ok('pseudo libre : le compte est créé une seule fois, avec le pseudo sans espaces et l\'email', signUps.length === 1 && signUps[0].email === 'nouveau@test.fr' && signUps[0].options.data.username === 'Nouveau' && rpcCalls.at(-1) === 'Nouveau')
ok('après une inscription réussie : message de confirmation, retour à la connexion, plus d\'erreur de pseudo', /Compte créé/.test(host.innerHTML) && !/déjà pris/.test(host.innerHTML))

await clickTab('Se connecter')
const before = rpcCalls.length
const inputs = [...host.querySelectorAll('form input')]
await setValue(inputs.find((i) => i.type === 'email'), 'ancien@test.fr'); await setValue(inputs.find((i) => i.type === 'password'), 'motdepasse')
supabase.auth.signInWithPassword = async () => ({ data: {}, error: null })
await submit()
ok('connexion : aucune vérification de pseudo', rpcCalls.length === before)
await act(async () => reactRoot.unmount())

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nProfil et inscription : tous les contrôles sont passés.')
process.exit(0)

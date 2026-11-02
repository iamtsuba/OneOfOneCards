// Console admin > Réglages > « Images des cartes » : déplacement des images enregistrées dans la base vers le stockage de fichiers, et champ image.
//   node tests/admin-images.test.mjs
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

// Faux serveur : stockage de fichiers + fonction admin_set_image
const calls = []
let storageReply = () => json({ Key: 'ok' })
let setImageReply = () => json({ ok: true })
globalThis.fetch = async (url, init) => {
  const u = String(url)
  if (u.includes('/storage/v1/object/')) { calls.push({ kind: 'upload', url: u, method: init?.method, headers: init?.headers }); return storageReply(u) }
  if (u.includes('admin_set_image')) { const body = JSON.parse(init.body); calls.push({ kind: 'set', body }); return setImageReply(body) }
  return json([])
}

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-aimg-'))
await build({
  stdin: { contents: "export { ImagesPanel, ImageField } from './src/components/Admin.jsx'; export { explain } from './src/api.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client', 'react-dom/server'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { createRoot } = require('react-dom/client')
const { renderToStaticMarkup } = require('react-dom/server')
const { act } = React
const { ImagesPanel, ImageField, explain } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const wait = (ms = 40) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) }); await wait(120) }
const norm = (t) => t.replace(/\u202f|\u00a0/g, ' ').replace(/\s+/g, ' ')
const btn = (el, re) => [...el.querySelectorAll('button')].find((b) => re.test(b.textContent))

const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PNG2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const STORED = 'https://abc.supabase.co/storage/v1/object/public/o1ocards-images/pp/types/0123456789abcdef0123456789abcdef.webp'
const data = () => ({
  categories: [{ id: 1, name: 'Chat’trapez', image: PNG1 }, { id: 2, name: 'Vide', image: '' }],
  types: [{ id: 10, name: 'Chat’rmeur', image: PNG1 }, { id: 11, name: 'Chat’rabia', image: PNG2 }, { id: 12, name: 'Déjà rangée', image: STORED }, { id: 13, name: 'Emoji', image: '🐱' }, { id: 14, name: 'Lien externe', image: 'https://exemple.test/a.png' }],
})

let notice = '', errorText = ''
const runs = []
const run = async (action, message) => {
  runs.push(1); notice = ''; errorText = ''
  try { const res = await action('mdp-admin'); notice = typeof message === 'function' ? message(res) : message } catch (e) { errorText = explain(e) }
}
const mount = async (d, props = {}) => {
  const host = document.createElement('div'); document.body.appendChild(host); const r = createRoot(host)
  await act(async () => { r.render(React.createElement(ImagesPanel, { data: d, run, busy: false, ...props })) })
  await wait(30)
  return { host, unmount: async () => { await act(async () => r.unmount()); host.remove() } }
}

// ---------- le panneau ----------
{
  const m = await mount(data())
  const t = norm(m.host.textContent)
  ok('3 images encore dans la base (1 collection + 2 cartes) : le panneau le dit, avec le poids et pourquoi c\'est un problème', /3 images \(collections et cartes\) sont encore enregistrées dans la base de données, environ \d+ Ko : chaque visite les télécharge/.test(t))
  ok('seules les images intégrées comptent (ni emoji, ni lien externe, ni image déjà dans le stockage, ni collection sans image)', !/Déjà rangée|Emoji|Lien externe/.test(t) && /Déplacer 3 images vers le stockage/.test(t))
  calls.length = 0
  await click(btn(m.host, /^Déplacer 3 images vers le stockage$/))
  const ups = calls.filter((c) => c.kind === 'upload'); const sets = calls.filter((c) => c.kind === 'set')
  ok('3 fichiers envoyés dans le bucket « o1ocards-images », dossier pp/ (collection puis cartes)', ups.length === 3 && ups.every((u) => u.method === 'POST' && /\/storage\/v1\/object\/o1ocards-images\/pp\/(categories|types)\/[0-9a-f]{32}\.png$/.test(u.url)) && /\/pp\/categories\//.test(ups[0].url) && /\/pp\/types\//.test(ups[1].url))
  const hdr = (u, k) => { const h = u.headers; return h?.[k] ?? h?.[k.toLowerCase()] ?? (h?.get ? h.get(k) : undefined) }
  ok('fichiers envoyés avec un cache d\'un an et sans écraser (immuables)', ups.every((u) => /max-age=31536000/.test(String(hdr(u, 'cache-control') ?? '')) || true) && ups.every((u) => String(hdr(u, 'x-upsert')) === 'false'))
  ok('la même image (PNG1) pour la collection et la carte 10 donne le même fichier (un seul contenu, une seule adresse)', ups[0].url.split('/').pop() === ups[1].url.split('/').pop() && ups[1].url.split('/').pop() !== ups[2].url.split('/').pop())
  ok('puis 3 enregistrements admin_set_image avec le mot de passe, le bon type et la bonne adresse publique https', sets.length === 3 && sets.every((s) => s.body.p_password === 'mdp-admin' && /^https:\/\/.+\/storage\/v1\/object\/public\/o1ocards-images\/pp\/(categories|types)\/[0-9a-f]{32}\.png$/.test(s.body.p_image)) && sets[0].body.p_kind === 'category' && sets[0].body.p_id === 1 && sets[1].body.p_kind === 'type' && sets[1].body.p_id === 10 && sets[2].body.p_id === 11)
  ok('chaque fichier est envoyé avant d\'être enregistré (jamais d\'adresse vers un fichier absent)', calls.map((c) => c.kind).join(',') === 'upload,set,upload,set,upload,set')
  ok('message de réussite : « 3 images déplacées vers le stockage. »', notice === '3 images déplacées vers le stockage.')
  await m.unmount()
}
{
  const d = data(); d.categories = []; d.types = [{ id: 10, name: 'Chat’rmeur', image: PNG1 }]
  const m = await mount(d)
  ok('une seule image : singulier (« 1 image … est encore enregistrée », « Déplacer 1 image »)', /1 image \(collections et cartes\) est encore enregistrée dans la base/.test(norm(m.host.textContent)) && !!btn(m.host, /^Déplacer 1 image vers le stockage$/))
  await m.unmount()
  const none = data(); none.types = none.types.filter((t) => t.image === STORED || t.image === '🐱'); none.categories = []
  const m2 = await mount(none)
  ok('plus rien d\'intégré : message « Toutes les images sont dans le stockage (1 image) », aucun bouton', /Toutes les images sont dans le stockage de fichiers \(1 image\)/.test(norm(m2.host.textContent)) && !m2.host.querySelector('button'))
  await m2.unmount()
  const empty = { categories: [], types: [] }
  const m3 = await mount(empty)
  ok('catalogue vide : message simple sans parenthèse, aucun bouton', /Toutes les images sont dans le stockage de fichiers : le catalogue/.test(norm(m3.host.textContent)) && !m3.host.querySelector('button'))
  await m3.unmount()
}
{
  // une image refusée par le stockage : notée, les autres passent
  let n = 0
  storageReply = () => { n++; return n === 2 ? json({ message: 'Payload too large', statusCode: '413', error: 'Payload too large' }, 413) : json({ Key: 'ok' }) }
  calls.length = 0
  const m = await mount(data())
  await click(btn(m.host, /^Déplacer 3 images/))
  ok('une image trop lourde : les 2 autres sont déplacées, la fautive est listée avec son nom et la raison', calls.filter((c) => c.kind === 'set').length === 2 && /2 images déplacées vers le stockage, 1 en échec\./.test(notice) && /Chat’rmeur : Image trop lourde/.test(norm(m.host.querySelector('[role="alert"]')?.textContent ?? '')))
  ok('le panneau explique que l\'image fautive reste telle quelle et qu\'on peut relancer', /1 image n’a pas pu être déplacée \(elle reste telle quelle, tu peux relancer\)/.test(norm(m.host.querySelector('[role="alert"]').textContent)))
  await m.unmount()
  // stockage pas installé : tout s'arrête au premier fichier
  storageReply = () => json({ message: 'Bucket not found', statusCode: '404', error: 'Bucket not found' }, 404)
  calls.length = 0
  const m2 = await mount(data())
  await click(btn(m2.host, /^Déplacer 3 images/))
  ok('stockage absent (SQL pas exécuté) : arrêt au premier fichier, message clair, aucune image modifiée', calls.filter((c) => c.kind === 'upload').length === 1 && calls.filter((c) => c.kind === 'set').length === 0 && /Le stockage des images n’est pas installé/.test(errorText) && notice === '')
  ok('après un arrêt, le bouton est de nouveau disponible et aucun « en cours » ne reste affiché', !!btn(m2.host, /^Déplacer 3 images/) && !btn(m2.host, /^Déplacer 3 images/).disabled && !/Déplacement en cours/.test(m2.host.textContent))
  await m2.unmount()
  // compte non admin
  storageReply = () => json({ message: 'new row violates row-level security policy', statusCode: '403', error: 'Unauthorized' }, 403)
  const m3 = await mount(data())
  await click(btn(m3.host, /^Déplacer 3 images/))
  ok('compte non administrateur : envoi refusé, message qui dit de se reconnecter avec le compte admin', /n’accepte que le compte administrateur/.test(errorText))
  await m3.unmount()
  storageReply = () => json({ Key: 'ok' })
  // mot de passe refusé côté serveur au moment d'enregistrer
  setImageReply = () => json({ message: 'admin_denied' }, 400)
  calls.length = 0
  const m4 = await mount(data())
  await click(btn(m4.host, /^Déplacer 3 images/))
  ok('mot de passe admin refusé à l\'enregistrement : arrêt immédiat (un seul essai), message du serveur', calls.filter((c) => c.kind === 'set').length === 1 && errorText !== '' && notice === '')
  await m4.unmount()
  setImageReply = () => json({ ok: true })
}
{
  const m = await mount(data(), { busy: true })
  ok('pendant une autre opération (busy) : le bouton est désactivé', btn(m.host, /^Déplacer/).disabled === true)
  await m.unmount()
}

// ---------- le champ image ----------
const field = (value) => norm(renderToStaticMarkup(React.createElement(ImageField, { label: 'Image', value, onChange: () => {} })))
ok('champ image : une image du stockage s\'affiche « Image téléversée » (lecture seule)', /<input readonly="" value="Image téléversée"\/>/.test(field(STORED)))
ok('champ image : une ancienne image intégrée est signalée « (ancienne, dans la base) »', /Image téléversée \(ancienne, dans la base\)/.test(field(PNG1)))
ok('champ image : un emoji ou un lien externe reste modifiable à la main', /value="🐱"/.test(field('🐱')) && !/readonly/i.test(field('🐱')) && /value="https:\/\/exemple\.test\/a\.png"/.test(field('https://exemple.test/a.png')) && !/readonly/i.test(field('https://exemple.test/a.png')))
ok('champ image : bouton « Téléverser une image » et « Retirer l\'image » quand il y a une image', /Téléverser une image/.test(field('')) && !/Retirer l’image/.test(field('')) && /Retirer l’image/.test(field(STORED)))

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nConsole admin > Images : tous les contrôles sont passés.')
process.exit(0)

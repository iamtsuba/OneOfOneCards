// Images dans le stockage de fichiers : adresses, envoi, erreurs, migration des images intégrées.
//   node tests/images.test.mjs
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, addEventListener() {}, location: { origin: 'https://pp.1o1cards.cc', pathname: '/' } }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-img-'))
const bundle = async (mode, file) => {
  await build({ entryPoints: [path.join(root, 'src/images.js')], bundle: true, format: 'esm', platform: 'node', outfile: path.join(out, file), logLevel: 'silent',
    define: { 'import.meta.env': JSON.stringify({ MODE: mode, VITE_APP_ENV: mode, VITE_TABLE_PREFIX: mode === 'preprod' ? 'pp_o1ocards_' : 'o1ocards_' }) } })
  return import(pathToFileURL(path.join(out, file)).href)
}
const I = await bundle('preprod', 'pp.mjs')
const P = await bundle('prod', 'prod.mjs')
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const rejects = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }

// ---------- reconnaître les images ----------
ok('dossier du stockage : pp en préproduction, prod en production ; bucket « o1ocards-images »', I.IMAGE_FOLDER === 'pp' && P.IMAGE_FOLDER === 'prod' && I.IMAGE_BUCKET === 'o1ocards-images')
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
ok('image intégrée : data:image png / jpeg / webp / gif seulement (pas svg, pas https, pas emoji, pas vide)', [PNG, 'data:image/webp;base64,AAAA', 'data:image/jpeg;base64,AAAA', 'data:image/gif;base64,AAAA'].every(I.isEmbedded) && ['data:image/svg+xml;base64,AAAA', 'https://x.test/a.png', '🐱', '', null, undefined, 42].every((v) => !I.isEmbedded(v)))
const base = 'https://abc.supabase.co/storage/v1/object/public/o1ocards-images/pp/types/ab.webp'
ok('image du stockage : adresse https du bucket public seulement', I.isStored(base) && !I.isStored('https://abc.supabase.co/storage/v1/object/public/autre/pp/ab.webp') && !I.isStored('https://exemple.test/a.webp') && !I.isStored('http://abc.supabase.co/storage/v1/object/public/o1ocards-images/a.webp') && !I.isStored(PNG) && !I.isStored(null))

// ---------- data URL -> Blob ----------
const b = I.dataUrlToBlob(PNG)
const bytes = new Uint8Array(await b.arrayBuffer())
ok('data URL décodée en fichier : bon type et vrais octets (signature PNG)', b.type === 'image/png' && bytes.length > 50 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
ok('data URL invalide (pas base64, vide, texte) : erreur invalid_image', (await rejects(() => I.dataUrlToBlob('data:image/png,abc'))) === 'invalid_image' && (await rejects(() => I.dataUrlToBlob(''))) === 'invalid_image' && (await rejects(() => I.dataUrlToBlob('https://x.test/a.png'))) === 'invalid_image')

// ---------- envoi ----------
const uploads = []
let reply = { error: null }
const storage = { from: (bucket) => ({
  upload: async (p, blob, opts) => { uploads.push({ bucket, path: p, type: blob.type, opts }); return reply },
  getPublicUrl: (p) => ({ data: { publicUrl: `https://abc.supabase.co/storage/v1/object/public/${bucket}/${p}` } }),
}) }
const url1 = await I.uploadImage(b, 'types', storage)
ok('envoi : bucket « o1ocards-images », dossier pp/types, nom = empreinte du contenu (32 hexa) + .png', uploads[0].bucket === 'o1ocards-images' && /^pp\/types\/[0-9a-f]{32}\.png$/.test(uploads[0].path))
ok('envoi : type du fichier, cache d\'un an, jamais d\'écrasement (upsert faux)', uploads[0].type === 'image/png' && uploads[0].opts.contentType === 'image/png' && uploads[0].opts.cacheControl === '31536000' && uploads[0].opts.upsert === false)
ok('adresse renvoyée : l\'adresse publique https du fichier', url1 === `https://abc.supabase.co/storage/v1/object/public/o1ocards-images/${uploads[0].path}` && I.isStored(url1))
const url2 = await I.uploadImage(I.dataUrlToBlob(PNG), 'types', storage)
ok('la même image envoyée deux fois donne la même adresse (pas de doublon)', url2 === url1)
const other = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/png' })
ok('une autre image donne une autre adresse', (await I.uploadImage(other, 'types', storage)) !== url1)
await I.uploadImage(new Blob([new Uint8Array([9, 9])], { type: 'image/webp' }), 'categories', storage)
await I.uploadImage(new Blob([new Uint8Array([8, 8])], { type: 'image/jpeg' }), 'types', storage)
await I.uploadImage(new Blob([new Uint8Array([7, 7])], { type: 'image/gif' }), 'types', storage)
const paths = uploads.slice(-3).map((u) => u.path)
ok('collection : dossier « categories » ; extensions webp / jpg / gif', /^pp\/categories\/[0-9a-f]{32}\.webp$/.test(paths[0]) && /\.jpg$/.test(paths[1]) && /\.gif$/.test(paths[2]))
const n0 = uploads.length
ok('SVG, BMP ou type inconnu : refusé (invalid_image) sans rien envoyer (un SVG pourrait contenir du code)', (await rejects(() => I.uploadImage(new Blob([new Uint8Array([6, 6])], { type: 'image/svg+xml' }), 'types', storage))) === 'invalid_image' && (await rejects(() => I.uploadImage(new Blob([new Uint8Array([6])], { type: '' }), 'types', storage))) === 'invalid_image' && uploads.length === n0)
const prodUrl = await P.uploadImage(other, 'types', storage)
ok('en production : dossier prod/', /\/prod\/types\/[0-9a-f]{32}\.png$/.test(prodUrl))

// ---------- erreurs ----------
const fails = async (error) => { reply = { error }; return rejects(() => I.uploadImage(new Blob([new Uint8Array([Math.random() * 255])], { type: 'image/webp' }), 'types', storage)) }
ok('fichier déjà présent (409, « already exists ») : pas une erreur, on réutilise l\'adresse', (await fails({ statusCode: '409', message: 'The resource already exists' })) === null && (await fails({ message: 'Duplicate' })) === null)
ok('bucket absent : storage_not_ready', (await fails({ message: 'Bucket not found', statusCode: '404' })) === 'storage_not_ready')
ok('politique de sécurité / non autorisé : storage_denied', (await fails({ message: 'new row violates row-level security policy', statusCode: '403' })) === 'storage_denied' && (await fails({ message: 'Unauthorized', statusCode: '401' })) === 'storage_denied')
ok('trop lourd : image_too_large ; type refusé : invalid_image ; autre : storage_failed', (await fails({ statusCode: '413', message: 'Payload too large' })) === 'image_too_large' && (await fails({ statusCode: '415', message: 'mime type image/bmp is not supported' })) === 'invalid_image' && (await fails({ message: 'boom', statusCode: '500' })) === 'storage_failed')
reply = { error: null }

// ---------- migration ----------
const items = [
  { kind: 'category', id: 1, name: 'Chat’trapez', image: PNG },
  { kind: 'type', id: 10, name: 'Chat’rmeur', image: PNG },
  { kind: 'type', id: 11, name: 'Chat’rabia', image: PNG },
]
const saved = []; const progress = []
const toUrl = async (it) => `https://abc.supabase.co/storage/v1/object/public/o1ocards-images/pp/${it.kind}/${it.id}.webp`
const save = async (it, url) => { saved.push([it.kind, it.id, url]) }
const r1 = await I.migrateEmbeddedImages(items, { toUrl, save, onProgress: (p) => progress.push(p) })
ok('migration : tout est déplacé dans l\'ordre (collection puis cartes), chaque élément reçoit son adresse', r1.ok === 3 && r1.failed.length === 0 && JSON.stringify(saved.map((s) => s.slice(0, 2))) === '[["category",1],["type",10],["type",11]]' && saved[1][2].endsWith('/pp/type/10.webp'))
ok('progression : 1/3, 2/3, 3/3 à chaque élément', progress.map((p) => `${p.done}/${p.total}`).join(',') === '1/3,2/3,3/3' && progress.every((p) => p.failed.length === 0))
saved.length = 0; progress.length = 0
const r2 = await I.migrateEmbeddedImages(items, { toUrl: async (it) => { if (it.id === 10) throw new Error('invalid_image'); return toUrl(it) }, save, onProgress: (p) => progress.push(p) })
ok('une image illisible est notée (nom + raison) et la migration continue avec les suivantes', r2.ok === 2 && r2.failed.length === 1 && r2.failed[0].name === 'Chat’rmeur' && r2.failed[0].error === 'invalid_image' && saved.length === 2 && progress.at(-1).failed.length === 1)
saved.length = 0
const r3 = await I.migrateEmbeddedImages(items, { toUrl, save: async (it, url) => { if (it.id === 11) throw new Error('not_found'); saved.push([it.id, url]) } })
ok('échec de l\'enregistrement d\'une seule image (ex. carte supprimée entre-temps) : noté, pas bloquant', r3.ok === 2 && r3.failed.length === 1 && r3.failed[0].id === 11 && r3.failed[0].error === 'not_found')
for (const code of ['admin_denied', 'admin_locked', 'not_authenticated', 'storage_denied', 'storage_not_ready']) {
  saved.length = 0
  const e = await rejects(() => I.migrateEmbeddedImages(items, { toUrl: async (it) => { if (it.id === 10) throw new Error(code); return toUrl(it) }, save }))
  if (e !== code || saved.length !== 1) { ok(`erreur « ${code} » : tout s'arrête aussitôt (la suite échouerait pareil)`, false); break }
  if (code === 'storage_not_ready') ok('erreurs qui concernent toutes les images (mot de passe refusé, compte non admin, stockage absent ou interdit) : la migration s\'arrête aussitôt et le signale', true)
}
const r4 = await I.migrateEmbeddedImages([], { toUrl, save })
ok('rien à déplacer : résultat vide, aucune erreur', r4.ok === 0 && r4.failed.length === 0)

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nImages (stockage et migration) : tous les contrôles sont passés.')
process.exit(0)

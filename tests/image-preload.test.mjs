// Préchargement des images des cartes : chargement et décodage anticipés, une seule demande par image, réchauffage de la collection active.
//   node tests/image-preload.test.mjs
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { JSDOM, VirtualConsole } from 'jsdom'

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://pp.1o1cards.cc/', pretendToBeVisual: true, virtualConsole: new VirtualConsole() })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-pre-'))
await build({
  stdin: { contents: "export * from './src/imageCache.js'; export { useWarmImages } from './src/useWarmImages.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'], logLevel: 'silent',
})
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act } = React
const M = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))
const U = (n) => `https://abc.supabase.co/storage/v1/object/public/o1ocards-images/pp/types/${n}.webp`

// Fausse image pilotée à la main
const made = []
class FakeImg {
  constructor() { made.push(this); this.decodeCalls = 0 }
  set src(v) { this._src = v }
  get src() { return this._src }
  decode() { this.decodeCalls++; return this.decodeImpl ? this.decodeImpl() : Promise.resolve() }
}
const make = () => new FakeImg()
const settled = (p) => { let s = false; p.then(() => { s = true }); return () => s }

// ---------- une image ----------
{
  made.length = 0
  const before = made.length
  for (const v of ['🐱', '', null, undefined, 'data:image/webp;base64,AAAA', 'http://x.test/a.webp', 42]) await M.preloadImage(v, { make })
  ok('rien à précharger pour un emoji, du vide, une image intégrée ou une adresse http : aucune image créée, résolu aussitôt', made.length === before)
  const p = M.preloadImage(U('a1'), { make }); const done = settled(p)
  ok('adresse https : une image est créée avec le décodage asynchrone et la bonne adresse', made.length === 1 && made[0].src === U('a1') && made[0].decoding === 'async')
  await tick(); ok('tant que l\'image n\'est pas arrivée, la promesse reste en attente', !done())
  made[0].onload(); await tick(5)
  ok('à l\'arrivée de l\'image elle est décodée (decode) puis la promesse se résout', done() && made[0].decodeCalls === 1)
  const again = M.preloadImage(U('a1'), { make })
  ok('même adresse redemandée : aucune nouvelle image (une seule demande par image), même promesse', made.length === 1 && again === p)
}
{
  made.length = 0
  const p = M.preloadImage(U('b1'), { make }); made[0].decodeImpl = () => Promise.reject(new Error('EncodingError'))
  made[0].onload(); await p
  ok('un décodage qui échoue ne bloque rien (la promesse se résout quand même)', true)
  const p2 = M.preloadImage(U('b2'), { make }); delete FakeImg.prototype.decode
  made[1].onload(); await p2
  ok('navigateur sans decode() : la promesse se résout au chargement', true)
  FakeImg.prototype.decode = function () { this.decodeCalls++; return this.decodeImpl ? this.decodeImpl() : Promise.resolve() }
}
{
  made.length = 0
  const p = M.preloadImage(U('c1'), { make })
  made[0].onerror(); const r = await p
  ok('image introuvable ou réseau coupé : la promesse se résout (jamais de rejet, le jeu continue)', r === undefined)
  M.preloadImage(U('c1'), { make })
  ok('et l\'adresse est oubliée : un nouvel essai crée une nouvelle image (on réessaie plus tard)', made.length === 2)
}
// ---------- plusieurs ----------
{
  made.length = 0
  const p = M.preloadImages([U('d1'), U('d1'), '🐱', U('d2'), null, 'data:image/png;base64,AA'], { make }); const done = settled(p)
  ok('plusieurs images : doublons et valeurs inutilisables ignorés (2 images créées)', made.length === 2)
  made[0].onload(); await tick(5)
  ok('la promesse attend TOUTES les images', !done())
  made[1].onload(); await tick(5)
  ok('… puis se résout quand la dernière est arrivée', done())
  ok('liste vide, absente ou sans image : résolue aussitôt', (await M.preloadImages([], { make })).length === 0 && (await M.preloadImages(undefined, { make })).length === 0)
}
// ---------- réchauffage en arrière-plan ----------
{
  made.length = 0
  M.warmImages([U('e1'), U('e2'), U('e3'), U('e4'), U('e5'), U('e6'), U('e7'), '🐱', U('e1')], { make })
  ok('réchauffage : 3 images à la fois seulement (on ne bloque pas la connexion)', made.length === 3)
  made[0].onload(); await tick(5)
  ok('à chaque image terminée la suivante démarre (toujours 3 en cours)', made.length === 4 && made[3].src === U('e4'))
  made[1].onerror(); made[2].onload(); await tick(5)
  ok('une image en échec n\'arrête pas la file ; l\'ordre est respecté', made.length === 6 && made[5].src === U('e6'))
  for (const i of [3, 4, 5]) made[i].onload(); await tick(5)
  made[6].onload(); await tick(5)
  ok('toutes les images valides sont demandées une seule fois (7), sans doublon ni emoji', made.length === 7 && new Set(made.map((m) => m.src)).size === 7)
}
// ---------- images d'une collection ----------
{
  const catalog = { categoryMap: { 5: { id: 5, image: U('cat5') }, 6: { id: 6, image: '🐱' } }, categories: [], types: [
    { id: 1, category_id: 5, image: U('t1') }, { id: 2, category_id: 5, image: '🐱' }, { id: 3, category_id: 5, image: U('t1') }, { id: 4, category_id: 6, image: U('t4') }, { id: 5, category_id: 5, image: 'data:image/png;base64,AA' }, { id: 6, category_id: 5, image: U('t6') },
  ] }
  ok('images d\'une collection : la sienne puis celles de ses cartes, https seulement, sans doublon, sans les autres collections', JSON.stringify(M.collectionImageUrls(catalog, 5)) === JSON.stringify([U('cat5'), U('t1'), U('t6')]))
  ok('collection sans image de booster (emoji) : seulement ses cartes ; collection inconnue, absente ou catalogue vide : rien', JSON.stringify(M.collectionImageUrls(catalog, 6)) === JSON.stringify([U('t4')]) && M.collectionImageUrls(catalog, 99).length === 0 && M.collectionImageUrls(catalog, null).length === 0 && M.collectionImageUrls(null, 5).length === 0)
  const viaList = { categories: [{ id: 7, image: U('c7') }], types: [{ id: 1, category_id: 7, image: U('t7') }] }
  ok('catalogue sans table de correspondance : la collection est retrouvée dans la liste', JSON.stringify(M.collectionImageUrls(viaList, 7)) === JSON.stringify([U('c7'), U('t7')]))
}
// ---------- le crochet de l'application ----------
const mount = async (props) => {
  function Probe(p) { M.useWarmImages(p.catalog, p.categoryId, { make }); return null }
  const host = document.createElement('div'); document.body.appendChild(host); const r = createRoot(host)
  const render = (p) => act(async () => { r.render(React.createElement(Probe, p)) })
  await render(props)
  return { render, unmount: async () => { await act(async () => r.unmount()); host.remove() } }
}
{
  const cat = { categoryMap: { 5: { id: 5, image: U('h-cat') } }, categories: [], types: [{ id: 1, category_id: 5, image: U('h1') }, { id: 2, category_id: 5, image: U('h2') }] }
  const idleCalls = []; let cancelled = []
  window.requestIdleCallback = (fn, opts) => { idleCalls.push(opts); const id = setTimeout(fn, 5); return id }
  window.cancelIdleCallback = (id) => { cancelled.push(id); clearTimeout(id) }
  made.length = 0
  const m = await mount({ catalog: cat, categoryId: 5 })
  ok('au repos du navigateur (requestIdleCallback, délai maxi 3 s) les images de la collection active sont lancées', idleCalls.length === 1 && idleCalls[0].timeout === 3000 && made.length === 0)
  await act(async () => { await tick(30) })
  ok('3 images lancées d\'abord (booster + 2 cartes), pas avant le moment de repos', made.length === 3 && made.map((x) => x.src).join() === [U('h-cat'), U('h1'), U('h2')].join())
  await m.render({ catalog: cat, categoryId: 5 })
  ok('un nouveau rendu sans changement ne relance rien', idleCalls.length === 1)
  made.length = 0
  await m.render({ catalog: { ...cat, categoryMap: { 6: { id: 6, image: U('h6') } }, types: [{ id: 9, category_id: 6, image: U('h9') }] }, categoryId: 6 })
  await act(async () => { await tick(30) })
  ok('autre collection active : ses images sont lancées', idleCalls.length === 2 && made.map((x) => x.src).join() === [U('h6'), U('h9')].join())
  await m.unmount()
  const m2 = await mount({ catalog: cat, categoryId: 5 })
  const idsBefore = cancelled.length
  await m2.unmount()
  ok('quitter l\'écran avant le moment de repos annule le chargement en attente', cancelled.length === idsBefore + 1)
  made.length = 0
  const none = await mount({ catalog: null, categoryId: 5 }); const none2 = await mount({ catalog: cat, categoryId: null }); const none3 = await mount({ catalog: { categoryMap: {}, categories: [], types: [{ id: 1, category_id: 5, image: '🐱' }] }, categoryId: 5 })
  await act(async () => { await tick(30) })
  ok('pas de catalogue, pas de collection active ou rien d\'autre que des emojis : rien n\'est chargé', made.length === 0)
  await none.unmount(); await none2.unmount(); await none3.unmount()
  // navigateur sans requestIdleCallback (Safari) : repli sur un minuteur de 0,8 s
  delete window.requestIdleCallback; delete window.cancelIdleCallback
  made.length = 0
  const m3 = await mount({ catalog: { categoryMap: { 5: { id: 5, image: U('s-cat') } }, categories: [], types: [] }, categoryId: 5 })
  await act(async () => { await tick(300) })
  const early = made.length
  await act(async () => { await tick(700) })
  ok('Safari (pas de requestIdleCallback) : repli sur un minuteur de 0,8 s', early === 0 && made.length === 1)
  await m3.unmount()
}

// ---------- branchement dans l'application ----------
{
  const { readFileSync } = await import('node:fs')
  const app = readFileSync(path.join(root, 'src/App.jsx'), 'utf8')
  const boosters = readFileSync(path.join(root, 'src/components/Boosters.jsx'), 'utf8')
  ok('l\'application réchauffe les images de la collection ACTIVE dès que le catalogue est connu', /useWarmImages\(catalog, status\?\.active_category_id\)/.test(app) && /import \{ useWarmImages \} from '\.\/useWarmImages'/.test(app))
  ok('l\'ouverture d\'un booster précharge les images des cartes tirées et attend au plus 2,5 s avant de les révéler', /preloadImages\(cards\.map/.test(boosters) && /await Promise\.race\(\[preload, wait\(2500\)\]\)/.test(boosters))
}

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nPréchargement des images : tous les contrôles sont passés.')
process.exit(0)

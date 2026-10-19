// Art Rare : animation plein écran à la révélation (l'illustration occupe l'écran, se réduit jusqu'à devenir la carte, puis feux d'artifice dorés), avec jsdom.
//   node tests/art-reveal.test.mjs
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
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
// Le « canvas » des feux d'artifice n'existe pas dans jsdom : on le simule (et on compte les démarrages)
let canvasStarts = 0
dom.window.HTMLCanvasElement.prototype.getContext = function () { canvasStarts++; return new Proxy({}, { get: () => () => {}, set: () => true }) }
const matchMediaReduce = { value: false }
dom.window.matchMedia = (q) => ({ matches: /reduce/.test(q) ? matchMediaReduce.value : false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-art-'))
await build({
  stdin: { contents: "export { Overlay } from './src/components/Boosters.jsx'; export { ART_TIMING, GOLD_FIREWORKS } from './src/components/ArtReveal.jsx'; export { isArtRare, isSpecial } from './src/rarity.js'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod' }) }, logLevel: 'silent',
})
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act, useState } = React
const { Overlay, ART_TIMING, GOLD_FIREWORKS, isArtRare, isSpecial, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
ART_TIMING.hold = 400; ART_TIMING.shrink = 500   // durées raccourcies pour le test
// attend qu'une condition soit vraie (au plus 4 s) : le test ne dépend pas de la vitesse de la machine
const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(15) } return fn() }

const R = (id, name, kind = 'range', order = 5) => ({ id, name, kind, sort_order: order, color: '#e8c', color2: '#a4a', text_color: '#fff' })
const rarityMap = { common: R('common', 'Commune', 'range', 7), art: R('art', 'Art Rare', 'range', 4), alpha: R('alpha', 'Alpha', 'alpha', 2), rare: R('rare', 'Rare', 'range', 6) }
const types = [{ id: 1, category_id: 1, name: 'Chat va ?', image: 'https://exemple.test/chat.png' }, { id: 2, category_id: 1, name: 'Chat noir', image: '🐈‍⬛' }]
const catalog = { typeMap: Object.fromEntries(types.map((t) => [t.id, t])), categoryMap: { 1: { id: 1, name: 'Chats' } }, types, rarities: Object.values(rarityMap), numberHidden: () => false, cardRef: () => '', cardStyle: () => 'fullart', checklist: (id) => ({ no: id, total: 2, secret: false }) }
const artCard = { type_id: 1, base_rarity: 'art', series: 50, number: 17, rarity_id: 'art', is_new: false }
const emojiArt = { type_id: 2, base_rarity: 'art', series: 50, number: 9, rarity_id: 'art', is_new: false }
const alphaArt = { type_id: 1, base_rarity: 'art', series: 50, number: 1, rarity_id: 'alpha', is_new: false }
const plain = { type_id: 1, base_rarity: 'common', series: 40, number: 7, rarity_id: 'common', is_new: false }

// ---------- reconnaissance de l'Art Rare : par le NOM, jamais par l'identifiant ----------
ok('Art Rare reconnue par son nom (majuscules, accents, espaces, tirets ou sans espace)', ['Art Rare', 'art rare', 'ART RARE', '  Art   Rare ', 'Art-Rare', 'ArtRare', 'Árt Rare', 'art_rare'].every((n) => isArtRare({ kind: 'range', name: n })))
ok('les autres raretés ne la déclenchent pas', ['Rare', 'Super Rare', 'Ultra Rare', 'Commune', 'Peu Commune', 'Art', 'Art Rarement', 'Rare Art', '', null, undefined].every((n) => !isArtRare({ kind: 'range', name: n })) && !isArtRare(null) && !isArtRare(undefined))
ok('seule une rareté ordinaire peut l\'être (pas une rareté spéciale qui s\'appellerait ainsi)', !isArtRare({ kind: 'alpha', name: 'Art Rare' }) && !isArtRare({ kind: 'unique', name: 'Art Rare' }))
ok('l\'identifiant ne compte pas : un identifiant « common » nommé Art Rare est reconnue', isArtRare({ id: 'common', kind: 'range', name: 'Art Rare' }) && !isArtRare({ id: 'artrare', kind: 'range', name: 'Commune' }))

// ---------- l'ouverture réelle ----------
let spy = []
async function mountReveal(cards, idx = 0) {
  const host = document.createElement('div'); document.body.appendChild(host)
  const reactRoot = createRoot(host)
  function Harness() {
    const [overlay, setOverlay] = useState({ phase: 'reveal', cards, idx, summary: false, categoryId: 1, nextCategoryId: 1, golden: false })
    const set = (o) => { spy.push(o); setOverlay(o) }
    return React.createElement(GameContext.Provider, { value: { catalog, rarityMap, rarities: Object.values(rarityMap) } }, React.createElement(Overlay, { overlay, setOverlay: set, rarityMap, catalog, boosters: 3, onAgain: () => {}, onCollection: () => {} }))
  }
  await act(async () => { reactRoot.render(React.createElement(Harness)) })
  return { host, unmount: async () => { await act(async () => reactRoot.unmount()); host.remove() } }
}
const intro = () => document.querySelector('.art-intro')
const cardEl = (h) => h.querySelector('.reveal-card')
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) }) }
const fireworks = (h) => h.querySelectorAll('canvas.fireworks').length

{
  const m = await mountReveal([artCard, plain])
  const t0 = canvasStarts
  ok('Art Rare : l\'animation plein écran démarre aussitôt (illustration sur tout l\'écran), la vraie carte est cachée en dessous, aucun feu d\'artifice encore', !!intro() && intro().className.includes('full') && cardEl(m.host).style.visibility === 'hidden' && fireworks(m.host) === 0)
  ok('la couche plein écran est posée directement dans la page (pas dans l\'écran d\'ouverture, dont la transformation la décalerait)', intro().parentElement === document.body && !intro().closest('.reveal-step') && !intro().closest('.overlay'))
  const img = document.querySelector('.art-intro-img')
  ok('l\'illustration est celle de la carte (adresse de l\'image du type) et occupe tout l\'écran (haut-gauche, 100 % de large et de haut)', img.querySelector('img')?.getAttribute('src') === 'https://exemple.test/chat.png' && img.style.top === '0px' && img.style.left === '0px' && img.style.width === '100vw' && img.style.height === '100dvh')
  ok('l\'animation est décorative (masquée aux lecteurs d\'écran) et la carte garde sa description', intro().getAttribute('aria-hidden') === 'true' && /Chat va \?, Art Rare/.test(cardEl(m.host).querySelector('.card').getAttribute('aria-label')))
  await click(cardEl(m.host))
  ok('toucher pendant l\'animation ne passe PAS à la carte suivante (la carte est cachée)', spy.length === 0 && !!intro())
  await until(() => intro()?.className.includes('shrink'))
  ok('après la pause : l\'illustration se réduit (phase « shrink », transition vers la carte de la durée réglée)', intro().className.includes('shrink') && /transition: all 500ms/.test(document.querySelector('.art-intro-img').getAttribute('style')) && document.querySelector('.art-intro-img').style.width !== '100vw')
  ok('la zone visée est celle de l\'image de la carte (mesurée sur la vraie carte)', document.querySelector('.art-intro-img').getAttribute('style').includes('top:') && !!cardEl(m.host).querySelector('.card-art'))
  await until(() => !intro())
  ok('fin de l\'animation : l\'illustration a disparu, la carte est visible avec son effet d\'apparition, les feux d\'artifice DORÉS partent', !intro() && cardEl(m.host).style.visibility !== 'hidden' && cardEl(m.host).className.includes('art-landed') && fireworks(m.host) === 1 && canvasStarts > t0)
  ok('couleurs des feux d\'artifice : dorées et grandes (comme une Unique)', GOLD_FIREWORKS.color === '#ffcf3a' && GOLD_FIREWORKS.color2 === '#d4a017' && GOLD_FIREWORKS.kind === 'unique' && isSpecial(GOLD_FIREWORKS))
  spy = []
  await wait(300)
  await click(cardEl(m.host))
  ok('ensuite, toucher la carte passe à la suivante comme d\'habitude', spy.length === 1 && spy[0].idx === 1)
  ok('la carte suivante (Commune) n\'a aucune animation ni feu d\'artifice', !intro() && fireworks(m.host) === 0 && !cardEl(m.host).className.includes('art-landed'))
  await m.unmount()
}
{
  const m = await mountReveal([artCard, plain])
  await click(intro()); await wait(10)
  ok('toucher l\'animation la passe : la carte et les feux d\'artifice apparaissent tout de suite', !intro() && cardEl(m.host).className.includes('art-landed') && fireworks(m.host) === 1)
  await wait(ART_TIMING.hold + ART_TIMING.shrink + 150)
  ok('les minuteurs de l\'animation passée ne font rien de plus (un seul départ des feux d\'artifice)', fireworks(m.host) === 1 && !intro())
  await m.unmount()
}
{
  const m = await mountReveal([emojiArt])
  ok('illustration sous forme d\'emoji : affichée en grand plein écran, sans image', !!document.querySelector('.art-intro-emoji') && !document.querySelector('.art-intro-img img') && /🐈‍⬛/.test(document.querySelector('.art-intro-emoji').textContent))
  await m.unmount()
}
{
  const m = await mountReveal([plain, artCard], 0)
  ok('carte ordinaire : pas d\'animation, la carte est visible aussitôt, pas de feux d\'artifice', !intro() && cardEl(m.host).style.visibility !== 'hidden' && fireworks(m.host) === 0)
  await m.unmount()
}
{
  const m = await mountReveal([alphaArt])
  ok('Art Rare dont le numéro est Alpha (1/50) : l\'animation plein écran aussi, puis les feux d\'artifice de l\'Alpha (pas les dorés)', !!intro() && fireworks(m.host) === 0)
  await until(() => !intro())
  ok('… puis un seul jeu de feux d\'artifice (celui de la rareté spéciale)', !intro() && fireworks(m.host) === 1)
  await m.unmount()
}
{
  const m = await mountReveal([plain, artCard], 1)
  ok('l\'Art Rare est animée même si elle n\'est pas la première carte du booster (carte 2 sur 2)', !!intro() && /carte 2 sur 2/.test(m.host.textContent))
  await until(() => !intro())
  await m.unmount()
}
{
  matchMediaReduce.value = true
  const m = await mountReveal([artCard])
  await wait(40)
  ok('« réduire les animations » activé : aucune animation plein écran, la carte et les feux d\'artifice directement', !intro() && cardEl(m.host).style.visibility !== 'hidden' && fireworks(m.host) === 1)
  await m.unmount()
  matchMediaReduce.value = false
}
{
  // type de carte inconnu : pas de plantage, l'animation se déroule avec un emoji de repli
  const m = await mountReveal([{ ...artCard, type_id: 999 }])
  ok('illustration inconnue : pas de plantage (emoji de repli)', !!intro() && !!document.querySelector('.art-intro-emoji'))
  await until(() => !intro())
  await m.unmount()
}

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nArt Rare (animation plein écran) : tous les contrôles sont passés.')
process.exit(0)

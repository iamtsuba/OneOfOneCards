// Résumé d'un booster : chaque carte s'ouvre en grand (rendu et vraies interactions : clic, flèches, Échap) avec jsdom.
//   node tests/summary-zoom.test.mjs
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

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-zoom-'))
await build({
  stdin: { contents: "export { SummaryGrid, CardZoom, Overlay } from './src/components/Boosters.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client', '@supabase/supabase-js'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { createRoot } = require('react-dom/client')
const { act } = React
const { SummaryGrid, CardZoom, Overlay, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }

const rarityMap = {
  common: { id: 'common', name: 'Commune', kind: 'range', sort_order: 7, color: '#d9d4c5', color2: '#b5ad99', text_color: '#222' },
  rare: { id: 'rare', name: 'Rare', kind: 'range', sort_order: 6, color: '#0a0', color2: '#060', text_color: '#fff' },
  ultra: { id: 'ultra', name: 'Ultra Rare', kind: 'range', sort_order: 4, color: '#f04', color2: '#a02', text_color: '#fff' },
}
const types = [{ id: 1, category_id: 1, name: 'Chat va ?', image: '🐱' }, { id: 2, category_id: 1, name: 'Le Pa Chat', image: '🧙' }, { id: 3, category_id: 1, name: 'Chat noir', image: '🐈‍⬛' }]
const catalog = { typeMap: Object.fromEntries(types.map((t) => [t.id, t])), categoryMap: { 1: { id: 1, name: 'Chat’trapez' } }, types, rarities: Object.values(rarityMap),
  numberHidden: () => false, cardRef: (id, base, number, series) => ` ${number}/${series}`, seriesOf: () => 100, checklist: (id) => ({ no: id, total: 3, secret: false }) }
const cards = [
  { type_id: 1, base_rarity: 'common', series: 50, number: 10, rarity_id: 'common', is_new: false },
  { type_id: 2, base_rarity: 'common', series: 50, number: 11, rarity_id: 'common', is_new: true },
  { type_id: 3, base_rarity: 'rare', series: 20, number: 5, rarity_id: 'rare', is_new: false },
  { type_id: 1, base_rarity: 'ultra', series: 10, number: 3, rarity_id: 'ultra', is_new: true },
]
const wrap = (el) => React.createElement(GameContext.Provider, { value: { catalog, rarityMap, rarities: Object.values(rarityMap) } }, el)
const noop = () => {}

// ---------- rendu ----------
const grid = renderToStaticMarkup(wrap(React.createElement(SummaryGrid, { cards, rarityMap, catalog, onZoom: noop })))
ok('résumé : une carte = un bouton, avec sa description pour les lecteurs d\'écran (rareté, nom)', (grid.match(/<button type="button" class="summary-card"/g) || []).length === 4 && /aria-label="Voir en grand : Rare, Chat noir"/.test(grid) && /aria-label="Voir en grand : Ultra Rare, Chat va \?"/.test(grid))
ok('résumé : les boutons sont dans l\'ordre des cartes et contiennent la carte (petite taille)', (grid.match(/class="card sm/g) || []).length === 4 && grid.indexOf('Commune, Chat va') < grid.indexOf('Rare, Chat noir'))
ok('résumé : carte inconnue du catalogue : libellé de repli, pas de plantage', (() => { const h = renderToStaticMarkup(wrap(React.createElement(SummaryGrid, { cards: [{ ...cards[0], type_id: 99 }], rarityMap, catalog, onZoom: noop }))); return /Voir en grand : Commune, carte/.test(h) && !/undefined/.test(h) })())
const zoomHtml = (i, props = {}) => renderToStaticMarkup(wrap(React.createElement(CardZoom, { cards, index: i, rarityMap, catalog, onClose: noop, onMove: noop, ...props })))
const z = zoomHtml(1)
ok('vue en grand : une fenêtre, la carte en grand format, sa rareté, son nom et son numéro', /role="dialog" aria-modal="true" aria-label="Carte en grand"/.test(z) && /class="card lg/.test(z) && /<strong>Commune<\/strong> : « Le Pa Chat » 11\/50/.test(z))
ok('vue en grand : « nouvelle carte » seulement pour une carte nouvelle', /nouvelle carte/.test(z) && !/nouvelle carte/.test(zoomHtml(0)))
ok('vue en grand : compteur « 2 / 4 », boutons Précédente, Fermer et Suivante', /2 \/ 4/.test(z) && /aria-label="Carte précédente"/.test(z) && /aria-label="Carte suivante"/.test(z) && />Fermer</.test(z))
ok('vue en grand : « précédente » désactivée sur la 1re carte, « suivante » sur la dernière, les deux actifs au milieu', /disabled="" aria-label="Carte précédente"/.test(zoomHtml(0)) && !/disabled="" aria-label="Carte suivante"/.test(zoomHtml(0)) && /disabled="" aria-label="Carte suivante"/.test(zoomHtml(3)) && !/disabled="" aria-label="Carte précédente"/.test(zoomHtml(3)) && !/disabled=""/.test(z))
ok('vue en grand : un index invalide ne plante pas (rien affiché)', zoomHtml(9) === '' && zoomHtml(-1) === '')

// ---------- interactions réelles (jsdom) ----------
const mount = async (element) => {
  const host = document.createElement('div'); document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => { root.render(element) })
  return { host, unmount: async () => { await act(async () => root.unmount()); host.remove() } }
}
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) }) }
const press = async (key) => { await act(async () => { window.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })) }) }
const q = (host, sel) => host.querySelector(sel)

{
  const calls = []
  const m = await mount(wrap(React.createElement(SummaryGrid, { cards, rarityMap, catalog, onZoom: (i) => calls.push(i) })))
  const buttons = [...m.host.querySelectorAll('.summary-card')]
  await click(buttons[2]); await click(buttons[0])
  ok('clic sur une carte du résumé : demande l\'ouverture de cette carte (3e puis 1re)', calls.join() === '2,0')
  await m.unmount()
}
{
  const log = []
  const m = await mount(wrap(React.createElement(CardZoom, { cards, index: 1, rarityMap, catalog, onClose: () => log.push('close'), onMove: (d) => log.push(`move${d}`) })))
  await click(q(m.host, '[aria-label="Carte suivante"]')); await click(q(m.host, '[aria-label="Carte précédente"]'))
  ok('flèches : suivante = +1, précédente = −1', log.join() === 'move1,move-1')
  await click([...m.host.querySelectorAll('button')].find((b) => b.textContent === 'Fermer'))
  ok('« Fermer » ferme la vue en grand', log.at(-1) === 'close')
  log.length = 0
  await click(q(m.host, '.zoom-card')); await click(q(m.host, '.reveal-line')); await click(q(m.host, '.zoom-actions'))
  ok('toucher la carte, son texte ou la zone des boutons ne ferme PAS la vue', log.length === 0)
  await click(q(m.host, '.zoom-overlay'))
  ok('toucher le fond ferme la vue', log.join() === 'close')
  await m.unmount()
}
{
  // le vrai écran : résumé du booster avec sa vue en grand, clavier compris
  const setOverlay = []
  const overlay = { phase: 'reveal', summary: true, cards, idx: 0, categoryId: 1, nextCategoryId: 1, golden: false }
  const m = await mount(wrap(React.createElement(Overlay, { overlay, setOverlay: (v) => setOverlay.push(v), rarityMap, catalog, boosters: 3, onAgain: noop, onCollection: noop })))
  const zoomOpen = () => !!q(m.host, '.zoom-overlay')
  const count = () => (q(m.host, '.zoom-count')?.textContent ?? '')
  ok('résumé réel : 4 cartes cliquables, aucune vue en grand ouverte au départ', m.host.querySelectorAll('.summary-card').length === 4 && !zoomOpen())
  await click(m.host.querySelectorAll('.summary-card')[2])
  ok('toucher la 3e carte : elle s\'ouvre en grand (3 / 4), le résumé reste dessous', zoomOpen() && count() === '3 / 4' && !!q(m.host, '.summary-grid') && /Rare<\/strong> : « Chat noir »/.test(m.host.innerHTML))
  await click(q(m.host, '[aria-label="Carte suivante"]'))
  ok('« › » : carte suivante (4 / 4), « › » désactivée sur la dernière', count() === '4 / 4' && q(m.host, '[aria-label="Carte suivante"]').disabled === true && /Ultra Rare<\/strong> : « Chat va \? »/.test(m.host.innerHTML))
  await press('ArrowLeft'); await press('ArrowLeft'); await press('ArrowLeft'); await press('ArrowLeft')
  ok('clavier : flèche gauche remonte jusqu\'à la 1re carte sans la dépasser (1 / 4)', count() === '1 / 4' && q(m.host, '[aria-label="Carte précédente"]').disabled === true)
  await press('ArrowRight')
  ok('clavier : flèche droite avance (2 / 4)', count() === '2 / 4')
  await press('Escape')
  ok('Échap : ferme seulement la vue en grand, le booster reste ouvert (résumé visible, jamais fermé)', !zoomOpen() && !!q(m.host, '.summary-grid') && setOverlay.length === 0)
  await press('Escape')
  ok('Échap une 2e fois, sans vue en grand : ferme le booster comme avant', setOverlay.length === 1 && setOverlay[0] === null)
  await click(m.host.querySelectorAll('.summary-card')[0]); await click(q(m.host, '.zoom-overlay'))
  ok('toucher une carte puis le fond : retour au résumé, booster toujours ouvert', !zoomOpen() && !!q(m.host, '.summary-grid') && setOverlay.length === 1)
  ok('les actions du résumé restent là (Ouvrir un autre booster, Voir ma collection, Fermer)', /Ouvrir un autre booster/.test(m.host.innerHTML) && /Voir ma collection/.test(m.host.innerHTML))
  await m.unmount()
}

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nRésumé et vue en grand : tous les contrôles sont passés.')
process.exit(0)

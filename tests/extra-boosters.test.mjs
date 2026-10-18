// Rend la liste « Autres boosters » de la page Boosters (stock, achat, chances) sans navigateur.
//   node tests/extra-boosters.test.mjs
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-extra-'))
await build({
  stdin: { contents: "export { ExtraBoosters } from './src/components/Boosters.jsx'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', '@supabase/supabase-js'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { ExtraBoosters } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const noop = () => {}
const items = [
  { id: 1, name: 'Silver', cards: 5, color: '#c0c0c0', price: 50, quantity: 2 },
  { id: 2, name: 'Légende', cards: 7, color: '#7c3aed', price: null, quantity: 1 },
  { id: 3, name: 'Bronze', cards: 3, color: '#cd7f32', price: 20, quantity: 0 },
  { id: 4, name: 'Mini', cards: 1, color: '#10b981', price: 5, quantity: 0 },
]
const render = (props = {}) => renderToStaticMarkup(React.createElement(ExtraBoosters, { items, coins: 100, disabled: false, onOpen: noop, onBuy: noop, onInfo: noop, ...props }))
const html = render()
const row = (name) => html.split('<li ').slice(1).find((x) => x.includes(`<strong>${name}</strong>`)) ?? ''

ok('rien à afficher sans autre booster (aucun titre, aucun bloc vide)', render({ items: [] }) === '' && render({ items: undefined }) === '')
ok('un bloc « Autres boosters » avec une ligne par booster', /<h3>Autres boosters<\/h3>/.test(html) && (html.match(/<li /g) || []).length === 4)
ok('Silver : 5 cartes, 2 en stock, couleur du booster', /<small>5 cartes · 2 en stock<\/small>/.test(row('Silver')) && /--bt:#c0c0c0/.test(row('Silver')))
ok('Silver (en stock et en vente) : boutons Ouvrir et Acheter · 50, avec leur description pour les lecteurs d\'écran', />Ouvrir</.test(row('Silver')) && /aria-label="Ouvrir un booster Silver"/.test(row('Silver')) && /aria-label="Acheter un booster Silver pour 50 pièces"/.test(row('Silver')) && /Acheter · 50 /.test(row('Silver')))
ok('Légende (hors vente, offerte) : Ouvrir seulement, jamais Acheter', />Ouvrir</.test(row('Légende')) && !/Acheter/.test(row('Légende')) && /7 cartes · 1 en stock/.test(row('Légende')))
ok('Bronze (en vente, aucun en stock) : Acheter seulement, pas Ouvrir, pas de mention de stock', /Acheter · 20 /.test(row('Bronze')) && !/>Ouvrir</.test(row('Bronze')) && !/en stock/.test(row('Bronze')) && /<small>3 cartes<\/small>/.test(row('Bronze')))
ok('une seule carte : « 1 carte » au singulier', /<small>1 carte<\/small>/.test(row('Mini')))
ok('un bouton « i » par booster pour voir ses chances', (html.match(/class="info-btn"/g) || []).length === 4 && /aria-label="Chances du booster Légende"/.test(html))
const buyBtn = (h, name) => ((h.split('<li ').slice(1).find((x) => x.includes(`<strong>${name}</strong>`)) ?? '').match(/<button[^>]*aria-label="Acheter[^>]*>/) || [''])[0]
ok('pièces : Acheter désactivé à 30 et à 49, actif à 50 (prix exact) et au-delà', /disabled=""/.test(buyBtn(render({ coins: 30 }), 'Silver')) && /disabled=""/.test(buyBtn(render({ coins: 49 }), 'Silver')) && buyBtn(render({ coins: 50 }), 'Silver') !== '' && !/disabled=""/.test(buyBtn(render({ coins: 50 }), 'Silver')) && !/disabled=""/.test(buyBtn(render({ coins: 5000 }), 'Silver')))
ok('une ouverture est en cours : tous les boutons Ouvrir et Acheter sont désactivés (le bouton « i » reste actif)', (() => { const h = render({ disabled: true }); return (h.match(/<button type="button" class="btn small[^"]*" disabled=""/g) || []).length === 5 && (h.match(/class="info-btn"/g) || []).length === 4 })())
ok('texte court et sans donnée parasite', !/undefined|NaN|null/.test(html) && html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').length < 420)

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nAutres boosters (rendu) : tous les contrôles sont passés.')

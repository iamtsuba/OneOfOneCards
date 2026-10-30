// TVA affichée en plus des prix en euros (pass Pro, packs de boosters, conditions de vente) : calcul et rendu.
//   node tests/vat-view.test.mjs
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
const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-vat-'))
await build({
  stdin: { contents: "export * from './src/price.js'; export { ProPanel, ProForm } from './src/components/Pro.jsx'; export { ConsentForm } from './src/components/PurchaseConsent.jsx'; export { LegalDocument } from './src/components/Legal.jsx'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client', 'react-dom/server'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const M = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const norm = (t) => t.replace(/\u202f|\u00a0/g, ' ')
const { priceParts, payable, payAmount, vatDetail, euro } = M

// ---------- calcul ----------
const P = (c, v) => { const p = priceParts(c, v); return [p.ht, p.tax, p.ttc] }
ok('499 + 20 % : TVA 1,00 € (99,8 arrondi à 100), à payer 5,99 €', JSON.stringify(P(499, 20)) === JSON.stringify([499, 100, 599]))
ok('autres prix : 199 -> 239, 99 -> 119, 100 -> 120, 1000 -> 1200', JSON.stringify(P(199, 20)) === '[199,40,239]' && JSON.stringify(P(99, 20)) === '[99,20,119]' && JSON.stringify(P(100, 20)) === '[100,20,120]' && JSON.stringify(P(1000, 20)) === '[1000,200,1200]')
ok('taux avec décimale (5,5 %) : 499 -> 27 de TVA, 526 à payer', JSON.stringify(P(499, 5.5)) === '[499,27,526]')
ok('sans TVA (0, absent, négatif, texte) : le prix tel quel', [0, undefined, null, -5, 'abc', NaN].every((v) => JSON.stringify(P(499, v)) === '[499,0,499]' && !priceParts(499, v).hasVat))
ok('taux absurde plafonné à 100 % (499 -> 998) ; prix 0 : pas de TVA à montrer', JSON.stringify(P(499, 150)) === '[499,499,998]' && !priceParts(0, 20).hasVat && !priceParts(undefined, 20).hasVat)
ok('textes : « 5,99 € TTC », bouton « 5,99 € », détail « 4,99 € HT + TVA 20 % (1,00 €) »', norm(payable(499, 20)) === '5,99 € TTC' && norm(payAmount(499, 20)) === '5,99 €' && norm(vatDetail(499, 20)) === '4,99 € HT + TVA 20 % (1,00 €)')
ok('taux décimal écrit à la française (5,5 %) ; sans TVA : prix seul et aucun détail', /TVA 5,5 %/.test(vatDetail(499, 5.5)) && norm(payable(499, 0)) === '4,99 €' && vatDetail(499, 0) === '' && norm(euro(499)) === '4,99 €')

// ---------- pass Pro : encart d'offre ----------
const sub = { enabled: true, active: false, name: 'OneMore', price_cents: 499, regen_minutes: 5, booster_name: 'OneMore', gift_name: 'Art Rare assuré', gift_quantity: 1, discount_percent: 20 }
const panel = (vat, s = sub) => norm(renderToStaticMarkup(React.createElement(M.ProPanel, { sub: s, baseMinutes: 10, vat, onBuy: () => {} })))
const o = panel(20)
ok('offre : le prix à payer TTC (5,99 € TTC) est en gras, avec « une seule fois, avantages à vie, sans abonnement »', /<strong>5,99 € TTC<\/strong> une seule fois, avantages à vie, sans abonnement/.test(o))
ok('offre : le détail HT + TVA sous le prix (4,99 € HT + TVA 20 % (1,00 €))', /<small class="vat-line">4,99 € HT \+ TVA 20 % \(1,00 €\)<\/small>/.test(o))
const o0 = panel(0)
ok('offre sans TVA (taux 0 ou serveur qui ne l\'annonce pas) : « 4,99 € » comme avant, aucun détail', /<strong>4,99 €<\/strong> une seule fois/.test(o0) && !/vat-line|TTC|TVA/.test(o0) && !/TTC/.test(panel(undefined)))
ok('membre : aucun prix affiché (déjà acheté), donc aucune TVA', !/TTC|TVA|vat-line/.test(panel(20, { ...sub, active: true, since: '2026-10-19T00:00:00Z' })))

// ---------- formulaire de paiement du pass ----------
const texts = { cgv: 'CGV', withdrawal: 'Rétractation' }
const pf = (props) => norm(renderToStaticMarkup(React.createElement(M.ProForm, { texts, name: 'OneMore', busy: false, error: '', onConfirm: () => {}, onCancel: () => {}, onOpenTerms: () => {}, ...props })))
const f = pf({ price: payable(499, 20), pay: payAmount(499, 20), vatLine: vatDetail(499, 20) })
ok('formulaire du pass : « 5,99 € TTC, payé une seule fois », le détail HT + TVA, et le bouton « Payer 5,99 € »', /<strong>5,99 € TTC<\/strong>, payé une seule fois/.test(f) && /<p class="vat-line vat-line-block">4,99 € HT \+ TVA 20 % \(1,00 €\)<\/p>/.test(f) && />Payer 5,99 €</.test(f))
const f0 = pf({ price: '9,99 €' })
ok('formulaire sans TVA ni montant séparé (ancien appel) : prix tel quel, bouton « Payer 9,99 € », pas de détail', /<strong>9,99 €<\/strong>, payé une seule fois/.test(f0) && />Payer 9,99 €</.test(f0) && !/vat-line/.test(f0))

// ---------- validation d'achat d'un pack ----------
const cf = (props) => norm(renderToStaticMarkup(React.createElement(M.ConsentForm, { texts, packBoosters: 10, busy: false, error: '', onConfirm: () => {}, onCancel: () => {}, onOpenTerms: () => {}, ...props })))
const c1 = cf({ price: payable(99, 20), pay: payAmount(99, 20), vatLine: vatDetail(99, 20) })
ok('pack : « 10 boosters pour 1,19 € TTC », le détail (0,99 € HT + TVA 20 % (0,20 €)) et le bouton « Payer 1,19 € »', /<strong>10 boosters<\/strong> pour <strong>1,19 € TTC<\/strong>/.test(c1) && /0,99 € HT \+ TVA 20 % \(0,20 €\)/.test(c1) && />Payer 1,19 €</.test(c1))
ok('pack sans TVA : prix tel quel (0,99 €), pas de détail', !/vat-line/.test(cf({ price: payable(99, 0), pay: payAmount(99, 0), vatLine: vatDetail(99, 0) })))

// ---------- conditions de vente ----------
const lg = (config) => norm(renderToStaticMarkup(React.createElement(M.LegalDocument, { legal: { seller_name: 'Tsuba Games' }, config })))
const l1 = lg({ stripe_pack_boosters: 10, stripe_pack_price_cents: 99, vat_percent: 20 })
ok('conditions de vente : « au prix de 1,19 € TTC (0,99 € HT + TVA 20 % (0,20 €)) » et plus la phrase « toutes taxes comprises lorsqu\'elles s\'appliquent »', /au prix de 1,19 € TTC \(0,99 € HT \+ TVA 20 % \(0,20 €\)\)/.test(l1) && !/toutes taxes comprises lorsqu/.test(l1))
const l0 = lg({ stripe_pack_boosters: 10, stripe_pack_price_cents: 99, vat_percent: 0 })
ok('conditions de vente sans TVA : l\'ancienne formulation (0,99 €, toutes taxes comprises lorsqu\'elles s\'appliquent)', /au prix de 0,99 €, toutes taxes comprises lorsqu’elles s’appliquent/.test(l0))
ok('conditions de vente : prix non réglé : « [prix] » comme avant', /au prix de \[prix\]/.test(lg({ stripe_pack_boosters: 10 })))

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nTVA affichée : tous les contrôles sont passés.')
process.exit(0)

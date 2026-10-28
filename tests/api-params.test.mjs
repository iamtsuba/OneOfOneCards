// Forme des appels au serveur : contre-offre, acceptation des conditions d'utilisation, prix de revente d'une rareté, offres (anciens et nouveaux paramètres).
//   node tests/api-params.test.mjs
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const calls = []
globalThis.fetch = async (url, init) => { calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null }); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) }
globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, addEventListener() {}, location: { origin: 'https://pp.1o1cards.cc', pathname: '/' } }
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'TestAgent/1.0' }, configurable: true })
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-api-'))
await build({ entryPoints: [path.join(root, 'src/api.js')], bundle: true, format: 'esm', platform: 'node', outfile: path.join(out, 'a.mjs'), logLevel: 'silent',
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) } })
const api = await import(pathToFileURL(path.join(out, 'a.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const last = () => calls.at(-1)
const fn = (c) => c.url.split('/rpc/')[1]

await api.counterOffer(12, 35)
ok('contre-offre : counter_offer avec l\'offre et le montant', fn(last()) === 'pp_o1ocards_counter_offer' && JSON.stringify(last().body) === JSON.stringify({ p_id: 12, p_amount: 35 }))
await api.respondOffer(12, true); await api.respondOffer(12, false)
ok('accepter / refuser : toujours respond_offer(id, accepter) à deux paramètres (compatible avec le serveur précédent)', fn(calls.at(-2)) === 'pp_o1ocards_respond_offer' && JSON.stringify(calls.at(-2).body) === JSON.stringify({ p_id: 12, p_accept: true }) && JSON.stringify(last().body) === JSON.stringify({ p_id: 12, p_accept: false }))
await api.acceptTerms(3)
ok('conditions d\'utilisation : accept_terms avec la version et le navigateur', fn(last()) === 'pp_o1ocards_accept_terms' && JSON.stringify(last().body) === JSON.stringify({ p_version: 3, p_user_agent: 'TestAgent/1.0' }))
const rar = { id: 'common', name: 'Commune', max_series: 100, color: '#fff', color2: '#ccc', text_color: '#000' }
await api.adminSaveRarity('pw', { ...rar, sell_price: '7' })
ok('prix de revente d\'une rareté : envoyé en nombre (p_sell_price = 7)', last().body.p_sell_price === 7 && last().body.p_id === 'common')
await api.adminSaveRarity('pw', { ...rar, sell_price: '' })
ok('prix vide : envoyé comme « pas de prix propre » (null), pour revenir au prix général', 'p_sell_price' in last().body && last().body.p_sell_price === null)
await api.adminSaveRarity('pw', { ...rar, sell_price: '0' })
ok('prix à 0 : envoyé comme 0 (revente gratuite), pas confondu avec « vide »', last().body.p_sell_price === 0)
await api.adminSaveRarity('pw', rar)
ok('formulaire sans le champ (ancien appel) : p_sell_price n\'est pas envoyé (un ancien serveur ne le connaît pas)', !('p_sell_price' in last().body))
await api.adminSaveBoosterType('pw', null, { name: 'X', cards: 2, color: '#111111', price: null, enabled: true, slots: [], role: null, glow: 'none', position: 4 })
ok('ordre d\'un booster : p_position envoyé seulement s\'il est renseigné', last().body.p_position === 4)
await api.adminSaveBoosterType('pw', null, { name: 'X', cards: 2, color: '#111111', price: null, enabled: true, slots: [], role: null, glow: 'none', position: null })
ok('ordre vide : p_position absent (le serveur ajoute le booster à la suite)', !('p_position' in last().body))

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nAppels au serveur : tous les contrôles sont passés.')
process.exit(0)

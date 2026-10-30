// Page Boosters et collections : une seule collection ouverte = son nom en texte sous « Booster » ; plusieurs = liste déroulante ; tous les boosters de la page suivent la collection choisie
// (paquets, stock lié, ouverture, achat, cartes tirées) ; choix retenu ; arrivée depuis l'annonce d'une récompense ; collection terminée. Avec jsdom.
//   node tests/collections-select.test.mjs
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
dom.window.confirm = (m) => { confirmAsked.push(m); return true }

const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })
const calls = []        // appels serveur : [nom, corps]
const confirmAsked = []  // appels à la boîte de dialogue du navigateur (il ne doit plus y en avoir)
let openReply = null    // réponse simulée à une ouverture (null : erreur 400)
let buyFail = null      // message d'erreur simulé pour un achat (null : achat réussi)
globalThis.fetch = async (url, init) => {
  const u = String(url); const body = init?.body ? JSON.parse(init.body) : {}
  const name = ['open_booster_of_type', 'open_booster', 'open_golden_pack', 'buy_booster', 'open_gold_reward'].find((n) => u.includes(n))
  if (name) {
    calls.push([name, body])
    if (name === 'buy_booster') return buyFail ? json({ message: buyFail }, 400) : json({ ok: true, status: { ...currentStatus, coins: 350 } })
    return openReply ? json(openReply) : json({ message: 'ouverture simulée' }, 400)
  }
  return json([])
}

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-collsel-'))
await build({
  stdin: { contents: "export { default as Boosters } from './src/components/Boosters.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act, useState } = React
const { Boosters, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
const text = (h) => h.textContent.replace(/\s+/g, ' ')
const title = (h) => (h.querySelector('.pack-name')?.textContent ?? '').trim()
const coll = (h) => (h.querySelector('.pack-collection')?.textContent ?? '').trim()
const btn = (h, re) => [...h.querySelectorAll('button')].find((b) => re.test(b.textContent))
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) }); await wait(40) }
const select = (h) => h.querySelector('select[aria-label], label.pack-collection select')
const change = async (el, v) => { await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new window.Event('change', { bubbles: true })) }); await wait(40) }

const col = (id, name, extra = {}) => ({ id, name, color: '#f59e0b', color2: '#c2410c', text_color: '#fff', image: '🐱', ...extra })
const catalog = { categoryMap: { 5: col(5, 'Chat’trapez les tous !'), 6: col(6, 'Rat’trapez les tous !', { color: '#6366f1', color2: '#3730a3' }) }, typeMap: {}, types: [], rarities: [], cardRef: () => '', numberHidden: () => false }
const premium = { id: 30, name: 'Premium', cards: 5, color: '#9ca3af', glow: 'none', price: 150, quantity: 0 }
const c5 = { id: 5, name: 'Chat’trapez les tous !', cards_taken: 1500, total_cards: 12991836 }
const c6 = { id: 6, name: 'Rat’trapez les tous !', cards_taken: 40, total_cards: 800000 }
const base = { id: 'u1', username: 'Tsuba', boosters: 10, bonus_boosters: 0, coins: 500, coins_locked: 0, gold_rewards: [], reward_notices: [], max_boosters: 10, regen_minutes: 10, regen_amount: 10,
  active_category_id: 5, active_categories: [c5], linked_boosters: [], next_refill_at: null, cards_taken: 1500, total_cards: 12991836, next_category: null, cgv_version: 3, shop_enabled: false, booster_types: [],
  standard_booster: { id: 1, name: 'Standard', glow: 'none', color: '#e8452e' }, server_now: new Date().toISOString(), subscription: { enabled: false, active: false } }
let currentStatus = base

async function mountPage(initial, props = {}) {
  currentStatus = initial
  const host = document.createElement('div'); document.body.appendChild(host)
  const reactRoot = createRoot(host)
  function Harness() {
    const [status, setStatus] = useState(initial)
    return React.createElement(GameContext.Provider, { value: { status, setStatus, refreshStatus: async () => { setStatus(currentStatus); return currentStatus }, rarityMap: {}, catalog, setRevealing: () => {} } }, React.createElement(Boosters, { goCollection: () => {}, ...props }))
  }
  await act(async () => { reactRoot.render(React.createElement(Harness)) })
  await wait(50)
  return { host, unmount: async () => { await act(async () => reactRoot.unmount()); host.remove() } }
}
const clearSaved = () => { try { window.localStorage.removeItem('o1o_collection') } catch { /* rien */ } }

// ---------- une seule collection ouverte ----------
clearSaved()
{
  const m = await mountPage(base)
  ok('une seule collection ouverte : « Booster » puis son nom en TEXTE (pas de liste déroulante)', title(m.host) === 'Booster' && coll(m.host) === 'Chat’trapez les tous !' && !m.host.querySelector('label.pack-collection') && !m.host.querySelector('.pack-collection select'))
  ok('l\'ancien titre « Booster « … » » n\'existe plus', !/Booster «/.test(text(m.host)))
  ok('cartes tirées de la collection, sans phrase sur une « prochaine collection »', /Chat’trapez les tous ! : 1[  ]?500 cartes tirées sur 12[  ]?991[  ]?836\./.test(text(m.host)) && !/s’ouvrira|dernière collection|dernière collection/.test(text(m.host)))
  calls.length = 0
  await click(btn(m.host, /^Ouvrir un booster$/))
  ok('l\'ouverture demande la collection (p_category = 5)', calls.length === 1 && calls[0][0] === 'open_booster' && calls[0][1].p_category === 5)
  await m.unmount()
}
{
  const m = await mountPage({ ...base, active_categories: undefined, cards_taken: 7, total_cards: 70 })
  ok('serveur de la version précédente (sans liste de collections) : la collection active reste affichée en texte, ses chiffres aussi', coll(m.host) === 'Chat’trapez les tous !' && /7 cartes tirées sur 70/.test(text(m.host)))
  await m.unmount()
}

// ---------- plusieurs collections ouvertes ----------
clearSaved()
const two = { ...base, active_categories: [c5, c6] }
{
  const m = await mountPage(two)
  ok('plusieurs collections ouvertes : « Booster » puis une LISTE DÉROULANTE (la première sélectionnée), plus de texte seul', title(m.host) === 'Booster' && !!select(m.host) && [...select(m.host).options].map((o) => `${o.value}=${o.textContent}`).join('|') === '5=Chat’trapez les tous !|6=Rat’trapez les tous !' && select(m.host).value === '5' && !m.host.querySelector('p.pack-collection'))
  ok('le paquet affiche la collection choisie (titre du paquet) et les cartes tirées sont celles de cette collection', /Chat’trapez les tous !/.test(m.host.querySelector('.pack-wrap').textContent) && /1[  ]?500 cartes tirées sur/.test(text(m.host)))
  await change(select(m.host), '6')
  ok('changer de collection : TOUS les boosters de la page suivent (paquet, cartes tirées de la nouvelle collection)', select(m.host).value === '6' && /Rat’trapez les tous !/.test(m.host.querySelector('.pack-wrap').textContent) && /Rat’trapez les tous ! : 40 cartes tirées sur 800/.test(text(m.host)) && !/1[  ]?500 cartes tirées/.test(text(m.host)))
  calls.length = 0
  await click(btn(m.host, /^Ouvrir un booster$/))
  ok('l\'ouverture se fait dans la collection choisie (p_category = 6)', calls.length === 1 && calls[0][1].p_category === 6)
  ok('le choix est retenu d\'une visite à l\'autre', window.localStorage.getItem('o1o_collection') === '6')
  await m.unmount()
  const m2 = await mountPage(two)
  ok('à la visite suivante, la collection retenue est déjà choisie', select(m2.host).value === '6' && /Rat’trapez les tous !/.test(m2.host.querySelector('.pack-wrap').textContent))
  await m2.unmount()
}
{
  window.localStorage.setItem('o1o_collection', '99')
  const m = await mountPage(two)
  ok('collection retenue qui n\'est plus ouverte : retour à la première collection ouverte, sans plantage', select(m.host).value === '5')
  await m.unmount()
  clearSaved()
}
{
  const m = await mountPage(two, { initialCategory: 6 })
  ok('arrivée depuis l\'annonce d\'une récompense : la collection de la carte complétée est choisie', select(m.host).value === '6')
  await m.unmount()
  clearSaved()
}

// ---------- boosters liés à une collection ----------
{
  const linked = { ...two, booster_types: [premium], linked_boosters: [{ booster_type_id: 30, category_id: 6, quantity: 2 }] }
  const m = await mountPage(linked)
  ok('un Premium lié à Rat’trapez n\'apparaît PAS en stock sur Chat’trapez (il est seulement en vente)', !m.host.querySelector('.pack-shelf') && /Acheter/.test(text(m.host.querySelector('.extra-boosters'))) && !/en stock/.test(text(m.host.querySelector('.extra-boosters'))))
  await change(select(m.host), '6')
  ok('sur Rat’trapez : le Premium lié (×2) est en stock, dans l\'étagère, à côté du Standard', m.host.querySelectorAll('.shelf-pack').length === 2 && /Premium/.test(m.host.querySelectorAll('.shelf-pack')[1].getAttribute('aria-label')) && /×2/.test(m.host.querySelectorAll('.shelf-pack')[1].textContent))
  await click(m.host.querySelectorAll('.shelf-pack')[1])
  ok('Premium choisi : « Booster Premium », collection Rat’trapez, 2 boosters prêts', title(m.host) === 'Booster Premium' && /Rat’trapez les tous !/.test(m.host.textContent) && /2 boosters prêts/.test(text(m.host)))
  calls.length = 0
  await click(btn(m.host, /^Ouvrir un booster Premium$/))
  ok('« Ouvrir un booster Premium » : type 30 dans la collection 6', calls.length === 1 && calls[0][0] === 'open_booster_of_type' && calls[0][1].p_type === 30 && calls[0][1].p_category === 6)
  await m.unmount()
  clearSaved()
}
{
  const mixed = { ...two, booster_types: [{ ...premium, quantity: 1 }], linked_boosters: [{ booster_type_id: 30, category_id: 5, quantity: 1 }] }
  const m = await mountPage(mixed)
  ok('stock sans collection (1) + stock lié à la collection choisie (1) : 2 Premium prêts', /×2/.test(m.host.querySelectorAll('.shelf-pack')[1]?.textContent ?? ''))
  await change(select(m.host), '6')
  ok('sur l\'autre collection : seul le stock sans collection (1) reste utilisable', /×1/.test(m.host.querySelectorAll('.shelf-pack')[1]?.textContent ?? ''))
  await m.unmount()
  clearSaved()
}

// ---------- achat : le booster s'ouvre tout de suite, dans la collection choisie ----------
const waitFor = async (fn, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms && !fn()) await wait(50); return fn() }
const boughtCard = { type_id: 1, base_rarity: 'rare', series: 5, number: 3, rarity_id: 'rare', is_new: true }
const premiumReply = (cat = 6) => ({ cards: [boughtCard], category_id: cat, booster: { id: 30, name: 'Premium', color: '#9ca3af', glow: 'none' }, status: { ...base, active_category_id: cat } })
const buyBtnOf = (h) => [...h.querySelectorAll('.extra-boosters button')].find((b) => /Acheter/.test(b.textContent))
const confirmYes = async (h) => { await waitFor(() => !!h.querySelector('.buy-confirm .confirm-yes')); await click(h.querySelector('.buy-confirm .confirm-yes')) }
const popup = (h) => h.querySelector('.buy-confirm')
const toSummary = async (h) => { await waitFor(() => !!h.querySelector('.reveal-card')); await wait(300); await click(h.querySelector('.reveal-card')); return waitFor(() => !!h.querySelector('[aria-label="Résumé du booster"]')) }
{
  openReply = premiumReply(6)
  const m = await mountPage({ ...two, booster_types: [premium] })
  await change(select(m.host), '6')
  calls.length = 0
  confirmAsked.length = 0
  await click(buyBtnOf(m.host))
  const pop = popup(m.host)
  const flat = (t) => t.replace(/\u202f|\u00a0/g, ' ').replace(/\s+/g, ' ')
  ok('« Acheter » ouvre une fenêtre de validation du jeu (pas la boîte du navigateur), sans rien acheter encore', !!pop && pop.getAttribute('role') === 'dialog' && /Acheter un booster Premium \?/.test(pop.textContent) && calls.length === 0 && confirmAsked.length === 0)
  ok('la fenêtre est dans un panneau clair (« sheet ») : prix 150, collection choisie, solde avant et après, « s\'ouvre tout de suite »', !!pop.querySelector('.sheet section h3') && /Prix150 🪙/.test(flat(pop.textContent)) && /CollectionRat’trapez les tous !/.test(flat(pop.textContent)) && /Ton solde500 🪙 → 350 🪙/.test(flat(pop.textContent)) && /Le booster s’ouvre tout de suite/.test(pop.textContent))
  await confirmYes(m.host)
  await waitFor(() => calls.length >= 2)
  ok('acheter un Premium : p_category = la collection choisie (6)', calls[0][0] === 'buy_booster' && calls[0][1].p_type === 30 && calls[0][1].p_category === 6)
  ok('le booster acheté s\'ouvre AUSSITÔT : open_booster_of_type du Premium dans la même collection (6), sans passer par le stock', calls.length === 2 && calls[1][0] === 'open_booster_of_type' && calls[1][1].p_type === 30 && calls[1][1].p_category === 6)
  ok('la fenêtre d\'ouverture est là (le paquet s\'ouvre), plus aucun message « ajouté à ton stock »', !!m.host.querySelector('[aria-label="Ouverture du booster"], [aria-label="Cartes du booster"]') && !/ajouté à ton stock/.test(text(m.host)))
  await m.unmount()
  clearSaved()
}
{
  // fin d'ouverture d'un booster PAYANT : « Acheter un nouveau booster · prix »
  openReply = premiumReply(5)
  const m = await mountPage({ ...base, coins: 500, booster_types: [{ ...premium, quantity: 0 }] })
  await click(buyBtnOf(m.host)); await confirmYes(m.host)
  ok('résumé de l\'ouverture atteint', await toSummary(m.host))
  const again = btn(m.host, /Acheter un nouveau booster/)
  ok('booster payant : le bouton « Acheter un nouveau booster · 150 🪙 » apparaît à la fin, actif (500 pièces)', !!again && /Acheter un nouveau booster · 150 🪙/.test(text(again)) && again.disabled === false && /pour 150 pièces/.test(again.getAttribute('aria-label')))
  ok('le bouton est dans les actions du résumé, avant « Voir ma collection » et « Fermer »', (() => { const names = [...m.host.querySelectorAll('.overlay-actions button')].map((b) => b.textContent); return /Acheter un nouveau booster/.test(names[0]) && /Voir ma collection/.test(names.at(-2)) && /Fermer/.test(names.at(-1)) })())
  calls.length = 0
  await click(again)
  ok('depuis le résumé : la même fenêtre de validation s\'ouvre PAR-DESSUS (rien n\'est acheté tant qu\'on n\'a pas validé)', !!popup(m.host) && calls.length === 0 && !!m.host.querySelector('[aria-label="Résumé du booster"]'))
  await confirmYes(m.host)
  await waitFor(() => calls.length >= 2)
  ok('valider : achat du même booster (collection choisie 5) puis ouverture immédiate d\'un nouveau, sans quitter la fenêtre', calls[0][0] === 'buy_booster' && calls[0][1].p_type === 30 && calls[0][1].p_category === 5 && calls[1][0] === 'open_booster_of_type' && calls[1][1].p_type === 30 && !!m.host.querySelector('.overlay'))
  await toSummary(m.host)
  ok('et la fin de ce nouveau booster propose de nouveau d\'en acheter un', !!btn(m.host, /Acheter un nouveau booster/))
  await m.unmount()
  clearSaved()
}
{
  // solde insuffisant : bouton désactivé (le prix MEMBRE compte), aucun appel
  openReply = premiumReply(5)
  const m = await mountPage({ ...base, coins: 500, booster_types: [{ ...premium, price: 150, member_price: 120, quantity: 0 }] })
  await click(buyBtnOf(m.host)); await confirmYes(m.host)
  await toSummary(m.host)
  const norm2 = (t) => t.replace(/\u202f|\u00a0/g, ' ')
  const again = btn(m.host, /Acheter un nouveau booster/)
  ok('membre : le bouton montre l\'ancien prix barré puis le prix membre (150 → 120)', /Acheter un nouveau booster · 150 120 🪙/.test(norm2(again.textContent)) && !!again.querySelector('s.price-old') && /pour 120 pièces/.test(again.getAttribute('aria-label')))
  await m.unmount(); clearSaved()
}
{
  // pas de bouton d'achat pour un booster qui n'est pas en vente : stock gratuit, booster hors vente
  openReply = { cards: [boughtCard], category_id: 5, booster: { id: 1, name: 'Standard', color: '#e8452e', glow: 'none' }, status: { ...base } }
  const free = await mountPage({ ...base, boosters: 3 })
  await click(btn(free.host, /^Ouvrir un booster/))
  await toSummary(free.host)
  ok('booster du stock gratuit : aucun bouton d\'achat à la fin', !btn(free.host, /Acheter un nouveau booster/))
  await free.unmount(); clearSaved()
  const gift = { id: 31, name: 'Légende', cards: 7, color: '#7c3aed', glow: 'none', price: null, quantity: 1 }
  openReply = { cards: [boughtCard], category_id: 5, booster: { id: 31, name: 'Légende', color: '#7c3aed', glow: 'none' }, status: { ...base } }
  const hors = await mountPage({ ...base, booster_types: [gift] })
  await click([...hors.host.querySelectorAll('.shelf-pack')].find((b) => /Légende/.test(b.getAttribute('aria-label'))))
  await click(btn(hors.host, /^Ouvrir un booster Légende/))
  await toSummary(hors.host)
  ok('booster hors vente (cadeau, récompense) : aucun bouton d\'achat à la fin', !btn(hors.host, /Acheter un nouveau booster/))
  await hors.unmount(); clearSaved()
}
{
  // erreurs
  buyFail = 'not_enough_coins'
  const m = await mountPage({ ...base, coins: 500, booster_types: [{ ...premium, quantity: 0 }] })
  calls.length = 0
  await click(buyBtnOf(m.host)); await confirmYes(m.host); await wait(200)
  ok('achat refusé (pas assez de pièces) : aucune ouverture n\'est tentée, le message s\'affiche', calls.length === 1 && calls[0][0] === 'buy_booster' && /Tu n’as pas assez de pièces/.test(text(m.host)) && !m.host.querySelector('.overlay'))
  buyFail = null
  await m.unmount(); clearSaved()
  // achat réussi mais ouverture impossible (collection terminée...) : le booster reste en stock, l'erreur est montrée
  openReply = null
  const m2 = await mountPage({ ...base, coins: 500, booster_types: [{ ...premium, quantity: 0 }] })
  calls.length = 0
  await click(buyBtnOf(m2.host)); await confirmYes(m2.host); await waitFor(() => calls.length >= 2); await wait(300)
  ok('achat réussi mais ouverture impossible : le message d\'erreur s\'affiche et la fenêtre se referme (le booster acheté est dans le stock)', calls.length === 2 && calls[1][0] === 'open_booster_of_type' && !m2.host.querySelector('.overlay') && !!m2.host.querySelector('[role="alert"]'))
  await m2.unmount(); clearSaved()
  // échec de l'achat DEPUIS le résumé : message dans la fenêtre, le résumé reste
  openReply = premiumReply(5)
  const m3 = await mountPage({ ...base, coins: 500, booster_types: [{ ...premium, quantity: 0 }] })
  await click(buyBtnOf(m3.host)); await confirmYes(m3.host); await toSummary(m3.host)
  buyFail = 'not_enough_coins'
  await click(btn(m3.host, /Acheter un nouveau booster/)); await confirmYes(m3.host); await wait(150)
  ok('échec d\'un nouvel achat depuis le résumé : message « pas assez de pièces » dans la fenêtre, le résumé reste affiché', /Tu n’as pas assez de pièces/.test(text(m3.host.querySelector('.overlay'))) && !!m3.host.querySelector('[aria-label="Résumé du booster"]'))
  buyFail = null
  await m3.unmount(); clearSaved()
  openReply = null
}

// ---------- fenêtre de validation : remise membre, solde, annulation ----------
{
  openReply = premiumReply(5)
  const norm = (t) => t.replace(/\u202f|\u00a0/g, ' ').replace(/\s+/g, ' ')
  const mem = await mountPage({ ...two, coins: 1000, booster_types: [{ ...premium, price: 150, member_price: 120 }] })
  const bb = () => [...mem.host.querySelectorAll('.extra-boosters button')].find((b) => /Acheter/.test(b.textContent))
  ok('membre : le bouton montre l\'ancien prix barré (150) puis le prix membre (120)', /Acheter · 150 120 🪙/.test(norm(bb().textContent)) && !!bb().querySelector('s.price-old'))
  calls.length = 0; confirmAsked.length = 0
  await click(bb())
  let pop = popup(mem.host)
  ok('la validation montre le prix barré, le prix membre et la remise (−30)', !!pop.querySelector('s.price-old') && pop.querySelector('s.price-old').textContent.trim() === '150' && /Remise membre OneMore/.test(pop.textContent) && /−30 🪙/.test(norm(pop.textContent)) && /Acheter · 120 🪙/.test(norm(pop.querySelector('.confirm-yes').textContent)))
  ok('le solde est annoncé avant et après (1 000 → 880)', /1 000 🪙 → 880 🪙/.test(norm(pop.textContent)))
  await click(pop.querySelector('.confirm-no'))
  ok('Annuler : la fenêtre se ferme, rien n\'est acheté ni ouvert, aucune boîte du navigateur', !popup(mem.host) && calls.length === 0 && confirmAsked.length === 0 && !mem.host.querySelector('.overlay'))
  await click(bb())
  await act(async () => { window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })) }); await wait(40)
  ok('Échap ferme aussi la fenêtre sans rien acheter', !popup(mem.host) && calls.length === 0)
  await click(bb())
  await click(popup(mem.host))   // clic sur le fond sombre
  ok('un clic à côté de la fenêtre l\'annule aussi', !popup(mem.host) && calls.length === 0)
  await mem.unmount(); clearSaved()

  const non = await mountPage({ ...two, coins: 1000, booster_types: [{ ...premium, price: 150, member_price: 150 }] })
  await click([...non.host.querySelectorAll('.extra-boosters button')].find((b) => /Acheter/.test(b.textContent)))
  pop = popup(non.host)
  ok('non-membre : prix simple, aucune ligne de remise ni prix barré', !pop.querySelector('s') && !/Remise/.test(pop.textContent) && /Acheter · 150 🪙/.test(norm(pop.querySelector('.confirm-yes').textContent)))
  await non.unmount(); clearSaved()

  const exact = await mountPage({ ...two, coins: 150, booster_types: [{ ...premium, price: 150 }] })
  await click([...exact.host.querySelectorAll('.extra-boosters button')].find((b) => /Acheter/.test(b.textContent)))
  ok('150 pièces pour un booster à 150 : l\'achat est possible, le solde tombera à 0', !popup(exact.host).querySelector('.confirm-yes').disabled && /150 🪙 → 0 🪙/.test(norm(popup(exact.host).textContent)))
  await exact.unmount(); clearSaved()
  openReply = null
}

// ---------- collection terminée pendant l'ouverture ----------
{
  openReply = { error: 'collection_closed', status: { ...two, active_categories: [c5], active_category_id: 5 } }
  const m = await mountPage(two)
  currentStatus = { ...two, active_categories: [c5], active_category_id: 5 }   // ce que le serveur renverra au rafraîchissement du statut
  await change(select(m.host), '6')
  await click(btn(m.host, /^Ouvrir un booster$/)); await wait(80)
  ok('collection terminée entre-temps : rien ne s\'ouvre, message clair, l\'écran d\'ouverture se ferme', !document.querySelector('.overlay') && /Cette collection n’est plus ouverte/.test(text(m.host)))
  ok('et la liste des collections est mise à jour (plus qu\'une : texte seul, sur la collection restante)', !m.host.querySelector('label.pack-collection') && coll(m.host) === 'Chat’trapez les tous !')
  openReply = null
  await m.unmount()
  clearSaved()
}

// ---------- booster ordinaire devenu Gold par hasard ----------
{
  const card = { type_id: 1, base_rarity: 'rare', series: 5, number: 3, rarity_id: 'rare', is_new: true }
  openReply = { cards: [card], golden: true, category_id: 5, booster: { id: 40, name: 'Gold', color: '#d4af37', glow: 'gold' }, status: base }
  const m = await mountPage(base)
  await click(btn(m.host, /^Ouvrir un booster$/))
  const t0 = Date.now()
  const hintOf = () => document.querySelector('.overlay-hint')?.textContent ?? ''
  while (Date.now() - t0 < 8000 && !/carte 1 sur 1/.test(hintOf())) await wait(50)
  const revealHint = hintOf()
  await wait(300)
  await click(document.querySelector('.reveal-card'))   // la carte est révélée : on passe au résumé
  const t1 = Date.now()
  while (Date.now() - t1 < 4000 && !document.querySelector('.overlay-title')) await wait(50)
  const title = document.querySelector('.overlay-title')?.textContent ?? ''
  ok('un booster ordinaire devenu Gold par hasard : annoncé « Booster Gold » (le nom du booster Gold du module Boosters) à la révélation puis au résumé, jamais « Booster doré »', /^Booster Gold : carte 1 sur 1/.test(revealHint) && title === 'Booster Gold' && !/doré/.test(document.body.textContent))
  ok('l\'ouverture a bien été demandée normalement (booster du stock gratuit, collection 5)', calls.at(-1)[0] === 'open_booster' && calls.at(-1)[1].p_category === 5)
  openReply = null
  await m.unmount()
}

// ---------- aucune collection ouverte ----------
{
  const m = await mountPage({ ...base, active_category_id: null, active_categories: [] })
  ok('aucune collection ouverte : message « Toutes les collections… », ni titre ni liste', /Toutes les collections de boosters ont été entièrement tirées/.test(text(m.host)) && !m.host.querySelector('.pack-name') && !m.host.querySelector('select'))
  await m.unmount()
}

// ---------- boutique de packs : prix TTC et détail de la TVA ----------
{
  const norm = (t) => t.replace(/\u202f|\u00a0/g, ' ').replace(/\s+/g, ' ')
  const shop = { ...base, shop_enabled: true, pack_boosters: 10, pack_price_cents: 99, vat_percent: 20 }
  const m = await mountPage(shop)
  const line = norm(m.host.querySelector('.shop .muted').textContent)
  ok('boutique : « 10 boosters en plus pour 1,19 € TTC (0,99 € HT + TVA 20 % (0,20 €)) »', /10 boosters en plus pour 1,19 € TTC \(0,99 € HT \+ TVA 20 % \(0,20 €\)\)\./.test(line))
  ok('boutique : le bouton d\'achat du pack ne change pas (« Acheter 10 boosters »)', /Acheter 10 boosters/.test(m.host.querySelector('.shop .btn').textContent))
  await m.unmount(); clearSaved()
  const m0 = await mountPage({ ...shop, vat_percent: 0 })
  ok('boutique sans TVA : « 10 boosters en plus pour 0,99 €. » comme avant, sans détail', /10 boosters en plus pour 0,99 €\./.test(norm(m0.host.querySelector('.shop .muted').textContent)) && !m0.host.querySelector('.shop .vat-line'))
  await m0.unmount(); clearSaved()
  const mo = await mountPage({ ...shop, vat_percent: undefined })
  ok('boutique avec un serveur qui n\'annonce pas encore la TVA : comme avant (0,99 €)', /pour 0,99 €\./.test(norm(mo.host.querySelector('.shop .muted').textContent)))
  await mo.unmount(); clearSaved()
}

// ---------- style de la fenêtre de validation ----------
{
  const { readFileSync } = await import('node:fs')
  const css = readFileSync(path.join(root, 'src/styles.css'), 'utf8')
  const src = readFileSync(path.join(root, 'src/components/Boosters.jsx'), 'utf8')
  ok('plus aucune boîte de dialogue du navigateur (window.confirm) dans la page Boosters', !/window\.confirm|[^.\w]confirm\(/.test(src))
  ok('la fenêtre s\'affiche AU-DESSUS du résumé d\'ouverture (z-index 60 contre 50)', /\.overlay \{[^}]*z-index: 50/.test(css) && /\.buy-confirm \{ z-index: 60; \}/.test(css))
  ok('mise en page : panneau clair centré, lignes prix / collection / solde en deux colonnes, boutons centrés qui passent à la ligne', /\.buy-confirm \.sheet \{ text-align: center; \}/.test(css) && /\.confirm-lines li \{[^}]*display: flex[^}]*justify-content: space-between/.test(css) && /\.confirm-actions \{[^}]*justify-content: center[^}]*flex-wrap: wrap/.test(css))
  ok('le petit paquet est réduit (104 px) pour ne pas écraser la fenêtre', /\.confirm-pack \.pack-wrap \{ width: 104px; \}/.test(css))
  ok('prix barré et prix membre : mêmes styles que dans la boutique', /\.price-old \{ text-decoration: line-through/.test(css) && /\.price-new \{ font-weight: 800/.test(css))
}

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nPage Boosters et collections : tous les contrôles sont passés.')
process.exit(0)

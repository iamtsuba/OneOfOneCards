// Page Boosters : étagère de jusqu'à 3 boosters (le booster du stock gratuit + les autres boosters en stock), choix d'un paquet, ouverture du bon booster.
//   node tests/pack-shelf.test.mjs
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
const opened = []   // ouvertures demandées au serveur
let openDelay = 0    // temps de réponse simulé du serveur (ms)
globalThis.fetch = async (url, init) => {
  const u = String(url)
  const body = init?.body ? JSON.parse(init.body) : {}
  if (u.includes('open_gold_reward')) { opened.push(['gold', body.p_id]); return json({ message: 'ouverture simulée' }, 400) }
  if (u.includes('open_booster_of_type')) { opened.push(['type', body.p_type]); if (openDelay) await new Promise((r) => setTimeout(r, openDelay)); return json({ message: 'ouverture simulée' }, 400) }
  if (u.includes('open_booster')) { opened.push(['main']); if (openDelay) await new Promise((r) => setTimeout(r, openDelay)); return json({ message: 'ouverture simulée' }, 400) }
  return json([])
}

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-shelf-'))
await build({
  stdin: { contents: "export { default as Boosters, PackShelf, SHELF_MAX, OPEN_TIMING, withTimeout } from './src/components/Boosters.jsx'; export { GameContext } from './src/game.js'", resolveDir: root, loader: 'js' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile: path.join(out, 'bundle.mjs'),
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) }, logLevel: 'silent',
})
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { createRoot } = require('react-dom/client')
const { act, useState } = React
const { Boosters, PackShelf, SHELF_MAX, OPEN_TIMING, withTimeout, GameContext } = await import(pathToFileURL(path.join(out, 'bundle.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
const text = (h) => h.textContent.replace(/\s+/g, ' ')
const title = (h) => (h.querySelector('.pack-name')?.textContent ?? '').trim()          // « Booster », « Booster Silver »…
const coll = (h) => (h.querySelector('.pack-collection')?.textContent ?? '').trim()    // la collection sous le titre
const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(15) } return fn() }

const silver = { id: 21, name: 'Silver', cards: 5, color: '#c0c0c0', glow: 'silver', price: 50, quantity: 2 }
const art = { id: 22, name: 'Art Rare assuré', cards: 5, color: '#f59e0b', glow: 'purple', price: null, quantity: 1 }
const legende = { id: 23, name: 'Légende', cards: 3, color: '#111111', glow: 'rainbow', price: 80, quantity: 4 }
const forSale = { id: 24, name: 'Bronze', cards: 2, color: '#b45309', glow: 'none', price: 20, quantity: 0 }
const base = { id: 'u1', username: 'Tsuba', boosters: 10, bonus_boosters: 0, coins: 500, coins_locked: 0, gold_rewards: [], max_boosters: 10, regen_minutes: 10, regen_amount: 10,
  active_category_id: 5, next_refill_at: null, cards_taken: 10, total_cards: 100, cgv_version: 3, shop_enabled: false, booster_types: [], standard_booster: { id: 1, name: 'Standard', glow: 'none', color: '#e8452e' }, server_now: new Date().toISOString(),
  subscription: { enabled: false, active: false } }
const catalog = { categoryMap: { 5: { id: 5, name: 'Chattrapez les tous !', color: '#f59e0b', color2: '#c2410c', text_color: '#fff', image: '🐱' } }, typeMap: { 21: { id: 21, category_id: 5, name: 'CHAT’PELLE', image: '🐱' }, 22: { id: 22, category_id: 5, name: 'CHAT’LET', image: '🐱' } }, types: [], rarities: [], cardRef: () => '', numberHidden: () => false }

let setExternal = () => {}
async function mountPage(initial) {
  const host = document.createElement('div'); document.body.appendChild(host)
  const reactRoot = createRoot(host)
  function Harness() {
    const [status, setStatus] = useState(initial)
    setExternal = setStatus
    return React.createElement(GameContext.Provider, { value: { status, setStatus, refreshStatus: async () => status, rarityMap: {}, catalog, setRevealing: () => {} } }, React.createElement(Boosters, { goCollection: () => {} }))
  }
  await act(async () => { reactRoot.render(React.createElement(Harness)) })
  await wait(50)
  return { host, unmount: async () => { await act(async () => reactRoot.unmount()); host.remove() } }
}
const bands = (h) => [...h.querySelectorAll('.pack-shelf .pack-band')].map((b) => b.textContent)
const counts = (h) => [...h.querySelectorAll('.pack-shelf .shelf-count')].map((b) => b.textContent)
const pressed = (h) => [...h.querySelectorAll('.pack-shelf .shelf-pack')].map((b) => b.getAttribute('aria-pressed') === 'true')
const btn = (h, re) => [...h.querySelectorAll('button')].find((b) => re.test(b.textContent))
const click = async (el) => { await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) }) }

// ---------- le composant ----------
const sp = (props) => renderToStaticMarkup(React.createElement(PackShelf, { category: catalog.categoryMap[5], selected: 'main', onSelect: () => {}, ...props }))
ok('étagère : 3 boosters au plus', SHELF_MAX === 3)
ok('étagère : avec 0 ou 1 paquet, rien (la page garde son grand paquet)', sp({ packs: [] }) === '' && sp({ packs: [{ key: 'main', name: 'Standard', glow: 'none', count: 3 }] }) === '')
const three = sp({ packs: [{ key: 'main', name: 'Standard', glow: 'none', count: 10 }, { key: 't21', name: 'Silver', glow: 'silver', count: 2 }, { key: 't22', name: 'Art Rare assuré', glow: 'purple', count: 1 }] })
ok('étagère : 3 paquets, chacun avec son nom sur la bande, son halo, son stock (×10, ×2, ×1) et un libellé lisible aux lecteurs d\'écran', (three.match(/class="shelf-pack/g) || []).length === 3 && /Silver<\/text>/.test(three) && /Art Rare assuré<\/text>/.test(three) && /glow-silver/.test(three) && /glow-purple/.test(three) && /×10/.test(three) && /×2/.test(three) && /×1/.test(three) && /aria-label="Booster Silver, 2 en stock"/.test(three))
ok('étagère : la bande de chaque paquet prend la couleur de SON booster (Standard rouge, Silver argenté, Art Rare assuré orange)', (() => { const h = sp({ packs: [{ key: 'main', name: 'Standard', glow: 'none', color: '#e8452e', count: 10 }, { key: 't21', name: 'Silver', glow: 'silver', color: '#c0c0c0', count: 2 }, { key: 't22', name: 'Art Rare assuré', glow: 'purple', color: '#f59e0b', count: 1 }] }); return ['#e8452e', '#c0c0c0', '#f59e0b'].every((c) => h.includes(`--pk-band:${c}`)) })())
ok('étagère : le paquet choisi est marqué (aria-pressed) et seul lui', /class="shelf-pack on" aria-pressed="true"/.test(three) && (three.match(/aria-pressed="true"/g) || []).length === 1)
ok('étagère : un paquet vide est éteint (sans halo), les boutons sont désactivés quand une ouverture est en cours', !/glow-gold/.test(sp({ packs: [{ key: 'main', name: 'Standard', glow: 'gold', count: 0 }, { key: 't21', name: 'Silver', glow: 'none', count: 2 }] })) && /dim/.test(sp({ packs: [{ key: 'main', name: 'Standard', glow: 'none', count: 0 }, { key: 't21', name: 'Silver', glow: 'none', count: 2 }] })) && (sp({ packs: [{ key: 'main', name: 'S', glow: 'none', count: 1 }, { key: 't1', name: 'T', glow: 'none', count: 1 }], disabled: true }).match(/disabled=""/g) || []).length === 2)

// ---------- la page ----------
{
  const m = await mountPage(base)
  ok('la bande du grand paquet prend la couleur du booster du stock gratuit', /--pk-band:\s*#e8452e/.test(m.host.querySelector('.pack-button .pack-wrap')?.getAttribute('style') ?? ''))
  ok('un seul booster (rien d\'autre en stock) : le grand paquet comme avant, pas d\'étagère, bouton « Ouvrir un booster »', !m.host.querySelector('.pack-shelf') && !!m.host.querySelector('.pack-button') && !!btn(m.host, /^Ouvrir un booster$/) && /10 boosters prêts/.test(text(m.host)))
  await m.unmount()
}
{
  const m = await mountPage({ ...base, booster_types: [silver, art, forSale] })
  ok('Standard + 2 autres boosters en stock : 3 paquets côte à côte, avec leur nom sur la bande et leur stock', bands(m.host).join('|') === 'Standard|Silver|Art Rare assuré' && counts(m.host).join('|') === '×10|×2|×1' && !m.host.querySelector('.pack-button'))
  ok('les halos de chaque booster : aucun, argenté, violet', ['', 'glow-silver', 'glow-purple'].every((c, i) => (c ? m.host.querySelectorAll('.pack-shelf .pack-wrap')[i].className.includes(c) : !m.host.querySelectorAll('.pack-shelf .pack-wrap')[i].className.includes('glow'))))
  ok('par défaut le booster du stock gratuit est choisi : « Ouvrir un booster », 10 boosters prêts', pressed(m.host).join() === 'true,false,false' && !!btn(m.host, /^Ouvrir un booster$/) && /10 boosters prêts/.test(text(m.host)) && title(m.host) === 'Booster' && coll(m.host) === 'Chattrapez les tous !')
  ok('« Autres boosters » ne répète pas les paquets déjà visibles ; il garde ceux qui sont à acheter (Bronze)', (() => { const list = m.host.querySelector('.extra-boosters'); return !!list && /Bronze/.test(list.textContent) && !/Silver|Art Rare assuré/.test(list.textContent) })())
  await click(m.host.querySelectorAll('.pack-shelf .shelf-pack')[1])
  ok('toucher le paquet Silver le choisit : titre « Booster Silver » sur la collection, 2 boosters prêts, 5 cartes, bouton « Ouvrir un booster Silver »', pressed(m.host).join() === 'false,true,false' && title(m.host) === 'Booster Silver' && coll(m.host) === 'Chattrapez les tous !' && /2 boosters prêts/.test(text(m.host)) && /5 cartes/.test(text(m.host)) && !!btn(m.host, /^Ouvrir un booster Silver$/))
  opened.length = 0
  await click(btn(m.host, /^Ouvrir un booster Silver$/)); await wait(30)
  ok('« Ouvrir un booster Silver » ouvre bien un Silver (booster de stock n°21), pas le Standard', opened.length === 1 && opened[0][0] === 'type' && opened[0][1] === 21)
  await wait(900)
  await click(m.host.querySelectorAll('.pack-shelf .shelf-pack')[2])
  ok('toucher « Art Rare assuré » : 1 booster prêt (singulier), bouton adapté', pressed(m.host).join() === 'false,false,true' && /1 booster prêt/.test(text(m.host)) && !!btn(m.host, /^Ouvrir un booster Art Rare assuré$/))
  await click(m.host.querySelectorAll('.pack-shelf .shelf-pack')[0])
  opened.length = 0
  await click(btn(m.host, /^Ouvrir un booster$/)); await wait(30)
  ok('revenir au premier paquet : « Ouvrir un booster » ouvre le booster du stock gratuit', opened.length === 1 && opened[0][0] === 'main')
  await m.unmount()
}
{
  const m = await mountPage({ ...base, booster_types: [silver, art, legende, forSale] })
  ok('plus de 2 autres boosters en stock : 3 paquets visibles au plus (Standard, Silver, Art Rare assuré)', bands(m.host).join('|') === 'Standard|Silver|Art Rare assuré' && m.host.querySelectorAll('.pack-shelf .shelf-pack').length === 3)
  ok('le 4e (Légende, 4 en stock) n\'est pas perdu : il est dans « Autres boosters », avec son bouton Ouvrir', (() => { const list = m.host.querySelector('.extra-boosters'); return /Légende/.test(list.textContent) && !!list.querySelector('button[aria-label="Ouvrir un booster Légende"]') })())
  await m.unmount()
}
{
  const m = await mountPage({ ...base, boosters: 0, bonus_boosters: 0, booster_types: [silver] })
  ok('stock gratuit vide mais un Silver en stock : le Silver est choisi d\'office, le paquet vide est éteint, le bouton ouvre le Silver', pressed(m.host).join() === 'false,true' && m.host.querySelectorAll('.pack-shelf .pack-wrap')[0].className.includes('dim') && !!btn(m.host, /^Ouvrir un booster Silver$/) && btn(m.host, /^Ouvrir un booster Silver$/).disabled === false)
  await m.unmount()
  const m2 = await mountPage({ ...base, boosters: 0, bonus_boosters: 0, booster_types: [] })
  ok('plus rien en stock : un seul paquet éteint, bouton d\'ouverture désactivé, « Aucun booster pour le moment »', !m2.host.querySelector('.pack-shelf') && btn(m2.host, /^Ouvrir un booster$/).disabled === true && /Aucun booster pour le moment/.test(text(m2.host)))
  await m2.unmount()
}
{
  const member = { ...base, standard_booster: { id: 9, name: 'OneMore', glow: 'gold' }, subscription: { enabled: true, active: true, name: 'OneMore', booster_name: 'OneMore' }, booster_types: [silver] }
  const m = await mountPage(member)
  ok('membre Pro : son paquet « OneMore » avec halo doré est le premier de l\'étagère, choisi par défaut ; bouton « Ouvrir un booster OneMore »', bands(m.host)[0] === 'OneMore' && m.host.querySelectorAll('.pack-shelf .pack-wrap')[0].className.includes('glow-gold') && pressed(m.host)[0] === true && !!btn(m.host, /^Ouvrir un booster OneMore$/) && title(m.host) === 'Booster OneMore' && coll(m.host) === 'Chattrapez les tous !')
  await m.unmount()
}
{
  const m = await mountPage({ ...base, booster_types: [silver] })
  await click(m.host.querySelectorAll('.pack-shelf .shelf-pack')[1])
  await act(async () => { setExternal({ ...base, booster_types: [{ ...silver, quantity: 0 }] }) })
  ok('le booster choisi vient d\'être ouvert (plus aucun en stock) : retour automatique au premier paquet, plus d\'étagère', !m.host.querySelector('.pack-shelf') && !!btn(m.host, /^Ouvrir un booster$/) && !/Booster Silver/.test(text(m.host)))
  await m.unmount()
}

// ---------- booster Gold gagné : dans l'étagère, juste à côté du Standard ----------
{
  const reward = { name: 'Gold', glow: 'gold', color: '#d4af37', cards: 5 }
  const gold1 = { ...base, reward_booster: reward, gold_rewards: [{ id: 5, type_id: 21 }] }
  const m = await mountPage(gold1)
  const packs = () => [...m.host.querySelectorAll('.shelf-pack')]
  ok('un booster Gold gagné : l\'étagère affiche DEUX paquets, le Standard puis le Gold juste à côté', packs().length === 2 && /Standard/.test(packs()[0].getAttribute('aria-label')) && /Gold/.test(packs()[1].getAttribute('aria-label')))
  ok('le paquet Gold porte son nom sur la bande, sa palette dorée et sa pastille ×1', /class="pack-wrap[^"]*golden/.test(packs()[1].innerHTML) && />Gold</.test(packs()[1].innerHTML) && /×1/.test(packs()[1].textContent))
  ok('le Standard reste choisi au départ (gros bouton « Ouvrir un booster »), le bloc « Un booster Gold à ouvrir » n\'existe plus', packs()[0].getAttribute('aria-pressed') === 'true' && btn(m.host, /^Ouvrir un booster/).textContent === 'Ouvrir un booster' && !m.host.querySelector('.gold-rewards') && !/Un booster Gold à ouvrir/.test(text(m.host)))
  await click(packs()[1])
  ok('toucher le paquet Gold le choisit : titre « Booster Gold » sur la collection « Chattrapez les tous ! », « 1 booster Gold prêt · gagné avec CHAT’PELLE », bouton « Ouvrir un booster Gold »', packs()[1].getAttribute('aria-pressed') === 'true' && title(m.host) === 'Booster Gold' && coll(m.host) === 'Chattrapez les tous !' && /1 booster Gold prêt/.test(text(m.host)) && /gagné avec CHAT’PELLE/.test(text(m.host)) && !!btn(m.host, /^Ouvrir un booster Gold$/))
  opened.length = 0
  await click(btn(m.host, /^Ouvrir un booster Gold$/)); await wait(60)
  ok('« Ouvrir un booster Gold » demande au serveur d\'ouvrir CETTE récompense (identifiant 5), pas un booster ordinaire', opened.length === 1 && opened[0][0] === 'gold' && opened[0][1] === 5)
  await m.unmount()
}
{
  const reward = { name: 'Gold', glow: 'gold', color: '#d4af37', cards: 5 }
  const m = await mountPage({ ...base, reward_booster: reward, gold_rewards: [{ id: 5, type_id: 21 }, { id: 9, type_id: 22 }] })
  const packs = () => [...m.host.querySelectorAll('.shelf-pack')]
  await click(packs()[1])
  ok('deux boosters Gold : pastille ×2, « 2 boosters Gold prêts · gagné avec CHAT’PELLE (puis les suivants) » ; on ouvre d\'abord le plus ancien (5)', /×2/.test(packs()[1].textContent) && /2 boosters Gold prêts/.test(text(m.host)) && /gagné avec CHAT’PELLE \(puis les suivants\)/.test(text(m.host)) && await (async () => { opened.length = 0; await click(btn(m.host, /^Ouvrir un booster Gold$/)); await wait(60); return opened[0]?.[1] === 5 })())
  await m.unmount()
}
{
  const reward = { name: 'Gold', glow: 'gold', color: '#d4af37', cards: 5 }
  const silver = { id: 21, name: 'Silver', cards: 5, color: '#c0c0c0', glow: 'silver', price: 50, quantity: 2 }
  const art = { id: 22, name: 'Art Rare assuré', cards: 5, color: '#f59e0b', glow: 'purple', price: null, quantity: 1 }
  const m = await mountPage({ ...base, reward_booster: reward, gold_rewards: [{ id: 5, type_id: 21 }], booster_types: [silver, art] })
  const packs = () => [...m.host.querySelectorAll('.shelf-pack')]
  ok('Standard + Gold + deux autres boosters en stock : l\'étagère reste à 3 paquets, le Gold garde sa place juste après le Standard, le dernier autre booster passe dans « Autres boosters »', packs().length === 3 && /Gold/.test(packs()[1].getAttribute('aria-label')) && /Silver/.test(packs()[2].getAttribute('aria-label')) && /Art Rare assuré/.test(text(m.host.querySelector('.extra-boosters') ?? document.body)))
  await m.unmount()
}
{
  const reward = { name: 'Gold', glow: 'gold', color: '#d4af37', cards: 5 }
  const m = await mountPage({ ...base, boosters: 0, bonus_boosters: 0, reward_booster: reward, gold_rewards: [{ id: 5, type_id: 21 }] })
  const packs = () => [...m.host.querySelectorAll('.shelf-pack')]
  ok('plus aucun booster ordinaire mais un Gold : le Gold est choisi automatiquement et s\'ouvre directement', packs()[1].getAttribute('aria-pressed') === 'true' && btn(m.host, /^Ouvrir un booster Gold$/)?.disabled === false)
  await m.unmount()
}
{
  const m = await mountPage({ ...base, gold_rewards: [] })
  ok('sans booster Gold : rien ne change (un seul grand paquet)', !m.host.querySelector('.pack-shelf') && !!m.host.querySelector('.pack-button'))
  await m.unmount()
}

// ---------- ordre d'affichage réglé dans l'admin ----------
{
  const bt = (id, name, position, quantity) => ({ id, name, position, cards: 5, color: '#c0c0c0', glow: 'none', price: 50, quantity })
  const silver = bt(21, 'Silver', 1, 2), art = bt(22, 'Art Rare assuré', 2, 1), bronze = bt(23, 'Bronze', 5, 1)
  const std = (position) => ({ id: 1, name: 'Standard', glow: 'none', color: '#e8452e', position })
  const names = (m) => [...m.host.querySelectorAll('.shelf-pack')].map((p) => p.getAttribute('aria-label').split(',')[0].replace(/^Booster /, ''))
  const run = async (status) => { const m = await mountPage(status); const n = names(m); const extra = text(m.host.querySelector('.extra-boosters') ?? document.body); await m.unmount(); return { n, extra } }

  let r = await run({ ...base, standard_booster: std(3), booster_types: [silver, art] })
  ok('l\'ordre réglé dans l\'admin décide de la place de chaque paquet : Silver (1), Art Rare assuré (2), puis le Standard (3)', r.n.join('|') === 'Silver|Art Rare assuré|Standard')
  r = await run({ ...base, standard_booster: std(3), booster_types: [silver, art, bronze] })
  ok('4 boosters candidats : le Standard est toujours montré, puis les mieux classés ; le dernier passe dans « Autres boosters » (Bronze n° 5)', r.n.join('|') === 'Silver|Art Rare assuré|Standard' && /Bronze/.test(r.extra))
  r = await run({ ...base, standard_booster: std(1), booster_types: [{ ...silver, position: 7 }, { ...art, position: 8 }, bronze] })
  ok('le Standard en premier (n° 1) : puis Bronze (5) et Silver (7) ; Art Rare assuré (8) reste dans « Autres boosters »', r.n.join('|') === 'Standard|Bronze|Silver' && /Art Rare assuré/.test(r.extra))
  r = await run({ ...base, standard_booster: std(9), booster_types: [silver, art, bronze] })
  ok('le Standard en dernier (n° 9) est quand même montré (on ne peut pas perdre son stock gratuit de vue)', r.n.includes('Standard') && r.n.length === 3 && r.n[r.n.length - 1] === 'Standard')
  r = await run({ ...base, standard_booster: std(3), reward_booster: { name: 'Gold', glow: 'gold', color: '#d4af37', cards: 5, id: 40, position: 2 }, gold_rewards: [{ id: 5, type_id: 21 }], booster_types: [silver] })
  ok('le booster Gold gagné a son rang aussi : Silver (1), Gold (2), Standard (3)', r.n.join('|') === 'Silver|Gold|Standard')
  r = await run({ ...base, standard_booster: std(3), reward_booster: { name: 'Gold', glow: 'gold', color: '#d4af37', cards: 5, id: 40, position: 7 }, gold_rewards: [{ id: 5, type_id: 21 }], booster_types: [silver, art] })
  ok('Gold mal classé (n° 7) face à deux boosters mieux classés : il laisse sa place à Silver et Art Rare assuré', r.n.join('|') === 'Silver|Art Rare assuré|Standard' && !r.n.includes('Gold'))
  r = await run({ ...base, standard_booster: std(undefined), booster_types: [{ ...silver, position: undefined }, { ...art, position: undefined }] })
  ok('serveur de la version précédente (sans ordre) : l\'ordre d\'avant (Standard, puis les boosters dans l\'ordre reçu), sans plantage', r.n.join('|') === 'Standard|Silver|Art Rare assuré')
  {
    const m = await mountPage({ ...base, standard_booster: std(3), booster_types: [silver, art] })
    ok('choix par défaut inchangé : le Standard (stock gratuit) est choisi même s\'il n\'est pas en tête', m.host.querySelectorAll('.shelf-pack')[2].getAttribute('aria-pressed') === 'true' && m.host.querySelectorAll('.shelf-pack')[0].getAttribute('aria-pressed') === 'false')
    await m.unmount()
  }
}

// ---------- limite d'attente de l'ouverture : plus de paquet figé ----------
{
  let unhandled = 0
  process.on('unhandledRejection', () => { unhandled++ })
  ok('withTimeout : une réponse rapide passe telle quelle, aucune erreur tardive', (await withTimeout(Promise.resolve(42), 50)) === 42 && (await new Promise((r) => setTimeout(() => r(unhandled === 0), 120))))
  ok('withTimeout : une réponse trop lente donne « open_timeout » ; une vraie erreur du serveur reste elle-même', await withTimeout(new Promise((r) => setTimeout(r, 200)), 40).then(() => '', (e) => e.message) === 'open_timeout' && await withTimeout(Promise.reject(new Error('pool_empty')), 40).then(() => '', (e) => e.message) === 'pool_empty')
  ok('la limite par défaut est généreuse (25 secondes) pour ne pas couper une ouverture lente mais normale', OPEN_TIMING.timeout === 25000)
  OPEN_TIMING.timeout = 250
  const m = await mountPage(base)
  openDelay = 800   // le serveur répond, mais bien trop tard
  opened.length = 0
  await click(btn(m.host, /^Ouvrir un booster$/))
  ok('ouverture lancée : le paquet tremble (écran d\'ouverture affiché)', !!document.querySelector('.overlay'))
  await wait(120)
  ok('toujours en attente avant la limite : l\'écran d\'ouverture reste (pas de fermeture prématurée)', !!document.querySelector('.overlay'))
  await until(() => !document.querySelector('.overlay'))
  ok('passé la limite : l\'écran d\'ouverture se ferme, un message clair s\'affiche (« prend trop de temps »)', !document.querySelector('.overlay') && /L’ouverture prend trop de temps/.test(text(m.host)))
  ok('le bouton d\'ouverture est de nouveau utilisable (on peut réessayer)', btn(m.host, /^Ouvrir un booster$/).disabled === false)
  await wait(900)   // la réponse tardive du serveur arrive : elle ne rouvre rien
  ok('la réponse tardive du serveur ne ressuscite pas l\'écran d\'ouverture', !document.querySelector('.overlay') && opened.length === 1)
  openDelay = 0
  opened.length = 0
  await click(btn(m.host, /^Ouvrir un booster$/)); await wait(60)
  ok('une ouverture rapide qui échoue côté serveur : fermeture immédiate et message d\'erreur (comportement inchangé)', !document.querySelector('.overlay') && opened.length === 1)
  OPEN_TIMING.timeout = 25000
  await m.unmount()
}

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nÉtagère de boosters : tous les contrôles sont passés.')
process.exit(0)

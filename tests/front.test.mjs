// Teste le front de chaque environnement : préfixes des appels à la base, nom de l'application, bandeau de préproduction.
//   node tests/front.test.mjs
// Charge le code source avec chaque mode Vite (prod / preprod), sans navigateur (jsdom) et sans réseau (fetch simulé).
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import { JSDOM } from 'jsdom'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://1o1cards.cc/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })

const calls = []
globalThis.fetch = async (url) => {
  calls.push(String(url))
  return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const h = React.createElement

const CASES = [
  { mode: 'prod', prefix: 'o1ocards_', fn: 'o1ocards-checkout', auth: 'o1ocards-auth', banner: false, title: '1/1 Cards' },
  { mode: 'preprod', prefix: 'pp_o1ocards_', fn: 'pp-o1ocards-checkout', auth: 'pp-o1ocards-auth', banner: true, title: '1/1 Cards (préprod)' },
]

for (const c of CASES) {
  console.log(`--- ${c.mode}`)
  const server = await createServer({ root, mode: c.mode, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const env = await server.ssrLoadModule('/src/env.js')
    ok(`[${c.mode}] préfixe ${c.prefix}, fonction ${c.fn}, session ${c.auth}`, env.PREFIX === c.prefix && env.CHECKOUT_FUNCTION === c.fn && env.AUTH_STORAGE_KEY === c.auth)
    ok(`[${c.mode}] environnement ${c.mode} reconnu`, env.IS_PREPROD === (c.mode === 'preprod') && env.APP_NAME === '1/1 Cards')

    const api = await server.ssrLoadModule('/src/api.js')
    calls.length = 0
    await api.getStatus(); await api.openBooster(); await api.listCollection({ category: 1 }); await api.marketList(); await api.getOdds(1)
    await api.adminData('x').catch(() => {}); await api.getRarities(); await api.getCatalog(); await api.getLegal()
    await api.startCheckout({ cgv: true, withdrawal: true, version: 3 }).catch(() => {})
    const rpcs = calls.filter((u) => u.includes('/rpc/'))
    const rest = calls.filter((u) => u.includes('/rest/v1/') && !u.includes('/rpc/'))
    ok(`[${c.mode}] les ${rpcs.length} appels de fonctions SQL commencent par ${c.prefix}`, rpcs.length >= 6 && rpcs.every((u) => u.split('/rpc/')[1].startsWith(c.prefix)))
    ok(`[${c.mode}] les ${rest.length} lectures de tables commencent par ${c.prefix}`, rest.length >= 5 && rest.every((u) => u.split('/rest/v1/')[1].startsWith(c.prefix)))
    ok(`[${c.mode}] aucun appel vers l'autre environnement`, calls.every((u) => (c.mode === 'prod' ? !u.includes('pp_o1ocards_') && !u.includes('pp-o1ocards') : !/\/(rpc\/|v1\/)o1ocards[_-]/.test(u))))
    ok(`[${c.mode}] le paiement appelle la fonction ${c.fn}`, calls.some((u) => u.includes(`/functions/v1/${c.fn}`)))
    ok(`[${c.mode}] aucune trace de l'ancien préfixe opennumber_`, !calls.some((u) => u.includes('opennumber')))

    const Brand = (await server.ssrLoadModule('/src/components/Brand.jsx')).default
    const Banner = (await server.ssrLoadModule('/src/components/EnvBanner.jsx')).default
    const Pack = (await server.ssrLoadModule('/src/components/Pack.jsx')).default
    ok(`[${c.mode}] le logo affiche « 1/1 Cards »`, renderToStaticMarkup(h(Brand)).includes('1/1 Cards'))
    const banner = renderToStaticMarkup(h(Banner))
    ok(`[${c.mode}] bandeau « Préproduction » ${c.banner ? 'affiché' : 'absent'}`, c.banner ? banner.includes('Préproduction') : banner === '')
    ok(`[${c.mode}] le booster porte le nom 1/1 Cards`, renderToStaticMarkup(h(Pack, {})).includes('1/1 Cards'))
  } finally {
    await server.close()
  }
}

// --- sites compilés (si présents) : titre, référencement, et aucun résidu de l'ancien nom
for (const c of CASES) {
  const dir = path.join(root, 'dist', c.mode)
  if (!fs.existsSync(path.join(dir, 'index.html'))) { console.log(`(dist/${c.mode} absent : lance npm run build:${c.mode} pour contrôler le site compilé)`); continue }
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
  const bundle = fs.readdirSync(path.join(dir, 'assets')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(dir, 'assets', f), 'utf8')).join('\n')
  ok(`[dist/${c.mode}] titre « ${c.title} » et référencement ${c.banner ? 'bloqué (noindex)' : 'autorisé'}`, html.includes(`<title>${c.title}</title>`) && html.includes(c.banner ? 'noindex' : 'index,follow'))
  ok(`[dist/${c.mode}] aucune trace de « opennumber » ni « OneOfOne » dans le site compilé`, !/opennumber|OneOfOne/i.test(html + bundle))
  ok(`[dist/${c.mode}] contient son préfixe ${c.prefix}`, bundle.includes(`"${c.prefix}"`))
}

console.log(bad ? `\n${bad} ÉCHEC(S)` : '\nFront : tous les contrôles sont passés.')
process.exit(bad ? 1 : 0)

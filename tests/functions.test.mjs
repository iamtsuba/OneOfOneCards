// Teste les fonctions Edge de paiement et de webhook de chaque environnement avec un faux Supabase et un faux Stripe.
//   node tests/functions.test.mjs [prod|preprod]      (défaut : les deux)
// Prérequis : Deno ('deno' dans le PATH, ou npm i --no-save deno).
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const ROOT = path.join(root, 'supabase', 'functions')
const DENO = [process.env.DENO, path.join(root, 'node_modules/.bin/deno'), '/tmp/denoenv/node_modules/.bin/deno'].find((p) => p && fs.existsSync(p)) || 'deno'
const ENVS = [
  { name: 'prod', dir: 'o1ocards', prefix: 'o1ocards_', sp: '', site: 'https://1o1cards.cc/', whsec: 'whsec_prod', otherWhsec: 'whsec_preprod', port: 8801, mockPort: 8899 },
  { name: 'preprod', dir: 'pp-o1ocards', prefix: 'pp_o1ocards_', sp: 'PP_', site: 'https://pp.1o1cards.cc/', whsec: 'whsec_preprod', otherWhsec: 'whsec_prod', port: 8821, mockPort: 8898 },
].filter((e) => !process.argv[2] || e.name === process.argv[2])

let totalBad = 0
const waitUp = async (port) => { for (let i = 0; i < 160; i++) { try { await fetch(`http://127.0.0.1:${port}/`, { method: 'OPTIONS' }); return } catch { await new Promise((r) => setTimeout(r, 500)) } } throw new Error('fonction non démarrée ' + port) }

async function runEnv(E) {
  const state = { cfg: { shop_enabled: 1, stripe_pack_boosters: 10, stripe_pack_price_cents: 199, cgv_version: 1 }, legal: { seller_name: 'Thomas Test', seller_address: '1 rue du Test, 69000 Lyon', seller_email: 'contact@example.com', consent_cgv_text: 'CGV OK', consent_withdrawal_text: 'Je renonce' }, consents: [], consentFail: false, rpcCalls: [], paths: [], stripeCalls: [], seen: new Set(), stripeFail: false, rpcFail: false }

  // ---- faux Supabase + faux Stripe
  const mock = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      if (req.url.startsWith('/rest/v1/')) state.paths.push(req.url.split('?')[0])
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) }
      if (req.url.startsWith('/auth/v1/user')) {
        if (req.headers.authorization === 'Bearer good-token')
          return send(200, { id: 'aaaaaaaa-1111-2222-3333-444444444444', email: 'thomas@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() })
        return send(401, { msg: 'invalid JWT' })
      }
      if (req.url.startsWith(`/rest/v1/${E.prefix}config`)) return send(200, Object.entries(state.cfg).map(([key, value]) => ({ key, value })))
      if (req.url.startsWith(`/rest/v1/${E.prefix}legal`)) return send(200, Object.entries(state.legal).map(([key, value]) => ({ key, value })))
      if (req.url.startsWith(`/rest/v1/${E.prefix}consents`)) {
        if (state.consentFail) return send(500, { message: 'insert failed' })
        state.consents.push({ ...JSON.parse(body), ip_header: req.headers['x-forwarded-for'] })
        return send(201, {})
      }
      if (req.url.startsWith(`/rest/v1/rpc/${E.prefix}credit_purchase`)) {
        const b = JSON.parse(body)
        state.rpcCalls.push(b)
        if (state.rpcFail) return send(500, { message: 'boom' })
        const first = !state.seen.has(b.p_session_id)
        state.seen.add(b.p_session_id)
        return send(200, first)
      }
      if (req.url.startsWith('/v1/checkout/sessions')) {
        state.stripeCalls.push({ auth: req.headers.authorization, form: Object.fromEntries(new URLSearchParams(body)) })
        if (state.stripeFail) return send(400, { error: { message: 'invalid' } })
        return send(200, { id: 'cs_test_abc', url: 'https://checkout.stripe.test/c/pay/cs_test_abc' })
      }
      send(404, { error: 'unknown ' + req.url })
    })
  })
  await new Promise((r) => mock.listen(E.mockPort, r))

  const baseEnv = { ...process.env, SUPABASE_URL: `http://127.0.0.1:${E.mockPort}`, SUPABASE_SERVICE_ROLE_KEY: 'service-key', [E.sp + 'STRIPE_SECRET_KEY']: 'sk_test_fake', [E.sp + 'STRIPE_API_BASE']: `http://127.0.0.1:${E.mockPort}`, [E.sp + 'SITE_URL']: E.site, [E.sp + 'STRIPE_WEBHOOK_SECRET']: E.whsec }
  const start = (name, port, extra = {}, drop = []) => {
    const env = { ...baseEnv, ...extra }
    for (const k of drop) delete env[k]
    const p = spawn(DENO, ['run', '-A', `${ROOT}/${name}/index.ts`], { env: { ...env, DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}` }, stdio: ['ignore', 'pipe', 'pipe'] })
    p.stderr.on('data', (d) => { const s = d.toString(); if (!/Listening|Download|Check/.test(s)) process.stderr.write(`[${name}] ${s}`) })
    return p
  }
  const ck = `${E.dir}-checkout`
  const procs = [
    start(ck, E.port), start(`${E.dir}-stripe-webhook`, E.port + 1),
    start(ck, E.port + 2, { [E.sp + 'STRIPE_MANAGED_PAYMENTS']: 'false', [E.sp + 'STRIPE_TAX_CODE']: 'txcd_10201000_custom' }),
    start(ck, E.port + 3, { [E.sp + 'STRIPE_SECRET_KEY']: 'sk_live_fake' }),
    // clé Stripe présente uniquement sous le préfixe de l'AUTRE environnement : ne doit jamais servir
    start(ck, E.port + 4, E.sp ? { STRIPE_SECRET_KEY: 'sk_live_prod_key' } : { PP_STRIPE_SECRET_KEY: 'sk_test_preprod_key' }, [E.sp + 'STRIPE_SECRET_KEY']),
    // réglage non sensible défini seulement sur l'autre jeu de noms
    start(ck, E.port + 5, E.sp ? { STRIPE_TAX_CODE: 'txcd_fallback' } : { PP_STRIPE_TAX_CODE: 'txcd_pp_only' }),
  ]
  for (let i = 0; i <= 5; i++) await waitUp(E.port + i)

  let bad = 0
  const ok = (name, cond, extra = '') => { console.log(cond ? 'OK  ' : 'FAIL', name, cond ? '' : extra); if (!cond) bad++ }
  const CO = `http://127.0.0.1:${E.port}/`, WH = `http://127.0.0.1:${E.port + 1}/`
  const CONSENT = JSON.stringify({ consent: { cgv: true, withdrawal: true, version: 1 } })
  const post = (url, headers = {}, body = CONSENT) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body })
  
  console.log(`--- [${E.name}] paiement (${E.dir}-checkout)`)
  let r = await fetch(CO, { method: 'OPTIONS' })
  ok('préflight CORS', r.status === 200 && r.headers.get('access-control-allow-origin') === '*')
  r = await post(CO); ok('sans jeton -> 401', r.status === 401)
  r = await post(CO, { Authorization: 'Bearer faux' }); ok('mauvais jeton -> 401', r.status === 401)
  state.cfg.shop_enabled = 0
  r = await post(CO, { Authorization: 'Bearer good-token' }); ok('boutique désactivée -> 403', r.status === 403 && (await r.json()).error === 'shop_disabled')
  state.cfg.shop_enabled = 1
  r = await post(CO, { Authorization: 'Bearer good-token' }); let j = await r.json()
  ok('connecté + boutique ouverte -> url Stripe', r.status === 200 && j.url.includes('checkout.stripe.test'), JSON.stringify(j))
  const call = state.stripeCalls.at(-1)
  ok('clé secrète envoyée à Stripe', call.auth === 'Bearer sk_test_fake')
  ok('montant 199 centimes en EUR', call.form['line_items[0][price_data][unit_amount]'] === '199' && call.form['line_items[0][price_data][currency]'] === 'eur')
  ok('métadonnées : joueur + 10 boosters', call.form['metadata[user_id]'] === 'aaaaaaaa-1111-2222-3333-444444444444' && call.form['metadata[boosters]'] === '10')
  ok('retour vers le site avec payment=success / cancel', call.form.success_url === E.site + '?payment=success' && call.form.cancel_url.endsWith('?payment=cancel'), call.form.success_url)
  ok('code fiscal envoyé par défaut (txcd_10201000)', call.form['line_items[0][price_data][product_data][tax_code]'] === 'txcd_10201000')
  ok('Managed Payments laissé au réglage du compte par défaut', !('managed_payments[enabled]' in call.form))
  ok('email prérempli + mode paiement', call.form.customer_email === 'thomas@example.com' && call.form.mode === 'payment')
  await post(`http://127.0.0.1:${E.port + 2}/`, { Authorization: 'Bearer good-token' })
  const alt = state.stripeCalls.at(-1)
  ok('STRIPE_MANAGED_PAYMENTS=false -> managed_payments[enabled]=false', alt.form['managed_payments[enabled]'] === 'false')
  ok('STRIPE_TAX_CODE personnalisé pris en compte', alt.form['line_items[0][price_data][product_data][tax_code]'] === 'txcd_10201000_custom')
  console.log('--- consentement et conditions de vente')
  const A = { Authorization: 'Bearer good-token' }
  const n0c = state.stripeCalls.length
  r = await post(CO, A, '{}'); ok('sans consentement -> 400 consent_required', r.status === 400 && (await r.json()).error === 'consent_required')
  r = await post(CO, A, JSON.stringify({ consent: { cgv: true, withdrawal: false, version: 1 } })); ok('CGV cochées mais pas la renonciation -> 400', r.status === 400)
  r = await post(CO, A, JSON.stringify({ consent: { cgv: false, withdrawal: true, version: 1 } })); ok('renonciation cochée mais pas les CGV -> 400', r.status === 400)
  r = await post(CO, A, JSON.stringify({ consent: { cgv: 'true', withdrawal: 'true', version: 1 } })); ok('valeurs non booléennes refusées -> 400', r.status === 400)
  r = await post(CO, A, JSON.stringify({ consent: { cgv: true, withdrawal: true, version: 0 } })); ok('ancienne version des CGV -> 409 cgv_outdated', r.status === 409 && (await r.json()).error === 'cgv_outdated')
  ok('aucune session Stripe créée pour ces refus', state.stripeCalls.length === n0c)
  const nc = state.consents.length
  r = await fetch(CO, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer good-token', 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'TestAgent/1.0' }, body: CONSENT })
  ok('consentement valide -> url de paiement', r.status === 200 && !!(await r.json()).url)
  const rec = state.consents.at(-1)
  ok('preuve enregistrée (une de plus)', state.consents.length === nc + 1)
  ok('preuve : joueur, version, session Stripe', rec.user_id === 'aaaaaaaa-1111-2222-3333-444444444444' && rec.cgv_version === 1 && rec.stripe_session_id === 'cs_test_abc')
  ok('preuve : textes exacts acceptés', rec.statement === 'CGV OK\nJe renonce')
  ok('preuve : IP du joueur et navigateur', rec.ip === '203.0.113.7' && rec.user_agent === 'TestAgent/1.0')
  ok('preuve : contenu et prix de la commande', rec.boosters === 10 && rec.amount_cents === 199 && rec.currency === 'eur')
  state.consentFail = true
  r = await post(CO, A); ok('preuve non enregistrable -> pas de paiement proposé (500)', r.status === 500); state.consentFail = false
  const LIVE = `http://127.0.0.1:${E.port + 3}/`
  if (E.name === 'prod') {
    Object.assign(state.legal, { seller_address: '' })
    r = await post(LIVE, A); ok('clé live + adresse du vendeur vide -> 403 legal_incomplete', r.status === 403 && (await r.json()).error === 'legal_incomplete')
    r = await post(CO, A); ok('clé test + adresse vide : les essais restent possibles', r.status === 200)
    Object.assign(state.legal, { seller_address: '1 rue du Test, 69000 Lyon' })
    r = await post(LIVE, A); ok('clé live + infos légales complètes -> paiement', r.status === 200)
  } else {
    const n = state.stripeCalls.length
    r = await post(LIVE, A); ok('PRÉPROD : une clé Stripe live (sk_live_) est refusée (503)', r.status === 503 && state.stripeCalls.length === n)
  }
  state.cfg.stripe_pack_price_cents = 499; state.cfg.stripe_pack_boosters = 25
  await post(CO, { Authorization: 'Bearer good-token' })
  ok('prix et contenu lus dans la table de config', state.stripeCalls.at(-1).form['line_items[0][price_data][unit_amount]'] === '499' && state.stripeCalls.at(-1).form['metadata[boosters]'] === '25')
  state.cfg.stripe_pack_price_cents = 10
  r = await post(CO, { Authorization: 'Bearer good-token' }); ok('prix absurde (< 0,50 EUR) refusé', r.status === 503)
  state.cfg.stripe_pack_price_cents = 199; state.cfg.stripe_pack_boosters = 10
  state.stripeFail = true
  r = await post(CO, { Authorization: 'Bearer good-token' }); ok('refus de Stripe -> 502', r.status === 502); state.stripeFail = false
  r = await fetch(CO); ok('GET -> 405', r.status === 405)
  r = await fetch(CO, { method: 'OPTIONS', headers: { 'Access-Control-Request-Headers': 'authorization, content-type, x-nouveau-header' } })
  ok('préflight : en-têtes demandés par le navigateur acceptés', (r.headers.get('access-control-allow-headers') || '').includes('x-nouveau-header'))
  
  console.log(`--- [${E.name}] webhook (${E.dir}-stripe-webhook)`)
  const sign = (payload, t = Math.floor(Date.now() / 1000), secret = E.whsec) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`
  const event = (over = {}, type = 'checkout.session.completed') => JSON.stringify({ id: 'evt_1', type, data: { object: { id: 'cs_live_1', payment_status: 'paid', amount_total: 199, currency: 'eur', payment_intent: 'pi_9', client_reference_id: 'aaaaaaaa-1111-2222-3333-444444444444', metadata: { user_id: 'aaaaaaaa-1111-2222-3333-444444444444', boosters: '10' }, ...over } } })
  const hook = (payload, sig) => post(WH, { 'Stripe-Signature': sig }, payload)
  
  let p = event(); r = await hook(p, sign(p)); j = await r.json()
  ok('paiement valide -> boosters crédités', r.status === 200 && j.credited === true, JSON.stringify(j))
  const rc = state.rpcCalls.at(-1)
  ok(`crédit via ${E.prefix}credit_purchase : bon joueur, 10 boosters, 1,99 EUR`, rc.p_user === 'aaaaaaaa-1111-2222-3333-444444444444' && rc.p_boosters === 10 && rc.p_amount === 199 && rc.p_currency === 'eur' && rc.p_session_id === 'cs_live_1' && rc.p_payment_intent === 'pi_9')
  r = await hook(p, sign(p)); j = await r.json(); ok('même événement rejoué -> pas de double crédit', r.status === 200 && j.credited === false)
  const n0 = state.rpcCalls.length
  r = await hook(p, sign(p, undefined, 'whsec_autre')); ok('mauvaise signature -> 400', r.status === 400)
  r = await hook(p, sign(p, undefined, E.otherWhsec)); ok(`signature de l'autre environnement (${E.name === 'prod' ? 'préprod' : 'prod'}) -> 400`, r.status === 400)
  r = await hook(p, 't=1,v1=abc'); ok('signature bidon -> 400', r.status === 400)
  r = await post(WH, {}, p); ok('sans signature -> 400', r.status === 400)
  r = await hook(p, sign(p, Math.floor(Date.now() / 1000) - 3600)); ok('signature trop ancienne -> 400', r.status === 400)
  const tampered = event({ metadata: { user_id: 'bbbbbbbb-1111-2222-3333-444444444444', boosters: '1000' } })
  r = await hook(tampered, sign(p)); ok('contenu modifié après signature -> 400', r.status === 400)
  ok('aucun crédit pour toutes les requêtes refusées', state.rpcCalls.length === n0)
  p = event({ id: 'cs_unpaid', payment_status: 'unpaid' }); r = await hook(p, sign(p)); j = await r.json()
  ok('paiement non confirmé -> rien crédité', r.status === 200 && j.credited === false && state.rpcCalls.length === n0)
  p = event({ id: 'cs_async' }, 'checkout.session.async_payment_succeeded'); r = await hook(p, sign(p)); j = await r.json()
  ok('paiement asynchrone réussi -> crédité', r.status === 200 && j.credited === true)
  p = JSON.stringify({ id: 'evt_x', type: 'charge.refunded', data: { object: {} } }); r = await hook(p, sign(p)); ok('autre type d’événement -> ignoré (200)', r.status === 200)
  p = event({ id: 'cs_foreign', metadata: {}, client_reference_id: null }); const n1 = state.rpcCalls.length; r = await hook(p, sign(p)); j = await r.json()
  ok('session étrangère à l’application -> ignorée', r.status === 200 && j.ignored === true && state.rpcCalls.length === n1)
  state.rpcFail = true; p = event({ id: 'cs_fail' }); r = await hook(p, sign(p)); ok('erreur base de données -> 500 (Stripe réessaiera)', r.status === 500); state.rpcFail = false
  r = await fetch(WH); ok('GET -> 405', r.status === 405)
  console.log(`--- [${E.name}] isolation des environnements`)
  const other = E.name === 'prod' ? 'pp_o1ocards_' : 'o1ocards_'
  const wrong = state.paths.filter((p) => (E.name === 'prod' ? /\/(rpc\/)?pp_o1ocards_/.test(p) : !/\/(rpc\/)?pp_o1ocards_/.test(p)))
  ok(`toutes les requêtes base de données utilisent le préfixe ${E.prefix} (aucune vers ${other})`, state.paths.length > 5 && wrong.length === 0, JSON.stringify(wrong.slice(0, 3)))
  {
    const noPrefixed = `http://127.0.0.1:${E.port + 4}/`
    const n = state.stripeCalls.length
    r = await post(noPrefixed, A)
    if (E.name === 'preprod') ok('PRÉPROD : sans PP_STRIPE_SECRET_KEY, la clé de la production n’est JAMAIS utilisée (503)', r.status === 503 && state.stripeCalls.length === n)
    else ok('PROD : la clé PP_STRIPE_SECRET_KEY de la préprod est ignorée (503 sans STRIPE_SECRET_KEY)', r.status === 503 && state.stripeCalls.length === n)
    const taxInstance = `http://127.0.0.1:${E.port + 5}/`
    await post(taxInstance, A)
    const tc = state.stripeCalls.at(-1)?.form['line_items[0][price_data][product_data][tax_code]']
    if (E.name === 'preprod') ok('PRÉPROD : réglage non sensible (code fiscal) repris de la production s’il n’est pas défini', tc === 'txcd_fallback')
    else ok('PROD : le code fiscal de la préprod (PP_) est ignoré', tc !== 'txcd_pp_only')
    const label = state.stripeCalls.at(-1)?.form['line_items[0][price_data][product_data][name]']
    ok(`produit affiché sur la page de paiement : « ${label} »`, E.name === 'preprod' ? label === '10 boosters 1/1 Cards (test)' : label === '10 boosters 1/1 Cards')
  }

  procs.forEach((x) => x.kill()); mock.close()
  totalBad += bad
  console.log(bad ? `\n[${E.name}] ${bad} ÉCHEC(S)\n` : `\n[${E.name}] tout est OK\n`)
}

for (const E of ENVS) await runEnv(E)
console.log(totalBad ? `${totalBad} ÉCHEC(S) au total` : 'Fonctions Edge : tous les contrôles sont passés.')
process.exit(totalBad ? 1 : 0)

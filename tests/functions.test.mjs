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
  const state = { confirmSession: null, stripeGets: [], subName: 'OneMore', proMember: false, proCalls: [], revokeCalls: [], cfg: { shop_enabled: 1, stripe_pack_boosters: 10, stripe_pack_price_cents: 199, cgv_version: 1, subscription_enabled: 0, subscription_price_cents: 999 }, legal: { seller_name: 'Thomas Test', seller_address: '1 rue du Test, 69000 Lyon', seller_email: 'contact@example.com', consent_cgv_text: 'CGV OK', consent_withdrawal_text: 'Je renonce' }, consents: [], consentFail: false, rpcCalls: [], paths: [], stripeCalls: [], seen: new Set(), stripeFail: false, rpcFail: false }

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
      if (req.url.startsWith(`/rest/v1/${E.prefix}text_config`)) return send(200, [{ key: 'subscription_name', value: state.subName }])
      if (req.url.startsWith(`/rest/v1/${E.prefix}pro_members`)) return send(200, state.proMember ? [{ user_id: 'aaaaaaaa-1111-2222-3333-444444444444' }] : [])
      if (req.url.startsWith(`/rest/v1/rpc/${E.prefix}pro_grant`)) {
        const b = JSON.parse(body); state.proCalls.push(b)
        if (state.rpcFail) return send(500, { message: 'boom' })
        return send(200, { ok: true, active: true, gift_granted: true, extra_payment: !!state.extraPayment })
      }
      if (req.url.startsWith(`/rest/v1/rpc/${E.prefix}pro_revoke`)) {
        const b = JSON.parse(body); state.revokeCalls.push(b)
        if (state.rpcFail) return send(500, { message: 'boom' })
        return send(200, { revoked: 1 })
      }
      if (req.method === 'GET' && req.url.startsWith('/v1/checkout/sessions/')) {
        state.stripeGets.push({ url: req.url, auth: req.headers.authorization })
        if (!state.confirmSession) return send(404, { error: { message: 'No such checkout.session' } })
        return send(200, state.confirmSession)
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
    start(`${E.dir}-subscribe`, E.port + 6),
    start(`${E.dir}-subscribe`, E.port + 8, { [E.sp + 'STRIPE_SECRET_KEY']: 'sk_live_fake' }),
  ]
  for (const i of [0, 1, 2, 3, 4, 5, 6, 8]) await waitUp(E.port + i)

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

  console.log(`--- [${E.name}] pass Pro, achat unique (${E.dir}-subscribe)`)
  const SU = `http://127.0.0.1:${E.port + 6}/`, SULIVE = `http://127.0.0.1:${E.port + 8}/`
  const UID = 'aaaaaaaa-1111-2222-3333-444444444444'
  const SCONSENT = JSON.stringify({ consent: { cgv: true, withdrawal: true, version: 1 } })
  const subPost = (url = SU, headers = A, body = SCONSENT) => post(url, headers, body)
  r = await fetch(SU, { method: 'OPTIONS' }); ok('préflight CORS', r.status === 200 && r.headers.get('access-control-allow-origin') === '*')
  r = await subPost(SU, {}); ok('sans jeton -> 401', r.status === 401)
  r = await subPost(SU, { Authorization: 'Bearer faux' }); ok('mauvais jeton -> 401', r.status === 401)
  r = await subPost(); ok('vente fermée (réglage à 0) -> 403 subscription_disabled', r.status === 403 && (await r.json()).error === 'subscription_disabled')
  state.cfg.subscription_enabled = 1
  const n0s = state.stripeCalls.length
  r = await subPost(SU, A, '{}'); ok('sans consentement -> 400 consent_required', r.status === 400 && (await r.json()).error === 'consent_required')
  r = await subPost(SU, A, JSON.stringify({ consent: { cgv: true, withdrawal: false, version: 1 } })); ok('sans la renonciation à la rétractation -> 400', r.status === 400)
  r = await subPost(SU, A, JSON.stringify({ consent: { cgv: false, withdrawal: true, version: 1 } })); ok('sans les CGV -> 400', r.status === 400)
  r = await subPost(SU, A, JSON.stringify({ consent: { cgv: true, withdrawal: 'true', version: 1 } })); ok('valeurs non booléennes refusées -> 400', r.status === 400)
  r = await subPost(SU, A, JSON.stringify({ consent: { cgv: true, withdrawal: true, version: 0 } })); ok('ancienne version des CGV -> 409 cgv_outdated', r.status === 409 && (await r.json()).error === 'cgv_outdated')
  ok('aucune session Stripe créée pour ces refus', state.stripeCalls.length === n0s)
  ok('plus de case « renouvellement » : deux consentements suffisent (c\'est un achat unique)', (await subPost(SU, A, JSON.stringify({ consent: { cgv: true, withdrawal: true, version: 1 } }))).status === 200)
  const ncs = state.consents.length
  r = await fetch(SU, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer good-token', 'x-forwarded-for': '203.0.113.9, 10.0.0.1', 'user-agent': 'ProAgent/2.0' }, body: SCONSENT }); j = await r.json()
  ok('consentement complet -> url de paiement', r.status === 200 && j.url.includes('checkout.stripe.test'), JSON.stringify(j))
  let sc = state.stripeCalls.at(-1)
  ok('clé secrète envoyée à Stripe', sc.auth === 'Bearer sk_test_fake')
  ok('PAIEMENT UNIQUE (mode payment), 9,99 EUR du réglage, aucune récurrence ni abonnement', sc.form.mode === 'payment' && sc.form['line_items[0][price_data][unit_amount]'] === '999' && sc.form['line_items[0][price_data][currency]'] === 'eur'
    && !Object.keys(sc.form).some((k) => /recurring|subscription_data/.test(k)))
  ok('le joueur est identifié sur la session ET sur le paiement (remboursement), type « lifetime »', sc.form['metadata[user_id]'] === UID && sc.form['metadata[kind]'] === 'lifetime' && sc.form.client_reference_id === UID && sc.form['payment_intent_data[metadata][user_id]'] === UID && sc.form['payment_intent_data[metadata][kind]'] === 'lifetime')
  ok('retour vers le site avec pro=success et l\'identifiant de session (accolades laissées telles quelles pour Stripe) / pro=cancel', sc.form.success_url === E.site + '?pro=success&session_id={CHECKOUT_SESSION_ID}' && sc.form.cancel_url === E.site + '?pro=cancel', sc.form.success_url)
  ok('code fiscal par défaut, email prérempli', sc.form['line_items[0][price_data][product_data][tax_code]'] === 'txcd_10201000' && sc.form.customer_email === 'thomas@example.com' && !('customer' in sc.form))
  ok(`produit affiché : « ${sc.form['line_items[0][price_data][product_data][name]']} »`, sc.form['line_items[0][price_data][product_data][name]'] === (E.name === 'preprod' ? 'Pass OneMore à vie – 1/1 Cards (test)' : 'Pass OneMore à vie – 1/1 Cards'))
  const rec2 = state.consents.at(-1)
  ok('preuve de consentement enregistrée (une de plus), liée à la session Stripe', state.consents.length === ncs + 1 && rec2.stripe_session_id === 'cs_test_abc' && rec2.cgv_version === 1 && rec2.user_id === UID)
  ok('preuve : textes acceptés dont « achat unique, à vie, sans renouvellement », IP, navigateur, prix, aucun booster', /CGV OK\nJe renonce\nAchat unique du pass OneMore : avantages à vie, sans abonnement ni renouvellement\./.test(rec2.statement) && rec2.ip === '203.0.113.9' && rec2.user_agent === 'ProAgent/2.0' && rec2.amount_cents === 999 && rec2.boosters === null && rec2.currency === 'eur')
  state.subName = 'Premium'; await subPost()
  ok('le nom vient du réglage texte de l\'admin (« Premium »)', state.stripeCalls.at(-1).form['line_items[0][price_data][product_data][name]'].includes('Pass Premium à vie'))
  state.subName = 'OneMore'
  state.cfg.subscription_price_cents = 1299; await subPost()
  ok('le prix suit le réglage (12,99 EUR)', state.stripeCalls.at(-1).form['line_items[0][price_data][unit_amount]'] === '1299')
  state.cfg.subscription_price_cents = 10; r = await subPost(); ok('prix absurde (< 0,50 EUR) refusé -> 503', r.status === 503)
  state.cfg.subscription_price_cents = 500000; r = await subPost(); ok('prix absurde (> 1 000 EUR) refusé -> 503', r.status === 503)
  state.cfg.subscription_price_cents = 999
  state.proMember = true
  const nnp = state.stripeCalls.length
  r = await subPost(); ok('déjà membre Pro -> 409 already_subscribed, aucune session (pas de second achat)', r.status === 409 && (await r.json()).error === 'already_subscribed' && state.stripeCalls.length === nnp)
  state.proMember = false
  r = await subPost(); ok('pass remboursé (plus membre) : peut le racheter', r.status === 200)
  state.stripeFail = true; r = await subPost(); ok('refus de Stripe -> 502', r.status === 502); state.stripeFail = false
  state.consentFail = true; r = await subPost(); ok('preuve non enregistrable -> pas de paiement proposé (500)', r.status === 500); state.consentFail = false
  if (E.name === 'prod') {
    Object.assign(state.legal, { seller_address: '' })
    r = await subPost(SULIVE); ok('clé live + adresse du vendeur vide -> 403 legal_incomplete', r.status === 403 && (await r.json()).error === 'legal_incomplete')
    r = await subPost(); ok('clé test + adresse vide : les essais restent possibles', r.status === 200)
    Object.assign(state.legal, { seller_address: '1 rue du Test, 69000 Lyon' })
    r = await subPost(SULIVE); ok('clé live + infos légales complètes -> paiement', r.status === 200)
  } else {
    const nn = state.stripeCalls.length
    r = await subPost(SULIVE); ok('PRÉPROD : une clé Stripe live (sk_live_) est refusée (503)', r.status === 503 && state.stripeCalls.length === nn)
  }
  r = await fetch(SU); ok('GET -> 405', r.status === 405)

  console.log(`--- [${E.name}] confirmation au retour du paiement (${E.dir}-subscribe, action confirm)`)
  const confirm = (id = 'cs_test_a1B2c3D4e5F6g7', headers = A) => post(SU, headers, JSON.stringify({ action: 'confirm', session_id: id }))
  const goodSession = (over = {}) => ({ id: 'cs_test_a1B2c3D4e5F6g7', mode: 'payment', status: 'complete', payment_status: 'paid', client_reference_id: UID, metadata: { user_id: UID, kind: 'lifetime' }, payment_intent: 'pi_777', amount_total: 999, currency: 'eur', ...over })
  const npc = state.proCalls.length, ngets = state.stripeGets.length
  r = await confirm(undefined, {}); ok('sans jeton -> 401', r.status === 401)
  r = await confirm('pas-un-identifiant'); ok('identifiant de session illisible -> 400 invalid_session, Stripe pas interrogé', r.status === 400 && (await r.json()).error === 'invalid_session' && state.stripeGets.length === ngets)
  r = await confirm('cs_test_../../v1/customers'); ok('tentative de détournement du chemin Stripe refusée -> 400', r.status === 400 && state.stripeGets.length === ngets)
  state.confirmSession = null; r = await confirm(); ok('session inconnue de Stripe -> 404 session_not_found, rien transmis', r.status === 404 && (await r.json()).error === 'session_not_found' && state.proCalls.length === npc)
  state.confirmSession = goodSession(); state.cfg.subscription_enabled = 0
  r = await confirm(); j = await r.json()
  ok('session du joueur, payée : pass donné tout de suite (même si la vente est fermée entre-temps)', r.status === 200 && j.ok === true && j.active === true, JSON.stringify(j))
  state.cfg.subscription_enabled = 1
  const cs = state.proCalls.at(-1)
  ok('transmis à ' + E.prefix + 'pro_grant : joueur, session, paiement, montant, devise', state.proCalls.length === npc + 1 && cs.p_user === UID && cs.p_session === 'cs_test_a1B2c3D4e5F6g7' && cs.p_payment_intent === 'pi_777' && cs.p_amount_cents === 999 && cs.p_currency === 'eur', JSON.stringify(cs))
  const sg = state.stripeGets.at(-1)
  ok('la session est relue chez Stripe avec la clé secrète', sg.auth === 'Bearer sk_test_fake' && /\/v1\/checkout\/sessions\/cs_test_a1B2c3D4e5F6g7$/.test(sg.url), sg.url)
  state.confirmSession = goodSession({ client_reference_id: 'bbbbbbbb-1111-2222-3333-444444444444', metadata: { user_id: 'bbbbbbbb-1111-2222-3333-444444444444', kind: 'lifetime' } })
  const n3 = state.proCalls.length; r = await confirm(); ok('session d\'un AUTRE joueur -> 403 wrong_user, rien transmis (impossible d\'activer le pass d\'un autre)', r.status === 403 && (await r.json()).error === 'wrong_user' && state.proCalls.length === n3)
  state.confirmSession = goodSession({ metadata: { user_id: UID, boosters: '10' } }); r = await confirm(); ok('session d\'un achat de pack de boosters (pas le pass) -> 403, rien transmis', r.status === 403 && state.proCalls.length === n3)
  state.confirmSession = goodSession({ mode: 'subscription' }); r = await confirm(); ok('session d\'un autre mode de paiement -> 403', r.status === 403 && state.proCalls.length === n3)
  state.confirmSession = goodSession({ status: 'open', payment_status: 'unpaid' }); r = await confirm(); ok('paiement pas terminé -> 409 not_complete, rien transmis', r.status === 409 && (await r.json()).error === 'not_complete' && state.proCalls.length === n3)
  state.confirmSession = goodSession({ payment_status: 'unpaid' }); r = await confirm(); ok('session terminée mais pas payée (virement en attente) -> 409, rien transmis', r.status === 409 && state.proCalls.length === n3)
  state.confirmSession = goodSession({ client_reference_id: null, metadata: { kind: 'lifetime' } }); r = await confirm(); ok('session sans joueur -> 403', r.status === 403 && state.proCalls.length === n3)
  state.confirmSession = goodSession({ payment_intent: { id: 'pi_obj' } }); await confirm(); ok('paiement donné sous forme d\'objet : identifiant retrouvé', state.proCalls.at(-1).p_payment_intent === 'pi_obj')
  state.confirmSession = goodSession(); state.rpcFail = true; r = await confirm(); ok('erreur base de données -> 500', r.status === 500); state.rpcFail = false
  state.confirmSession = null

  console.log(`--- [${E.name}] webhook : pass Pro (achat unique) et remboursement`)
  const sess = (over = {}) => JSON.stringify({ id: 'evt_pro', type: 'checkout.session.completed', data: { object: { id: 'cs_pro_1', mode: 'payment', payment_status: 'paid', payment_intent: 'pi_pro_1', amount_total: 999, currency: 'eur', client_reference_id: UID, metadata: { user_id: UID, kind: 'lifetime' }, ...over } } })
  const nprev = state.proCalls.length, ncred = state.rpcCalls.length
  p = sess(); r = await hook(p, sign(p)); j = await r.json()
  const pg = state.proCalls.at(-1)
  ok('achat du pass payé -> ' + E.prefix + 'pro_grant (joueur, session, paiement, montant), aucun pack de boosters crédité', r.status === 200 && state.proCalls.length === nprev + 1 && pg.p_user === UID && pg.p_session === 'cs_pro_1' && pg.p_payment_intent === 'pi_pro_1' && pg.p_amount_cents === 999 && pg.p_currency === 'eur' && state.rpcCalls.length === ncred, JSON.stringify(pg))
  p = JSON.stringify({ id: 'evt_pro2', type: 'checkout.session.async_payment_succeeded', data: { object: { id: 'cs_pro_2', mode: 'payment', payment_status: 'paid', payment_intent: { id: 'pi_pro_2' }, amount_total: 999, currency: 'eur', metadata: { user_id: UID, kind: 'lifetime' } } } }); await hook(p, sign(p))
  ok('paiement différé enfin payé (async_payment_succeeded) : pass donné, paiement sous forme d\'objet retrouvé', state.proCalls.at(-1).p_session === 'cs_pro_2' && state.proCalls.at(-1).p_payment_intent === 'pi_pro_2')
  const nn2 = state.proCalls.length
  p = sess({ payment_status: 'unpaid' }); r = await hook(p, sign(p)); ok('paiement pas encore reçu (unpaid) : aucun pass', r.status === 200 && state.proCalls.length === nn2)
  p = sess({ metadata: { kind: 'lifetime' }, client_reference_id: undefined }); r = await hook(p, sign(p)); j = await r.json(); ok('pass sans joueur -> ignoré', r.status === 200 && j.ignored === true && state.proCalls.length === nn2)
  p = sess({ metadata: { kind: 'lifetime', user_id: "x'; drop table" }, client_reference_id: undefined }); r = await hook(p, sign(p)); j = await r.json(); ok('identifiant de joueur illisible -> ignoré, jamais transmis à la base', r.status === 200 && j.ignored === true && state.proCalls.length === nn2)
  p = sess(); r = await hook(p, sign(p, undefined, 'whsec_autre')); ok('mauvaise signature -> 400, rien transmis', r.status === 400 && state.proCalls.length === nn2)
  r = await hook(p, sign(p, undefined, E.otherWhsec)); ok('signature de l\'autre environnement -> 400', r.status === 400 && state.proCalls.length === nn2)
  state.rpcFail = true; r = await hook(p, sign(p)); ok('erreur base de données -> 500 (Stripe réessaiera)', r.status === 500); state.rpcFail = false
  state.extraPayment = true; p = sess({ id: 'cs_pro_dbl' }); r = await hook(p, sign(p)); ok('second paiement du même joueur : accepté sans erreur (la base le signale, rien de plus à faire côté Stripe)', r.status === 200); state.extraPayment = false
  const nPack = state.rpcCalls.length
  p = JSON.stringify({ id: 'evt_pack', type: 'checkout.session.completed', data: { object: { id: 'cs_pack', payment_status: 'paid', metadata: { user_id: UID, boosters: '10' }, amount_total: 199, currency: 'eur', payment_intent: 'pi_pack' } } })
  await hook(p, sign(p))
  ok('un achat de pack de boosters continue de créditer les boosters (et ne donne pas le pass)', state.rpcCalls.length === nPack + 1 && state.proCalls.at(-1).p_session !== 'cs_pack')
  const nr = state.revokeCalls.length
  const refund = (over = {}) => JSON.stringify({ id: 'evt_ref', type: 'charge.refunded', data: { object: { id: 'ch_1', refunded: true, payment_intent: 'pi_pro_1', amount: 999, amount_refunded: 999, ...over } } })
  p = refund(); r = await hook(p, sign(p)); j = await r.json()
  ok('remboursement complet -> pass retiré via ' + E.prefix + 'pro_revoke (identifiant du paiement)', r.status === 200 && state.revokeCalls.length === nr + 1 && state.revokeCalls.at(-1).p_payment_intent === 'pi_pro_1' && j.revoked === 1, JSON.stringify(j))
  p = refund({ refunded: false, amount_refunded: 300 }); r = await hook(p, sign(p)); ok('remboursement PARTIEL -> le pass est gardé (rien transmis)', r.status === 200 && state.revokeCalls.length === nr + 1)
  p = refund({ payment_intent: null }); r = await hook(p, sign(p)); ok('remboursement sans paiement associé -> ignoré', r.status === 200 && state.revokeCalls.length === nr + 1)
  p = refund({ payment_intent: { id: 'pi_obj_2' } }); await hook(p, sign(p)); ok('paiement donné sous forme d\'objet : identifiant retrouvé', state.revokeCalls.at(-1).p_payment_intent === 'pi_obj_2')
  p = refund(); r = await hook(p, sign(p, undefined, 'whsec_autre')); ok('remboursement avec mauvaise signature -> 400, rien transmis', r.status === 400 && state.revokeCalls.length === nr + 2)
  state.rpcFail = true; p = refund(); r = await hook(p, sign(p)); ok('erreur base de données au remboursement -> 500 (Stripe réessaiera)', r.status === 500); state.rpcFail = false
  p = JSON.stringify({ id: 'evt_x', type: 'customer.subscription.created', data: { object: { id: 'sub_1', status: 'active', metadata: { user_id: UID } } } }); r = await hook(p, sign(p)); j = await r.json()
  ok('les anciens événements d\'abonnement sont simplement acquittés (plus d\'abonnement)', r.status === 200 && j.received === true && state.proCalls.length > 0 && !j.subscription)

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

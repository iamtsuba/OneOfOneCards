// 1/1 Cards, environnement preprod : crée une session Stripe Checkout pour s'abonner (paiement mensuel renouvelé automatiquement).
// GÉNÉRÉ par scripts/build-functions.mjs à partir de supabase/functions/_templates/ : ne pas modifier à la main.
// Appelée par l'application avec le jeton de connexion du joueur.
//
// Secrets requis (Supabase > Edge Functions > Secrets), les mêmes que la fonction de paiement :
//   PP_STRIPE_SECRET_KEY : clé secrète Stripe (TOUJOURS une clé sk_test_ : les clés sk_live_ sont refusées en préproduction)
//   PP_SITE_URL          : adresse de l'application (ex. https://pp.1o1cards.cc/)
// Secrets facultatifs :
//   PP_STRIPE_TAX_CODE         : code fiscal du produit (défaut txcd_10201000, jeu vidéo numérique)
//   PP_STRIPE_MANAGED_PAYMENTS : mettre "false" pour ne pas utiliser Managed Payments
//   (les réglages facultatifs retombent sur ceux de la production s'ils ne sont pas définis ; jamais les clés Stripe)
//
// Le prix (centimes par mois) et l'ouverture de l'abonnement viennent des réglages de pp_o1ocards_config, le nom de pp_o1ocards_text_config.
// Le prix est envoyé à Stripe à chaque souscription (price_data) : changer le réglage ne touche pas les abonnés déjà inscrits.
// Avant de créer le paiement, la fonction exige les conditions de vente, la renonciation au droit de rétractation (contenu numérique)
// ET la reconnaissance du renouvellement automatique, puis enregistre cette preuve dans pp_o1ocards_consents (date, version, textes, IP).
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2'

const ENV: string = 'preprod'
const PREFIX = 'pp_o1ocards_'     // préfixe des tables et fonctions SQL de cet environnement
const SP = 'PP_'              // préfixe des secrets : jamais de repli sur la production pour les clés Stripe
const secret = (name: string) => Deno.env.get(SP + name)
const setting = (name: string) => Deno.env.get(SP + name) ?? (SP ? Deno.env.get(name) : undefined)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const RECURRING_TEXT = 'Abonnement mensuel renouvelé automatiquement jusqu’à résiliation, que je peux faire à tout moment depuis « Gérer mon abonnement ».'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    const requested = req.headers.get('Access-Control-Request-Headers')
    return new Response('ok', { headers: { ...CORS, ...(requested ? { 'Access-Control-Allow-Headers': requested } : {}) } })
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const stripeKey = secret('STRIPE_SECRET_KEY')
    const siteUrl = secret('SITE_URL')
    if (!stripeKey || !siteUrl) {
      console.error('Secret manquant :', !stripeKey ? SP + 'STRIPE_SECRET_KEY' : '', !siteUrl ? SP + 'SITE_URL' : '')
      return json({ error: 'not_configured' }, 503)
    }
    // La préproduction ne doit jamais encaisser de vrai argent
    if (ENV === 'preprod' && stripeKey.startsWith('sk_live_')) {
      console.error('Clé Stripe de production refusée en préproduction : utilise une clé sk_test_ dans ' + SP + 'STRIPE_SECRET_KEY')
      return json({ error: 'not_configured' }, 503)
    }
    let back: URL
    try {
      back = new URL(siteUrl)
    } catch {
      console.error('SITE_URL invalide (elle doit commencer par https://) :', siteUrl)
      return json({ error: 'not_configured' }, 503)
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

    const body = await req.json().catch(() => ({}))
    const consent = body?.consent

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: auth, error: authError } = await admin.auth.getUser(token)
    const user = auth?.user
    if (authError || !user) return json({ error: 'not_authenticated' }, 401)

    const { data: rows, error: cfgError } = await admin
      .from(PREFIX + 'config').select('key,value').in('key', ['subscription_enabled', 'subscription_price_cents', 'cgv_version'])
    if (cfgError) throw cfgError
    const cfg = Object.fromEntries((rows ?? []).map((r) => [r.key, Number(r.value)]))
    if (cfg.subscription_enabled !== 1) return json({ error: 'subscription_disabled' }, 403)
    const cents = Math.round(cfg.subscription_price_cents)
    if (!(cents >= 50 && cents <= 100000) || !Number.isInteger(cfg.cgv_version)) return json({ error: 'not_configured' }, 503)

    // Déjà abonné : pas de second abonnement
    const { data: subRows, error: subError } = await admin
      .from(PREFIX + 'subscriptions').select('status,stripe_customer_id').eq('user_id', user.id).limit(1)
    if (subError) throw subError
    const current = subRows?.[0]
    if (current && ['active', 'trialing'].includes(current.status)) return json({ error: 'already_subscribed' }, 409)

    // Consentement obligatoire : CGV, renonciation à la rétractation, renouvellement automatique
    if (!(consent?.cgv === true && consent?.withdrawal === true && consent?.recurring === true)) return json({ error: 'consent_required' }, 400)
    if (Number(consent?.version) !== cfg.cgv_version) return json({ error: 'cgv_outdated' }, 409)

    const { data: legalRows, error: legalError } = await admin.from(PREFIX + 'legal').select('key,value')
    if (legalError) throw legalError
    const legal: Record<string, string> = Object.fromEntries((legalRows ?? []).map((r) => [r.key, String(r.value ?? '')]))
    const missing = ['seller_name', 'seller_address', 'seller_email'].filter((k) => !legal[k]?.trim())
    if (stripeKey.startsWith('sk_live_') && missing.length > 0) {
      console.error('Informations légales manquantes dans ' + PREFIX + 'legal :', missing.join(', '))
      return json({ error: 'legal_incomplete' }, 403)
    }

    const { data: textRows } = await admin.from(PREFIX + 'text_config').select('key,value').eq('key', 'subscription_name')
    const name = String(textRows?.[0]?.value ?? '').trim() || 'OneMore'

    const success = new URL(back)
    success.searchParams.set('subscription', 'success')
    const cancel = new URL(back)
    cancel.searchParams.set('subscription', 'cancel')

    const form = new URLSearchParams({
      mode: 'subscription',
      locale: 'fr',
      success_url: success.toString(),
      cancel_url: cancel.toString(),
      client_reference_id: user.id,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': String(cents),
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][product_data][name]': `Abonnement ${name} – 1/1 Cards${ENV === 'preprod' ? ' (test)' : ''}`,
      'line_items[0][price_data][product_data][tax_code]': setting('STRIPE_TAX_CODE') || 'txcd_10201000',
      'metadata[user_id]': user.id,
      'metadata[kind]': 'subscription',
      // c'est cette copie qui revient dans les notifications de l'abonnement (le joueur est reconnu sans autre recherche)
      'subscription_data[metadata][user_id]': user.id,
    })
    if (current?.stripe_customer_id) form.set('customer', current.stripe_customer_id)
    else if (user.email) form.set('customer_email', user.email)
    if (setting('STRIPE_MANAGED_PAYMENTS') === 'false') form.set('managed_payments[enabled]', 'false')

    const base = secret('STRIPE_API_BASE') ?? 'https://api.stripe.com'
    const res = await fetch(`${base}/v1/checkout/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    const session = await res.json()
    if (!res.ok || !session.url) {
      console.error('Stripe a refusé la création de la session d’abonnement', session?.error?.message)
      return json({ error: 'stripe_error' }, 502)
    }

    const forwarded = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
    const { error: consentError } = await admin.from(PREFIX + 'consents').insert({
      user_id: user.id,
      cgv_version: cfg.cgv_version,
      statement: [legal.consent_cgv_text, legal.consent_withdrawal_text, RECURRING_TEXT].filter(Boolean).join('\n'),
      ip: forwarded || req.headers.get('cf-connecting-ip') || null,
      user_agent: req.headers.get('user-agent'),
      boosters: null,
      amount_cents: cents,
      currency: 'eur',
      stripe_session_id: session.id,
    })
    if (consentError) {
      console.error('Impossible d’enregistrer le consentement', consentError.message)
      return json({ error: 'server_error' }, 500)
    }
    return json({ url: session.url })
  } catch (e) {
    console.error(e)
    return json({ error: 'server_error' }, 500)
  }
})

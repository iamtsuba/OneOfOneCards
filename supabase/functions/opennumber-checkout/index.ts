// Crée une session de paiement Stripe Checkout pour acheter un pack de boosters.
// Appelée par l'application avec le jeton de connexion du joueur.
//
// Secrets requis (Supabase > Edge Functions > Secrets) :
//   STRIPE_SECRET_KEY : clé secrète Stripe (sk_test_... puis sk_live_...)
//   SITE_URL          : adresse de l'application, ex. https://iamtsuba.github.io/OneOfOnePack/
// Secrets facultatifs :
//   STRIPE_TAX_CODE         : code fiscal du produit (défaut txcd_10201000, jeu vidéo numérique : exigé par Managed Payments)
//   STRIPE_MANAGED_PAYMENTS : mettre "false" pour ne pas utiliser Managed Payments (Stripe comme vendeur officiel)
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    // On autorise exactement les en-têtes demandés par le navigateur (supabase-js peut en ajouter selon sa version)
    const requested = req.headers.get('Access-Control-Request-Headers')
    return new Response('ok', { headers: { ...CORS, ...(requested ? { 'Access-Control-Allow-Headers': requested } : {}) } })
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    const siteUrl = Deno.env.get('SITE_URL')
    if (!stripeKey || !siteUrl) {
      console.error('Secret manquant :', !stripeKey ? 'STRIPE_SECRET_KEY' : '', !siteUrl ? 'SITE_URL' : '')
      return json({ error: 'not_configured' }, 503)
    }
    let back: URL
    try {
      back = new URL(siteUrl)
    } catch {
      console.error('SITE_URL invalide (elle doit commencer par https://) :', siteUrl)
      return json({ error: 'not_configured' }, 503)
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    })

    // Qui est le joueur ? On vérifie son jeton de connexion.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: auth, error: authError } = await admin.auth.getUser(token)
    const user = auth?.user
    if (authError || !user) return json({ error: 'not_authenticated' }, 401)

    // Prix et contenu du pack : réglages de la table opennumber_config
    const { data: rows, error: cfgError } = await admin
      .from('opennumber_config')
      .select('key,value')
      .in('key', ['shop_enabled', 'stripe_pack_boosters', 'stripe_pack_price_cents'])
    if (cfgError) throw cfgError
    const cfg = Object.fromEntries((rows ?? []).map((r) => [r.key, Number(r.value)]))
    if (cfg.shop_enabled !== 1) return json({ error: 'shop_disabled' }, 403)
    const boosters = Math.round(cfg.stripe_pack_boosters)
    const cents = Math.round(cfg.stripe_pack_price_cents)
    if (!(boosters >= 1 && boosters <= 1000) || !(cents >= 50)) return json({ error: 'not_configured' }, 503)

    const success = new URL(back)
    success.searchParams.set('payment', 'success')
    const cancel = new URL(back)
    cancel.searchParams.set('payment', 'cancel')

    const form = new URLSearchParams({
      mode: 'payment',
      locale: 'fr',
      success_url: success.toString(),
      cancel_url: cancel.toString(),
      client_reference_id: user.id,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': String(cents),
      'line_items[0][price_data][product_data][name]': `${boosters} boosters OneOfOne Pack`,
      'line_items[0][price_data][product_data][tax_code]': Deno.env.get('STRIPE_TAX_CODE') || 'txcd_10201000',
      'metadata[user_id]': user.id,
      'metadata[boosters]': String(boosters),
    })
    if (user.email) form.set('customer_email', user.email)
    if (Deno.env.get('STRIPE_MANAGED_PAYMENTS') === 'false') form.set('managed_payments[enabled]', 'false')

    const base = Deno.env.get('STRIPE_API_BASE') ?? 'https://api.stripe.com'
    const res = await fetch(`${base}/v1/checkout/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    const session = await res.json()
    if (!res.ok || !session.url) {
      console.error('Stripe a refusé la création de la session', session?.error?.message)
      return json({ error: 'stripe_error' }, 502)
    }
    return json({ url: session.url })
  } catch (e) {
    console.error(e)
    return json({ error: 'server_error' }, 500)
  }
})

// 1/1 Cards, environnement preprod : ouvre le portail de gestion de l'abonnement chez Stripe (résilier, changer de carte, factures).
// GÉNÉRÉ par scripts/build-functions.mjs à partir de supabase/functions/_templates/ : ne pas modifier à la main.
// Appelée par l'application avec le jeton de connexion du joueur.
//
// Secrets requis : PP_STRIPE_SECRET_KEY, PP_SITE_URL (voir la fonction d'abonnement).
// Prérequis côté Stripe : activer le portail client (Paramètres > Billing > Portail client) avec « Résilier l'abonnement ».
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2'

const ENV: string = 'preprod'
const PREFIX = 'pp_o1ocards_'
const SP = 'PP_'
const secret = (name: string) => Deno.env.get(SP + name)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    const requested = req.headers.get('Access-Control-Request-Headers')
    return new Response('ok', { headers: { ...CORS, ...(requested ? { 'Access-Control-Allow-Headers': requested } : {}) } })
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const stripeKey = secret('STRIPE_SECRET_KEY')
    const siteUrl = secret('SITE_URL')
    if (!stripeKey || !siteUrl) return json({ error: 'not_configured' }, 503)
    if (ENV === 'preprod' && stripeKey.startsWith('sk_live_')) return json({ error: 'not_configured' }, 503)
    let back: URL
    try { back = new URL(siteUrl) } catch { return json({ error: 'not_configured' }, 503) }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: auth, error: authError } = await admin.auth.getUser(token)
    const user = auth?.user
    if (authError || !user) return json({ error: 'not_authenticated' }, 401)

    // Le client Stripe du joueur : uniquement le sien, retrouvé côté serveur (jamais envoyé par le navigateur)
    const { data: rows, error } = await admin.from(PREFIX + 'subscriptions').select('stripe_customer_id').eq('user_id', user.id).limit(1)
    if (error) throw error
    const customer = rows?.[0]?.stripe_customer_id
    if (!customer) return json({ error: 'no_subscription' }, 404)

    const back2 = new URL(back)
    back2.searchParams.set('subscription', 'portal')
    const form = new URLSearchParams({ customer, return_url: back2.toString(), locale: 'fr' })
    const base = secret('STRIPE_API_BASE') ?? 'https://api.stripe.com'
    const res = await fetch(`${base}/v1/billing_portal/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    const session = await res.json()
    if (!res.ok || !session.url) {
      console.error('Stripe a refusé la création du portail (le portail client est-il activé ?)', session?.error?.message)
      return json({ error: 'stripe_error' }, 502)
    }
    return json({ url: session.url })
  } catch (e) {
    console.error(e)
    return json({ error: 'server_error' }, 500)
  }
})

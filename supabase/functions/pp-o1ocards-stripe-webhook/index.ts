// 1/1 Cards, environnement preprod : reçoit les notifications de Stripe : crédite les boosters après un paiement réussi, donne le pass Pro (achat unique,
// à vie) après son paiement et le retire après un remboursement complet.
// GÉNÉRÉ par scripts/build-functions.mjs à partir de supabase/functions/_templates/ : ne pas modifier à la main.
// Cette fonction doit être déployée SANS vérification JWT (c'est Stripe qui appelle) :
// l'authenticité est garantie par la signature Stripe, vérifiée ci-dessous.
//
// Secrets requis (Supabase > Edge Functions > Secrets) :
//   PP_STRIPE_WEBHOOK_SECRET : secret de signature du webhook (whsec_...)
// Événements à cocher dans Stripe (Développeurs > Webhooks) : checkout.session.completed, checkout.session.async_payment_succeeded, charge.refunded
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2'

// Réglages de l'environnement (la production et la préproduction partagent la même base Supabase)
const PREFIX = 'pp_o1ocards_'     // préfixe des tables et fonctions SQL de cet environnement
const SP = 'PP_'              // préfixe des secrets

const enc = new TextEncoder()

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Comparaison à temps constant
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// En-tête Stripe-Signature : "t=timestamp,v1=signature[,v1=...]". Tolérance de 5 minutes.
async function verifySignature(payload: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false
  let t = ''
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const [k, v] = part.split('=')
    if (k === 't') t = v
    if (k === 'v1' && v) signatures.push(v)
  }
  if (!t || signatures.length === 0) return false
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false
  const expected = await hmacHex(secret, `${t}.${payload}`)
  return signatures.some((s) => safeEqual(s, expected))
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 })

  const secret = Deno.env.get(SP + 'STRIPE_WEBHOOK_SECRET')
  if (!secret) return new Response('not_configured', { status: 503 })

  const payload = await req.text() // texte brut : indispensable pour vérifier la signature
  if (!(await verifySignature(payload, req.headers.get('Stripe-Signature'), secret))) {
    return new Response('invalid_signature', { status: 400 })
  }

  let event: any
  try {
    event = JSON.parse(payload)
  } catch {
    return new Response('invalid_payload', { status: 400 })
  }

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const intent = (v: any) => (typeof v === 'string' ? v : v?.id ?? null)

  // Remboursement COMPLET d'un achat du pass Pro : le joueur n'est plus membre (les boosters déjà reçus lui restent).
  // Un remboursement partiel (charge.refunded = false) ou d'un autre achat (pack de boosters) n'a aucun effet ici.
  if (event.type === 'charge.refunded') {
    const charge = event.data?.object
    const pi = intent(charge?.payment_intent)
    if (!charge || charge.refunded !== true || !pi) return Response.json({ received: true, ignored: true })
    const admin3 = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data, error } = await admin3.rpc(PREFIX + 'pro_revoke', { p_payment_intent: pi })
    if (error) {
      console.error('Retrait du pass Pro impossible', error.message)
      return new Response('revoke_failed', { status: 500 }) // Stripe réessaiera
    }
    return Response.json({ received: true, revoked: data?.revoked ?? 0 })
  }

  const handled = ['checkout.session.completed', 'checkout.session.async_payment_succeeded']
  if (!handled.includes(event.type)) return Response.json({ received: true })

  const session = event.data?.object
  // Paiement pas encore confirmé (ex. virement) : on attend l'événement async_payment_succeeded
  if (!session || session.payment_status !== 'paid') return Response.json({ received: true, credited: false })

  // Achat du pass Pro (paiement unique) : le joueur devient membre à vie. La base ne le fait qu'une fois par achat (la confirmation au retour du paiement fait pareil).
  if (session.metadata?.kind === 'lifetime') {
    const proUser = session.metadata?.user_id ?? session.client_reference_id
    if (typeof proUser !== 'string' || !UUID.test(proUser)) return Response.json({ received: true, ignored: true })
    const admin4 = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data, error } = await admin4.rpc(PREFIX + 'pro_grant', {
      p_user: proUser,
      p_session: session.id,
      p_payment_intent: intent(session.payment_intent),
      p_amount_cents: session.amount_total ?? null,
      p_currency: session.currency ?? null,
    })
    if (error) {
      console.error('Attribution du pass Pro impossible', error.message)
      return new Response('pro_failed', { status: 500 }) // Stripe réessaiera
    }
    if (data?.extra_payment) console.error('Second paiement du pass Pro par le même joueur : à rembourser', session.id)
    return Response.json({ received: true, pro: data ?? null })
  }

  const userId = session.metadata?.user_id ?? session.client_reference_id
  const boosters = Number(session.metadata?.boosters)
  // Session qui ne vient pas de notre application : on ignore
  if (!userId || !Number.isInteger(boosters)) return Response.json({ received: true, ignored: true })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const { data, error } = await admin.rpc(PREFIX + 'credit_purchase', {
    p_session_id: session.id,
    p_user: userId,
    p_boosters: boosters,
    p_amount: session.amount_total ?? null,
    p_currency: session.currency ?? null,
    p_payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : null,
  })
  if (error) {
    console.error('Crédit impossible', error.message)
    return new Response('credit_failed', { status: 500 }) // Stripe réessaiera
  }
  return Response.json({ received: true, credited: data === true })
})

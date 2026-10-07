// 1/1 Cards, environnement __ENV__ : reçoit les notifications de Stripe et crédite les boosters après un paiement réussi.
// GÉNÉRÉ par scripts/build-functions.mjs à partir de supabase/functions/_templates/ : ne pas modifier à la main.
// Cette fonction doit être déployée SANS vérification JWT (c'est Stripe qui appelle) :
// l'authenticité est garantie par la signature Stripe, vérifiée ci-dessous.
//
// Secrets requis (Supabase > Edge Functions > Secrets) :
//   __SP__STRIPE_WEBHOOK_SECRET : secret de signature du webhook (whsec_...)
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2'

// Réglages de l'environnement (la production et la préproduction partagent la même base Supabase)
const PREFIX = '__PREFIX__'     // préfixe des tables et fonctions SQL de cet environnement
const SP = '__SP__'              // préfixe des secrets

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

  const handled = ['checkout.session.completed', 'checkout.session.async_payment_succeeded']
  if (!handled.includes(event.type)) return Response.json({ received: true })

  const session = event.data?.object
  // Paiement pas encore confirmé (ex. virement) : on attend l'événement async_payment_succeeded
  if (!session || session.payment_status !== 'paid') return Response.json({ received: true, credited: false })

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

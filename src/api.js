import { supabase } from './supabase'

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  if (data && !Array.isArray(data) && typeof data === 'object' && data.error) throw new Error(data.error)
  return data
}

export const getStatus = () => rpc('opennumber_status')
export const openBooster = () => rpc('opennumber_open_booster')
export const getStats = () => rpc('opennumber_my_stats')
export const seriesState = (series) => rpc('opennumber_series_state', { p_series: series })
export const setUsername = (name) => rpc('opennumber_set_username', { p_username: name })
export const listCollection = ({ rarity = null, sort = 'series', limit = 60, offset = 0 } = {}) =>
  rpc('opennumber_list_collection', { p_rarity: rarity, p_sort: sort, p_limit: limit, p_offset: offset })

export const sellDirect = (series, number) => rpc('opennumber_sell_direct', { p_series: series, p_number: number })
export const listCard = ({ series, number, kind, price = null }) =>
  rpc('opennumber_list_card', { p_series: series, p_number: number, p_kind: kind, p_price: price })
export const cancelListing = (id) => rpc('opennumber_cancel_listing', { p_id: id })
export const buyNow = (id) => rpc('opennumber_buy_now', { p_id: id })
export const placeBid = (id, amount) => rpc('opennumber_place_bid', { p_id: id, p_amount: amount })
export const marketList = ({ kind = null, sort = 'ending', limit = 60, offset = 0 } = {}) =>
  rpc('opennumber_market_list', { p_kind: kind, p_sort: sort, p_limit: limit, p_offset: offset })
export const marketMine = () => rpc('opennumber_market_mine')

// Boutique : demande une page de paiement Stripe et renvoie son adresse
export async function startCheckout(consent) {
  const { data, error } = await supabase.functions.invoke('opennumber-checkout', { body: { consent } })
  if (error) {
    // Code renvoyé par la fonction (not_configured, shop_disabled...), sinon statut HTTP ou type d'erreur réseau
    let code = ''
    const res = error.context
    try { code = (await res.json()).error || '' } catch { /* réponse non lisible */ }
    if (!code) code = res?.status ? `http_${res.status}` : error.name || 'network'
    throw new Error(`checkout:${code}`)
  }
  if (!data?.url) throw new Error('checkout:no_url')
  return data.url
}

// Infos légales du vendeur, textes de consentement et réglages de la boutique (lisibles sans être connecté)
export async function getLegal() {
  const [legal, config] = await Promise.all([
    supabase.from('opennumber_legal').select('key,value'),
    supabase.from('opennumber_config').select('key,value').in('key', ['stripe_pack_boosters', 'stripe_pack_price_cents', 'cgv_version']),
  ])
  if (legal.error) throw legal.error
  if (config.error) throw config.error
  return {
    legal: Object.fromEntries(legal.data.map((r) => [r.key, r.value || ''])),
    config: Object.fromEntries(config.data.map((r) => [r.key, Number(r.value)])),
  }
}

export async function getRarities() {
  const { data, error } = await supabase.from('opennumber_rarities').select('*').order('sort_order')
  if (error) throw error
  return data
}

// Messages d'erreur lisibles
export function explain(e) {
  const m = e?.message || String(e)
  const low = m.match(/bid_too_low:(\d+)/)
  if (low) return `Mise trop basse : minimum ${low[1]} pièce${Number(low[1]) > 1 ? 's' : ''}.`
  if (m.includes('checkout:consent_required')) return 'Pour payer, coche les deux cases : conditions de vente et exécution immédiate.'
  if (m.includes('checkout:cgv_outdated')) return 'Les conditions de vente ont changé : recharge la page puis réessaie.'
  if (m.includes('checkout:legal_incomplete')) return 'Les informations légales du vendeur ne sont pas encore renseignées : le paiement est indisponible.'
  if (m.startsWith('checkout:'))
    return `Le paiement n’est pas disponible pour le moment. Réessaie plus tard. (code : ${m.slice(9)})`
  if (m.includes('no_boosters')) return 'Tu n’as plus de booster pour le moment.'
  if (m.includes('pool_empty')) return 'Toutes les cartes ont déjà été tirées.'
  if (m.includes('invalid_username')) return 'Le pseudo doit contenir entre 2 et 24 caractères.'
  if (m.includes('card_listed')) return 'Cette carte est en vente sur le marché : retire d’abord l’annonce.'
  if (m.includes('not_owner')) return 'Cette carte ne t’appartient pas (ou plus).'
  if (m.includes('insufficient_coins')) return 'Tu n’as pas assez de pièces.'
  if (m.includes('auction_ended')) return 'Cette enchère est terminée.'
  if (m.includes('own_listing')) return 'Tu ne peux pas acheter ni enchérir sur ta propre annonce.'
  if (m.includes('has_bids')) return 'Des offres ont été faites : l’annonce ne peut plus être retirée.'
  if (m.includes('listing_unavailable')) return 'Cette annonce n’est plus disponible.'
  if (m.includes('invalid_price')) return 'Prix invalide : entre un nombre entier de pièces, minimum 1.'
  if (/Could not find the function|schema cache|does not exist|relation .* not/i.test(m))
    return 'La base de données n’est pas à jour : exécute supabase/schema.sql dans le SQL Editor de Supabase.'
  if (/Invalid login credentials/i.test(m)) return 'Email ou mot de passe incorrect.'
  if (/already registered|already been registered/i.test(m)) return 'Un compte existe déjà avec cet email.'
  if (/Email not confirmed/i.test(m)) return 'Confirme ton adresse email avant de te connecter.'
  if (/at least \d+ characters/i.test(m)) return 'Le mot de passe doit contenir au moins 6 caractères.'
  if (/rate limit|too many/i.test(m)) return 'Trop de tentatives : réessaie dans quelques minutes.'
  if (/valid email|invalid email/i.test(m)) return 'Adresse email invalide.'
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Connexion impossible : vérifie ton réseau.'
  return m
}

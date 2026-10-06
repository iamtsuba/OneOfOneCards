import { supabase } from './supabase'

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  if (data && !Array.isArray(data) && typeof data === 'object' && data.error) throw new Error(data.error)
  return data
}

export const getStatus = () => rpc('opennumber_status')
export const openBooster = () => rpc('opennumber_open_booster')
export const getStats = (category = null) => rpc('opennumber_my_stats', { p_category: category })
export const typeState = (type, series) => rpc('opennumber_type_state', { p_type: type, p_series: series })
export const setUsername = (name) => rpc('opennumber_set_username', { p_username: name })
export const listCollection = ({ category = null, type = null, rarity = null, sort = 'series', limit = 60, offset = 0 } = {}) =>
  rpc('opennumber_list_collection', { p_category: category, p_type: type, p_rarity: rarity, p_sort: sort, p_limit: limit, p_offset: offset })

export const sellDirect = (type, series, number) => rpc('opennumber_sell_direct', { p_type: type, p_series: series, p_number: number })
export const listCard = ({ type, series, number, kind, price = null }) =>
  rpc('opennumber_list_card', { p_type: type, p_series: series, p_number: number, p_kind: kind, p_price: price })
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

// Catalogue : catégories de boosters et types de cartes (lisible par tous)
export async function getCatalog() {
  const [cats, types] = await Promise.all([
    supabase.from('opennumber_categories').select('*').order('position').order('id'),
    supabase.from('opennumber_types').select('*').order('position').order('id'),
  ])
  if (cats.error) throw cats.error
  if (types.error) throw types.error
  return { categories: cats.data, types: types.data }
}

// ---------- Console admin : chaque appel renvoie le mot de passe, vérifié côté serveur ----------
export const adminData = (pw) => rpc('opennumber_admin_data', { p_password: pw })
export const adminSaveCategory = (pw, c) =>
  rpc('opennumber_admin_save_category', {
    p_password: pw, p_id: c.id ?? null, p_name: c.name, p_position: Number(c.position), p_series_count: Number(c.series_count),
    p_color: c.color, p_color2: c.color2, p_text_color: c.text_color, p_enabled: !!c.enabled,
  })
export const adminSetCategoryClosed = (pw, id, closed) => rpc('opennumber_admin_set_category_closed', { p_password: pw, p_id: id, p_closed: closed })
export const adminDeleteCategory = (pw, id) => rpc('opennumber_admin_delete_category', { p_password: pw, p_id: id })
export const adminSaveType = (pw, t) =>
  rpc('opennumber_admin_save_type', {
    p_password: pw, p_id: t.id ?? null, p_category: t.category_id, p_name: t.name, p_image: t.image ?? '', p_position: Number(t.position),
  })
export const adminDeleteType = (pw, id) => rpc('opennumber_admin_delete_type', { p_password: pw, p_id: id })
export const adminSetConfig = (pw, key, value) => rpc('opennumber_admin_set_config', { p_password: pw, p_key: key, p_value: Number(value) })
export const adminSaveRarity = (pw, r) =>
  rpc('opennumber_admin_save_rarity', {
    p_password: pw, p_id: r.id, p_name: r.name, p_max_series: r.max_series === null || r.max_series === '' ? null : Number(r.max_series),
    p_color: r.color, p_color2: r.color2, p_text_color: r.text_color,
  })
export const adminSetLegal = (pw, key, value) => rpc('opennumber_admin_set_legal', { p_password: pw, p_key: key, p_value: value })
export const adminChangePassword = (pw, next) => rpc('opennumber_admin_change_password', { p_password: pw, p_new: next })

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
  const adminMessages = {
    admin_denied: 'Mot de passe incorrect.',
    admin_locked: 'Trop d’essais : l’accès admin est verrouillé pendant 15 minutes.',
    admin_not_set: 'Aucun mot de passe admin n’est défini : voir le README (opennumber_admin_set_password).',
    invalid_series: 'Le nombre de séries doit être compris entre 1 et 5000.',
    invalid_color: 'Les couleurs doivent être au format #rrggbb.',
    invalid_image: 'Image invalide : utilise un emoji, une adresse https:// ou une image téléversée.',
    image_too_large: 'Image trop lourde : choisis une image plus petite.',
    series_locked: 'Le nombre de séries ne peut plus changer : des cartes ont déjà été tirées.',
    category_started: 'Suppression impossible : des cartes de cette catégorie ont déjà été tirées.',
    type_started: 'Suppression impossible : des cartes de ce type ont déjà été tirées.',
    password_too_short: 'Le mot de passe doit contenir au moins 8 caractères.',
    invalid_value: 'Valeur invalide.',
    not_found: 'Élément introuvable.',
  }
  for (const [code, text] of Object.entries(adminMessages)) if (m.includes(code)) return text
  if (m.includes('invalid_name')) return 'Le nom est vide ou trop long.'
  if (m.includes('category_closed')) return 'Revente à la banque indisponible : cette catégorie est terminée. Tu peux toujours vendre la carte sur le marché.'
  if (m.includes('try_again')) return 'Le tirage a été interrompu : réessaie dans un instant.'
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

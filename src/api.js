import { supabase } from './supabase'
import { PREFIX, CHECKOUT_FUNCTION } from './env'

// Tous les noms de tables et de fonctions de la base portent le préfixe de l'environnement (o1ocards_ ou pp_o1ocards_)
const table = (name) => PREFIX + name

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(PREFIX + fn, args)
  if (error) throw error
  if (data && !Array.isArray(data) && typeof data === 'object' && data.error) throw new Error(data.error)
  return data
}

export const getStatus = () => rpc('status')
export const openBooster = () => rpc('open_booster')
export const openGoldenPack = () => rpc('open_golden_pack')
export const ackRewards = () => rpc('ack_rewards')
export const getStats = (category = null) => rpc('my_stats', { p_category: category })
export const getOdds = (category = null) => rpc('draw_odds', { p_category: category })
export const typeState = (type, series) => rpc('type_state', { p_type: type, p_series: series })
export const setUsername = (name) => rpc('set_username', { p_username: name })
export const listCollection = ({ category = null, type = null, rarity = null, sort = 'series', limit = 60, offset = 0 } = {}) =>
  rpc('list_collection', { p_category: category, p_type: type, p_rarity: rarity, p_sort: sort, p_limit: limit, p_offset: offset })

// Vente rapide de plusieurs cartes d'une pile (cartes à numéro masqué d'un type et d'une rareté), tout ou rien
export const sellDirectMany = (type, rarity, count) => rpc('sell_direct_many', { p_type: type, p_rarity: rarity, p_count: count })
export const sellDirect = (type, base, series, number) => rpc('sell_direct', { p_type: type, p_base: base, p_series: series, p_number: number })
export const listCard = ({ type, base, series, number, kind, price = null }) =>
  rpc('list_card', { p_type: type, p_base: base, p_series: series, p_number: number, p_kind: kind, p_price: price })
export const cancelListing = (id) => rpc('cancel_listing', { p_id: id })
export const buyNow = (id) => rpc('buy_now', { p_id: id })
export const placeBid = (id, amount) => rpc('place_bid', { p_id: id, p_amount: amount })
export const marketList = ({ kind = null, sort = 'ending', limit = 60, offset = 0 } = {}) =>
  rpc('market_list', { p_kind: kind, p_sort: sort, p_limit: limit, p_offset: offset })
export const marketMine = () => rpc('market_mine')

// Album : un exemplaire numéroté choisi par carte (type) et par rareté
export const albumView = (category) => rpc('album_view', { p_category: category })
// Amis : recherche par début de pseudo, demandes, liste, collection d'un ami (ses doubles : p_doubles)
export const friendSearch = (query) => rpc('friend_search', { p_query: query })
export const friendRequest = (userId) => rpc('friend_request', { p_user: userId })
export const friendRespond = (friendshipId, accept) => rpc('friend_respond', { p_id: friendshipId, p_accept: accept })
export const friendRemove = (userId) => rpc('friend_remove', { p_user: userId })
export const friendsList = () => rpc('friends_list')
export const friendCards = (friendId, doubles = false, limit = 60, offset = 0) =>
  rpc('friend_cards', { p_friend: friendId, p_doubles: doubles, p_limit: limit, p_offset: offset })
// « Voir la collection » : [{ type_id, holders }] = joueurs distincts qui possèdent au moins une carte de chaque type de la catégorie
export const collectionHolders = (category) => rpc('collection_holders', { p_category: category })
export const myTypeCards = (type, rarity = null) => rpc('my_type_cards', { p_type: type, p_rarity: rarity })
export const setAlbumPick = (type, base, series, number) => rpc('set_album_pick', { p_type: type, p_base: base, p_series: series, p_number: number })
export const clearAlbumPick = (type, rarity) => rpc('clear_album_pick', { p_type: type, p_rarity: rarity })

// Favoris
export const toggleFavorite = (type, base, series, number) => rpc('toggle_favorite', { p_type: type, p_base: base, p_series: series, p_number: number })
export const listFavorites = () => rpc('list_favorites')

// Offres directes
export const makeOffer = (type, base, series, number, amount) =>
  rpc('make_offer', { p_type: type, p_base: base, p_series: series, p_number: number, p_amount: amount })
export const cancelOffer = (id) => rpc('cancel_offer', { p_id: id })
export const respondOffer = (id, accept) => rpc('respond_offer', { p_id: id, p_accept: accept })
export const myOffers = () => rpc('my_offers')

// Notifications
export const notificationsList = (limit = 30) => rpc('notifications_list', { p_limit: limit })
export const notificationsMarkRead = (ids = null) => rpc('notifications_mark_read', { p_ids: ids })

// Boutique : demande une page de paiement Stripe et renvoie son adresse
export async function startCheckout(consent) {
  const { data, error } = await supabase.functions.invoke(CHECKOUT_FUNCTION, { body: { consent } })
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
    supabase.from(table('legal')).select('key,value'),
    supabase.from(table('config')).select('key,value').in('key', ['stripe_pack_boosters', 'stripe_pack_price_cents', 'cgv_version']),
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
  const [cats, types, typeRarities] = await Promise.all([
    supabase.from(table('categories')).select('*').order('position').order('id'),
    supabase.from(table('types')).select('*').order('position').order('id'),
    supabase.from(table('type_rarities')).select('*').order('type_id').order('max_series'),
  ])
  if (cats.error) throw cats.error
  if (types.error) throw types.error
  if (typeRarities.error) throw typeRarities.error
  return { categories: cats.data, types: types.data, typeRarities: typeRarities.data }
}

// ---------- Console admin : chaque appel renvoie le mot de passe, vérifié côté serveur ----------
export const adminData = (pw) => rpc('admin_data', { p_password: pw })
export const adminForceDeleteCategory = (pw, id, confirmName) =>
  rpc('admin_force_delete_category', { p_password: pw, p_id: id, p_confirm_name: confirmName })
// Copie une catégorie (types, images, raretés) de la préproduction vers la production. Réservée à la console de PRÉPRODUCTION : la fonction
// n'existe pas dans le schéma de production. Exige aussi le mot de passe administrateur de la production.
export const adminCopyCategoryToProd = (pw, categoryId, prodPassword, createMissingRarities = false) =>
  rpc('admin_copy_category_to_prod', { p_password: pw, p_category: categoryId, p_prod_password: prodPassword, p_create_missing_rarities: !!createMissingRarities })
export const adminSaveCategory = (pw, c) =>
  rpc('admin_save_category', {
    p_password: pw, p_id: c.id ?? null, p_name: c.name, p_position: Number(c.position), p_series_count: Number(c.series_count),
    p_color: c.color, p_color2: c.color2, p_text_color: c.text_color, p_enabled: !!c.enabled, p_image: c.image ?? '',
  })
export const adminSetCategoryClosed = (pw, id, closed) => rpc('admin_set_category_closed', { p_password: pw, p_id: id, p_closed: closed })
export const adminDeleteCategory = (pw, id) => rpc('admin_delete_category', { p_password: pw, p_id: id })
export const adminSaveType = (pw, t) =>
  rpc('admin_save_type', {
    p_password: pw, p_id: t.id ?? null, p_category: t.category_id, p_name: t.name, p_image: t.image ?? '', p_position: Number(t.position),
  })
export const adminDeleteType = (pw, id) => rpc('admin_delete_type', { p_password: pw, p_id: id })
export const adminImportTypes = (pw, categoryId, types) =>
  rpc('admin_import_types', { p_password: pw, p_category: categoryId, p_types: types })
export const adminSetConfig = (pw, key, value) => rpc('admin_set_config', { p_password: pw, p_key: key, p_value: Number(value) })
export const adminSaveRarity = (pw, r) =>
  rpc('admin_save_rarity', {
    p_password: pw, p_id: r.id, p_name: r.name, p_max_series: r.max_series === null || r.max_series === '' ? null : Number(r.max_series),
    p_color: r.color, p_color2: r.color2, p_text_color: r.text_color,
  })
// Poids de tirage d'une rareté : cartes 1 à 3, carte 4, carte 5 (0 = jamais tirée à cet emplacement)
export const adminSetRarityWeights = (pw, id, w13, w4, w5) =>
  rpc('admin_set_rarity_weights', { p_password: pw, p_id: id, p_w13: Number(w13), p_w4: Number(w4), p_w5: Number(w5) })
export const adminCreateRarity = (pw, r) =>
  rpc('admin_create_rarity', {
    p_password: pw, p_id: r.id, p_name: r.name, p_max_series: Number(r.max_series),
    p_color: r.color, p_color2: r.color2, p_text_color: r.text_color, p_before: r.before || null,
  })
// Raretés d'un type : rows = [{rarity_id, max_series, numbered_series}], [] = retour aux seuils par défaut, null = inchangé
export const adminSaveTypeRarities = (pw, typeId, rows, secret = null) =>
  rpc('admin_save_type_rarities', { p_password: pw, p_type: typeId, p_rarities: rows, p_secret: secret })
export const adminDeleteRarity = (pw, id) => rpc('admin_delete_rarity', { p_password: pw, p_id: id })
export const adminSetLegal = (pw, key, value) => rpc('admin_set_legal', { p_password: pw, p_key: key, p_value: value })
export const adminChangePassword = (pw, next) => rpc('admin_change_password', { p_password: pw, p_new: next })

export async function getRarities() {
  const { data, error } = await supabase.from(table('rarities')).select('*').order('sort_order')
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
  // Copie vers la production : ces codes contiennent « admin_denied » etc., ils doivent être reconnus AVANT les messages admin génériques
  const missingRar = m.match(/prod_missing_rarities:([a-z0-9_,]+)/)
  if (missingRar) return `La production n’a pas ces raretés : ${missingRar[1].split(',').join(', ')}. Coche « Créer en production les raretés manquantes » puis réessaie.`
  const prodMessages = {
    prod_admin_denied: 'Mot de passe administrateur de la PRODUCTION incorrect.',
    prod_admin_locked: 'Trop d’essais sur la production : son accès admin est verrouillé pendant 15 minutes.',
    prod_admin_not_set: 'Aucun mot de passe administrateur n’est défini en production.',
    prod_not_authenticated: 'Tu n’es pas connecté.',
    prod_category_exists: 'Une catégorie de ce nom existe déjà en production : elle n’est pas écrasée. Renomme-la ici ou supprime l’ancienne en production.',
  }
  for (const [code, text] of Object.entries(prodMessages)) if (m.includes(code)) return text
  const badRow = m.match(/invalid_import_row:(\d+)/)
  if (badRow) return `Import refusé : la ligne ${badRow[1]} du fichier est invalide (rien n’a été importé).`
  const adminMessages = {
    admin_denied: 'Mot de passe incorrect.',
    admin_locked: 'Trop d’essais : l’accès admin est verrouillé pendant 15 minutes.',
    admin_not_set: 'Aucun mot de passe admin n’est défini : voir le README (' + PREFIX + 'admin_set_password).',
    invalid_import: 'Import vide ou illisible.',
    import_too_large: 'Trop de types : 500 maximum par import.',
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
  if (m.includes('no_golden_pack')) return 'Tu n’as pas de pack doré à ouvrir.'
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
  if (m.includes('invalid_weight')) return 'Poids invalides : un nombre positif ou nul.'
  if (m.includes('invalid_type_rarities')) return 'Raretés du type invalides : une même rareté une seule fois, séries entre 0 et 5000 (au moins une rareté avec des séries), « numérotées » au plus égal au nombre de séries, style Simple ou FullArt.'
  if (m.includes('id_taken')) return 'Cet identifiant de rareté existe déjà.'
  if (m.includes('invalid_id')) return 'Identifiant invalide : minuscules, chiffres et _ uniquement, 2 à 20 caractères, débute par une lettre.'
  if (m.includes('invalid_max_series')) return 'Taille de série maximale invalide : un nombre entier d’au moins 1 (pas de plafond ouvert pour une nouvelle rareté).'
  if (m.includes('rarity_protected')) return 'Unique, Alpha et Omega ne peuvent pas être supprimées.'
  if (m.includes('rarity_in_use')) return 'Cette rareté est utilisée (cartes déjà classées ou contenu de booster doré) : elle ne peut pas être supprimée.'
  if (m.includes('name_mismatch')) return 'Le nom tapé ne correspond pas exactement au nom de la catégorie : rien n’a été supprimé.'
  if (m.includes('card_in_album')) return 'Cette carte est dans ton album : elle ne peut pas être vendue. Retire-la de l’album pour la vendre.'
  if (m.includes('not_enough_cards')) return 'Il n’y a pas assez de cartes vendables dans cette pile (celles de l’album ou en vente sont exclues).'
  if (m.includes('invalid_count')) return 'Quantité invalide : entre un nombre entier de cartes, minimum 1.'
  if (m.includes('not_friends')) return 'Tu dois d’abord être ami avec ce joueur.'
  if (m.includes('cannot_friend_self')) return 'Tu ne peux pas t’ajouter toi-même.'
  if (m.includes('user_not_found')) return 'Ce joueur n’existe pas.'
  if (m.includes('already_friends')) return 'Vous êtes déjà amis.'
  if (m.includes('request_pending')) return 'Ta demande est déjà envoyée.'
  if (m.includes('too_many_friends')) return 'Tu as atteint la limite d’amis et de demandes (200).'
  if (m.includes('own_card')) return 'Cette carte est déjà à toi.'
  if (m.includes('card_not_taken')) return 'Cette carte n’a pas encore été tirée : impossible de faire une offre.'
  if (m.includes('buyer_insufficient_coins')) return 'L’acheteur n’a plus assez de pièces pour cette offre.'
  if (m.includes('card_in_auction')) return 'Cette carte est aux enchères avec des offres en cours : accepte d’abord l’issue de l’enchère.'
  if (m.includes('offer_unavailable')) return 'Cette offre n’est plus disponible.'
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

// Logique pure de l'éditeur de boosters (admin) : répartitions par carte, chances en pourcentage, contrôles. Testée sans navigateur.
export const MAX_CARDS = 10

// Rôles particuliers d'un booster (un seul booster par rôle ; le Standard n'en a pas) : '' = booster ordinaire
export const ROLES = [
  { id: '', label: 'Booster ordinaire', help: 'Se reçoit en cadeau de l’admin ou s’achète en pièces si un prix est fixé.' },
  { id: 'subscriber', label: 'Booster des abonnés', help: 'Remplace le Standard pour les abonnés (même stock gratuit). Jamais en vente.' },
  { id: 'subscription_gift', label: 'Cadeau des abonnés', help: 'Offert aux abonnés à chaque période de facturation (la quantité se règle dans Réglages).' },
  { id: 'card_reward', label: 'Récompense : carte complétée', help: 'Le booster Gold : gagné quand tous les emplacements d’une carte sont remplis dans l’album. Jamais en vente. Peut contenir Alpha, Omega et une carte numérotée de la carte complétée ; une rareté ordinaire n’y donne que des cartes « du milieu ».' },
]
export const roleLabel = (id) => ROLES.find((r) => r.id === (id ?? ''))?.label ?? ''
// Choix propre au booster de récompense : une carte à numéro visible de la carte qui vient d'être complétée
export const NUMBERED = { id: 'numbered', name: 'Carte numérotée (de la carte complétée)', kind: 'numbered' }

// [{position, rarity_id, weight}] -> une liste par carte : [[{rarity_id, weight}], …] (cards listes, même vides)
export function slotsToPositions(slots, cards) {
  const out = Array.from({ length: cards }, () => [])
  for (const s of slots ?? []) {
    if (s.position >= 1 && s.position <= cards) out[s.position - 1].push({ rarity_id: s.rarity_id, weight: Number(s.weight) })
  }
  return out
}

// L'inverse, pour l'enregistrement : [{position, rarity_id, weight}]
export function positionsToSlots(positions) {
  return positions.flatMap((entries, i) => entries.map((e) => ({ position: i + 1, rarity_id: e.rarity_id, weight: Number(e.weight) })))
}

// Chance de chaque rareté d'une carte : poids / somme des poids positifs (0 pour un poids nul ou invalide)
export function shares(entries) {
  const w = (e) => { const x = Number(e.weight); return Number.isFinite(x) && x > 0 ? x : 0 }
  const total = entries.reduce((a, e) => a + w(e), 0)
  return entries.map((e) => (total > 0 ? w(e) / total : 0))
}

// Passe à `cards` cartes : retire les dernières, ou ajoute des cartes qui copient la répartition de la précédente
export function resizePositions(positions, cards) {
  const out = positions.slice(0, cards).map((entries) => entries.map((e) => ({ ...e })))
  while (out.length < cards) out.push((out[out.length - 1] ?? []).map((e) => ({ ...e })))
  return out
}

// Contrôles de l'éditeur (les mêmes que ceux du serveur) : renvoie un message en français, ou '' si tout est valide. names = { id: nom de la rareté }
export function validateBooster({ name, cards, price, positions, role = '' }, names = {}, kinds = {}) {
  const n = String(name ?? '').trim()
  if (!n) return 'Donne un nom au booster.'
  if (n.length > 40) return 'Le nom est limité à 40 caractères.'
  if (!Number.isInteger(cards) || cards < 1 || cards > MAX_CARDS) return `Le nombre de cartes doit être entre 1 et ${MAX_CARDS}.`
  if (price !== '' && price != null && !(Number.isInteger(Number(price)) && Number(price) >= 0 && Number(price) <= 1e9)) return 'Le prix est un nombre entier de pièces, ou vide.'
  const label = (id) => names[id] ?? id
  for (let i = 0; i < cards; i++) {
    const entries = positions[i] ?? []
    if (entries.length === 0) return `La carte ${i + 1} n’a aucune rareté.`
    const seen = new Set()
    for (const e of entries) {
      if (seen.has(e.rarity_id)) return `Carte ${i + 1} : « ${label(e.rarity_id)} » est en double.`
      seen.add(e.rarity_id)
      // Alpha, Omega et la carte numérotée n'existent que dans le booster de récompense
      if (role !== 'card_reward' && (e.rarity_id === NUMBERED.id || kinds[e.rarity_id] === 'alpha' || kinds[e.rarity_id] === 'omega')) return `Carte ${i + 1} : « ${label(e.rarity_id)} » n’est possible que dans le booster de récompense.`
      const w = Number(e.weight)
      if (!(w > 0) || !Number.isFinite(w) || w > 1e6) return `Carte ${i + 1} : le poids de « ${label(e.rarity_id)} » doit être un nombre positif.`
    }
  }
  return ''
}

// Un booster neuf : chaque carte 100 % de la rareté ordinaire la plus répandue
export function defaultPositions(rarities, cards = 5) {
  const common = [...rarities].filter((r) => r.kind === 'range').sort((a, b) => b.sort_order - a.sort_order)[0]
  return Array.from({ length: cards }, () => (common ? [{ rarity_id: common.id, weight: 100 }] : []))
}

// Raretés proposables dans une répartition : ordinaires et Unique, de la plus répandue à la plus rare ; pour le booster de récompense (role 'card_reward')
// aussi Alpha, Omega et la carte numérotée de la carte complétée
export function pickableRarities(rarities, role = '') {
  const reward = role === 'card_reward'
  const list = rarities.filter((r) => r.kind === 'range' || r.kind === 'unique' || (reward && (r.kind === 'alpha' || r.kind === 'omega'))).sort((a, b) => b.sort_order - a.sort_order)
  return reward ? [...list, NUMBERED] : list
}

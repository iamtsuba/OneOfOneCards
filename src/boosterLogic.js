// Logique pure de l'éditeur de boosters (admin) : répartitions par carte, chances en pourcentage, contrôles. Testée sans navigateur.
export const MAX_CARDS = 10

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
export function validateBooster({ name, cards, price, positions }, names = {}) {
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

// Raretés proposables dans une répartition : ordinaires et Unique (pas Alpha ni Omega), de la plus répandue à la plus rare
export function pickableRarities(rarities) {
  return rarities.filter((r) => r.kind === 'range' || r.kind === 'unique').sort((a, b) => b.sort_order - a.sort_order)
}

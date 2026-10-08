// Rareté d'une carte n/m d'une série. Unique (1/1) et Alpha/Omega (1/m, m/m) sont les mêmes pour toutes
// les catégories. Pour les autres (« range » : Ultra Rare, Super Rare, Rare, Commune...), les seuils sont
// propres à chaque catégorie côté serveur : on utilise directement la rareté déjà calculée pour la série
// (type_state renvoie `range_rarity`), plutôt que de dupliquer les seuils ici.
export function slotRarityId(n, m, rangeRarityId, rarities) {
  const byKind = (k) => rarities.find((r) => r.kind === k)
  if (m === 1) return byKind('unique')?.id
  if (n === 1) return byKind('alpha')?.id
  if (n === m) return byKind('omega')?.id
  return rangeRarityId
}

// Raretés qui déclenchent les feux d'artifice et l'effet métallisé
export const isSpecial = (r) => !!r && ['unique', 'alpha', 'omega'].includes(r.kind)

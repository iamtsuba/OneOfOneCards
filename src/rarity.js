// Même logique que la fonction SQL opennumber_rarity_id.
// Priorité : Unique (1/1) > Alpha (1/m) > Omega (m/m) > rareté par taille de série
export function rarityId(n, m, rarities) {
  const byKind = (k) => rarities.find((r) => r.kind === k)
  let r = null
  if (m === 1) r = byKind('unique')
  else if (n === 1) r = byKind('alpha')
  else if (n === m) r = byKind('omega')
  if (r) return r.id
  const ranges = rarities
    .filter((x) => x.kind === 'range')
    .sort((a, b) => (a.max_series ?? Infinity) - (b.max_series ?? Infinity))
  const found = ranges.find((x) => x.max_series == null || m <= x.max_series) || ranges[ranges.length - 1]
  return found?.id
}

// Raretés qui déclenchent les feux d'artifice et l'effet métallisé
export const isSpecial = (r) => !!r && ['unique', 'alpha', 'omega'].includes(r.kind)

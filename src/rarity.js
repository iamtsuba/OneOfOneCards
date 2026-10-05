// Même logique que la fonction SQL opennumber_rarity_id (utilisée pour l'album d'une série)
const isPow10 = (m) => m >= 10 && /^10+$/.test(String(m))

export function rarityId(n, m, rarities) {
  const byKind = (k) => rarities.find((r) => r.kind === k)
  let r = null
  if (m === 1) r = byKind('unique')
  else if (n === 1 && isPow10(m)) r = byKind('alpha')
  else if (n === m && isPow10(m)) r = byKind('omega')
  if (r) return r.id
  const ranges = rarities
    .filter((x) => x.kind === 'range')
    .sort((a, b) => (a.max_series ?? Infinity) - (b.max_series ?? Infinity))
  const found = ranges.find((x) => x.max_series == null || m <= x.max_series) || ranges[ranges.length - 1]
  return found?.id
}

export const isFoil = (r) => r && ['unique', 'alpha', 'omega'].includes(r.kind)

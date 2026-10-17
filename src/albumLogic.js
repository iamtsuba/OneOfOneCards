// Logique de l'album et des piles de cartes : pure, testable sans navigateur (tests/album-logic.test.mjs).

// Les raretés spéciales Unique (1/1), Alpha (1/N) et Omega (N/N) sont hors master set : leurs emplacements sont visibles dans l'album mais ne
// comptent pas dans le master set (comme les cartes secrètes). Le master set = un emplacement par rareté ordinaire de chaque carte.
export const SPECIAL_KINDS = ['unique', 'alpha', 'omega']
export const isBonus = (rarity) => SPECIAL_KINDS.includes(rarity?.kind)
// Numéro affiché à côté d'une rareté spéciale : Unique 1/1, Alpha 1/N, Omega N/N (N = nombre de cartes de la série)
export const specialSuffix = (rarity) => ({ unique: '1/1', alpha: '1/N', omega: 'N/N' })[rarity?.kind] ?? ''

// rows : sortie de album_view (un emplacement par carte et par rareté). Le master set = tous les emplacements sauf Unique, Alpha et Omega.
export function albumStats(rows, rarityMap) {
  const base = { filled: 0, total: 0 }
  const bonus = { filled: 0, total: 0 }
  let fillable = 0
  const byRarity = new Map()
  const secretTypes = new Map()   // type secret -> dévoilé ? (une carte possédée)
  for (const r of rows ?? []) {
    if (r.secret) {
      // Les cartes secrètes (numérotées au-delà de la checklist, ex. 4/3) ne comptent pas dans le full set
      secretTypes.set(r.type_id, secretTypes.get(r.type_id) || r.revealed !== false)
      if (r.revealed !== false && r.pick_series == null && Number(r.owned_count) > 0) fillable += 1
      continue
    }
    const rarity = rarityMap[r.rarity_id]
    const filled = r.pick_series != null
    const bucket = isBonus(rarity) ? bonus : base
    bucket.total += 1
    if (filled) bucket.filled += 1
    if (!filled && Number(r.owned_count) > 0) fillable += 1
    const e = byRarity.get(r.rarity_id) ?? { id: r.rarity_id, total: 0, filled: 0, bonus: isBonus(rarity), suffix: specialSuffix(rarity) }
    e.total += 1
    if (filled) e.filled += 1
    byRarity.set(r.rarity_id, e)
  }
  const pct = base.total ? (base.filled / base.total) * 100 : 0
  return {
    base: { ...base, pct, complete: base.total > 0 && base.filled === base.total },
    bonus,
    secrets: { total: secretTypes.size, found: [...secretTypes.values()].filter(Boolean).length },
    fillable,
    byRarity: [...byRarity.values()].sort((a, b) => (rarityMap[b.id]?.sort_order ?? 0) - (rarityMap[a.id]?.sort_order ?? 0)),
  }
}

// cards : sortie de my_type_cards pour (type, rareté) : { series, number, listed, picked, visible }.
// Sélecteur de l'album : toutes les cartes à numéro masqué sont indiscernables, donc UNE seule proposition ; chaque carte à
// numéro visible reste une proposition. Les cartes en vente ne sont pas proposables (une carte de l'album ne se vend pas).
export function pickerEntries(cards) {
  const open = (cards ?? []).filter((c) => !c.listed)
  const hidden = open.filter((c) => !c.visible)
  const entries = []
  if (hidden.length) {
    const picked = hidden.find((c) => c.picked)
    entries.push({ kind: 'stack', key: 'stack', count: hidden.length, card: picked ?? hidden[0], picked: !!picked })
  }
  for (const c of open.filter((x) => x.visible)) {
    entries.push({ kind: 'card', key: `${c.base_rarity}-${c.series}-${c.number}`, count: 1, card: c, picked: !!c.picked })
  }
  return { entries, listedCount: (cards ?? []).length - open.length }
}

// Bilan d'une pile (les cartes à numéro masqué d'un type et d'une rareté) : de quoi proposer la vente rapide.
export function stackInfo(cards) {
  const stack = (cards ?? []).filter((c) => !c.visible)
  const free = stack.filter((c) => !c.listed && !c.picked)
  return {
    total: stack.length,
    listed: stack.filter((c) => c.listed).length,
    inAlbum: stack.filter((c) => c.picked).length,
    free: free.length,
    firstFree: free[0] ?? null,
  }
}

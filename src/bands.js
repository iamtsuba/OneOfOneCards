// Raretés par type (logique « Topps ») : tranches de séries, numéros visibles ou masqués, numéro de checklist.
// Même calcul que les fonctions SQL type_bands / number_visible pour un type qui a ses propres raretés.
// Aucune dépendance : testable seule (tests/bands.test.mjs).

// rows : lignes type_rarities d'UN type {rarity_id, max_series, numbered_series}
// → tranches successives {rarity_id, lo, hi, numbered} : la première couvre 1..max, la suivante max+1..son max, etc.
export function bandsOf(rows, cap = Infinity) {
  // Tri sur la valeur brute ; le plafond (nombre de séries du type) ne s'applique qu'ensuite, comme dans type_bands
  const sorted = [...(rows ?? [])].sort((a, b) => a.max_series - b.max_series || String(a.rarity_id).localeCompare(String(b.rarity_id)))
  let prev = 0
  return sorted.map((r) => {
    const hi = Math.min(r.max_series, cap)
    const band = { rarity_id: r.rarity_id, lo: prev + 1, hi, numbered: r.numbered_series }
    prev = hi
    return band
  })
}

// Le numéro n/m des cartes d'une série de taille m est-il visible ? Faux au-delà des `numbered` premières séries de la
// tranche. Un type sans raretés propres garde des numéros toujours visibles.
export function numberVisible(rows, m) {
  if (!rows || rows.length === 0) return true
  const band = bandsOf(rows).find((b) => m >= b.lo && m <= b.hi)
  return band ? m - band.lo + 1 <= band.numbered : true
}

// Nombre de séries d'un type : le sien, sinon celui de sa catégorie
export const typeSeries = (type, category) => type?.series_count ?? category?.series_count ?? 1

// Numéro de checklist « [k/N] » de chaque type dans sa catégorie : les types normaux de 1 à N (ordre de position),
// les types secrets au-delà (N+1, N+2…), le total restant N (ex. [51/50]).
export function checklistNumbers(types) {
  const byCat = {}
  for (const t of types ?? []) (byCat[t.category_id] ??= []).push(t)
  const out = {}
  for (const list of Object.values(byCat)) {
    list.sort((a, b) => a.position - b.position || a.id - b.id)
    const normal = list.filter((t) => !t.secret)
    normal.forEach((t, i) => { out[t.id] = { no: i + 1, total: normal.length, secret: false } })
    list.filter((t) => t.secret).forEach((t, i) => { out[t.id] = { no: normal.length + i + 1, total: normal.length, secret: true } })
  }
  return out
}

// Seuils par défaut d'un type sans raretés propres : tranches lo..hi, plafonnées au nombre de séries de sa catégorie.
// globalRarities : raretés « à seuil » (max_series null = le reste, toujours la dernière tranche).
export function defaultBands(globalRarities, category) {
  const cap = category?.series_count ?? 1
  const src = (globalRarities ?? []).map((r) => ({ rarity_id: r.id, max_series: r.max_series ?? Infinity, numbered_series: 2147483647 }))
  return bandsOf(src, cap).filter((b) => b.lo <= b.hi)
}

// Validation d'un tableau de raretés en cours d'édition ({rarity_id, max_series, numbered_series} en texte ou nombres),
// mêmes règles que admin_save_type_rarities. Renvoie '' si valide, sinon un message.
export function validateTypeRarities(rows) {
  if (!rows || rows.length === 0) return 'Ajoute au moins une rareté.'
  const ids = new Set()
  const maxes = new Set()
  const parsed = []
  for (const r of rows) {
    const max = Number(r.max_series)
    const num = r.numbered_series === '' || r.numbered_series == null ? 0 : Number(r.numbered_series)
    if (!r.rarity_id) return 'Choisis une rareté pour chaque ligne.'
    if (ids.has(r.rarity_id)) return 'Une même rareté ne peut apparaître qu’une fois.'
    ids.add(r.rarity_id)
    if (!Number.isInteger(max) || max < 1 || max > 5000) return 'La taille de série maximale est un entier entre 1 et 5000.'
    if (maxes.has(max)) return 'Deux raretés ne peuvent pas avoir la même taille de série maximale.'
    maxes.add(max)
    if (!Number.isInteger(num) || num < 0) return 'Le nombre de séries numérotées est un entier, 0 si la rareté n’est pas numérotée.'
    parsed.push({ rarity_id: r.rarity_id, max_series: max, numbered_series: num })
  }
  for (const b of bandsOf(parsed)) {
    if (b.numbered > b.hi - b.lo + 1) return `Une tranche (séries ${b.lo} à ${b.hi}) ne peut pas avoir plus de ${b.hi - b.lo + 1} séries numérotées.`
  }
  return ''
}

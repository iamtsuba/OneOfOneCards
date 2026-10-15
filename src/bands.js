// Raretés par type (logique « Topps »). CHAQUE rareté d'un type a ses propres séries, de 1/1 à max/max (une même série existe donc
// dans plusieurs raretés : ce sont des cartes différentes). Les `numbered` premières séries d'une rareté ont leur numéro n/m
// visible ; les suivantes sont numérotées en interne mais sans numéro visible. Même calcul que les fonctions SQL type_config et
// number_visible. Aucune dépendance : testable seule (tests/bands.test.mjs).

// rows : lignes type_rarities d'UN type {rarity_id, max_series, numbered_series}. base : rareté de base de la carte, m : sa série.
// Le numéro est visible de la série 1 à la série `numbered_series` de CETTE rareté. Sans réglage propre : toujours visible.
export function numberVisible(rows, base, m) {
  if (!rows || rows.length === 0) return true
  const r = rows.find((x) => x.rarity_id === base)
  return r ? m <= r.numbered_series : true
}

// Style d'une carte : « simple » (image dans un cadre, le dessin d'origine) ou « fullart » (l'image couvre toute la carte). Il est réglé
// par rareté d'un type (colonne card_style de type_rarities) ; sans réglage propre, une carte est « simple ».
export const CARD_STYLES = [{ id: 'simple', name: 'Simple' }, { id: 'fullart', name: 'FullArt' }]
export function cardStyle(rows, base) {
  const r = (rows ?? []).find((x) => x.rarity_id === base)
  return r?.card_style === 'fullart' ? 'fullart' : 'simple'
}

// Nombre de séries d'un type : le sien (la plus grande de ses raretés), sinon celui de sa catégorie
export const typeSeries = (type, category) => type?.series_count ?? category?.series_count ?? 1

// Nombre de cartes d'une rareté de smax séries : 1 + 2 + ... + smax
export const cardCount = (smax) => (smax * (smax + 1)) / 2

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

// Réglage par défaut d'un type sans raretés propres : chaque rareté « à seuil » avec son nombre de séries (max_series null = le
// nombre de séries de la catégorie), numéros toujours visibles. globalRarities : raretés « à seuil » de la table rarities.
export function defaultConfig(globalRarities, category) {
  const cap = category?.series_count ?? 1
  return (globalRarities ?? []).map((r) => ({ rarity_id: r.id, max_series: Math.min(r.max_series ?? cap, cap), numbered_series: Infinity }))
}

// Validation d'un tableau de raretés en cours d'édition ({rarity_id, max_series, numbered_series} en texte ou nombres), mêmes
// règles que admin_save_type_rarities. Les raretés sont indépendantes : aucun ordre à respecter ; 0 série = la rareté n'existe pas
// pour ce type. Renvoie '' si valide.
export function validateTypeRarities(rows) {
  if (!rows || rows.length === 0) return 'Ajoute au moins une rareté.'
  const ids = new Set()
  for (const r of rows) {
    const max = Number(r.max_series)
    const num = r.numbered_series === '' || r.numbered_series == null ? 0 : Number(r.numbered_series)
    if (!r.rarity_id) return 'Choisis une rareté pour chaque ligne.'
    if (r.card_style != null && r.card_style !== '' && !CARD_STYLES.some((s) => s.id === r.card_style)) return 'Le style d’une carte est Simple ou FullArt.'
    if (ids.has(r.rarity_id)) return 'Une même rareté ne peut apparaître qu’une fois.'
    ids.add(r.rarity_id)
    if (!Number.isInteger(max) || max < 0 || max > 5000) return 'Le nombre de séries est un entier entre 0 et 5000 (0 = la rareté n’existe pas pour ce type).'
    if (!Number.isInteger(num) || num < 0) return 'Le nombre de séries numérotées est un entier, 0 si la rareté n’est pas numérotée.'
    if (num > max) return `Les séries numérotées (${num}) ne peuvent pas dépasser le nombre de séries (${max}).`
  }
  if (!rows.some((r) => Number(r.max_series) >= 1)) return 'Au moins une rareté doit avoir des séries (tout à 0 = un type sans aucune carte).'
  return ''
}

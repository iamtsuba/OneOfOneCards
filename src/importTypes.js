// Import de types depuis un fichier texte : une ligne par type, colonnes nom ; position ; image ; secret ; raretés.
// Séparateur détecté automatiquement (tabulation, point-virgule ou virgule), guillemets acceptés,
// ligne d'en-tête facultative (ses titres peuvent réordonner les colonnes). Seule dépendance : bands.js (pur), testable seul.
//
// Colonne « raretés » : une rareté par élément, séparés par « | », chacun « rareté:séries[:numérotées[:style]] ».
//   rareté = son identifiant ou son nom (accents et casse ignorés) ; séries = 0 à 5000 (0 = la rareté n'existe pas pour cette carte) ;
//   numérotées = séries au numéro visible (omis = toutes) ; style = simple (défaut) ou fullart.
//   Exemple : Ultra Rare:50:5:fullart|Super Rare:100:1|Commune:500:0
// Photos : matchPhotos() rapproche des fichiers image des types par leur nom de fichier (chat.png -> type « Chat »).
import { CARD_STYLES, validateTypeRarities } from './bands.js'

export const MAX_ROWS = 500
const MAX_NAME = 60
const MAX_EMOJI = 16
const MAX_URL = 2000

const strip = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const HEADER_KEYS = {
  name: ['nom', 'name', 'type', 'types', 'carte', 'libelle'],
  position: ['position', 'pos', 'ordre', 'order', 'rang'],
  image: ['image', 'emoji', 'url', 'adresse', 'illustration', 'visuel'],
  secret: ['secret', 'secrete', 'cache', 'cachee', 'hidden'],
  rarities: ['raretes', 'rarete', 'rarities', 'rarity', 'reglages', 'raretes du type'],
}
const keyOf = (cell) => Object.keys(HEADER_KEYS).find((k) => HEADER_KEYS[k].includes(strip(cell)))

function detectDelimiter(text) {
  const first = text.split('\n').find((l) => l.trim() !== '') ?? ''
  if (first.includes('\t')) return '\t'
  if (first.includes(';')) return ';'
  return ','
}

// Découpe le texte en lignes de cellules (guillemets doublés, séparateurs et retours à la ligne entre guillemets)
function splitRows(text, delim) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  let line = 1
  let start = 1
  const endRow = () => { row.push(cell); rows.push({ cells: row, line: start }); row = []; cell = ''; start = line + 1 }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else { if (c === '\n') line++; cell += c }
    } else if (c === '"' && cell === '') quoted = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n') { endRow(); line++; start = line }
    else cell += c
  }
  if (cell !== '' || row.length) endRow()
  return rows
}

const TRUE_WORDS = ['oui', 'o', 'yes', 'y', 'true', 'vrai', '1', 'x', 'secret']
const FALSE_WORDS = ['', 'non', 'n', 'no', 'false', 'faux', '0']

// Cellule « raretés » -> [{rarity_id, max_series, numbered_series, card_style}] ; rarityList : [{id, name}] des raretés à seuil
function parseRarities(raw, rarityList) {
  const text = raw.trim()
  if (!text) return { rarities: null, error: '' }
  if (!rarityList.length) return { rarities: null, error: 'raretés indisponibles : la liste des raretés n’est pas chargée' }
  const byKey = new Map()
  for (const r of rarityList) { byKey.set(strip(r.id), r.id); byKey.set(strip(r.name), r.id) }
  const out = []
  const errors = []
  for (const part of text.split('|')) {
    if (!part.trim()) continue
    const bits = part.split(':').map((x) => x.trim())
    const id = byKey.get(strip(bits[0]))
    if (!id) { errors.push(`rareté inconnue « ${bits[0]} »`); continue }
    if (!/^\d{1,4}$/.test(bits[1] ?? '')) { errors.push(`${bits[0]} : nombre de séries invalide`); continue }
    const max = Number(bits[1])
    let num = max   // numérotées omis = tous les numéros visibles
    if ((bits[2] ?? '') !== '') {
      if (!/^\d{1,4}$/.test(bits[2])) { errors.push(`${bits[0]} : séries numérotées invalides`); continue }
      num = Number(bits[2])
    }
    let style = 'simple'
    if ((bits[3] ?? '') !== '') {
      const st = strip(bits[3]).replace(/[\s_-]/g, '')
      if (CARD_STYLES.some((x) => x.id === st)) style = st
      else { errors.push(`${bits[0]} : style « ${bits[3]} » inconnu (simple ou fullart)`); continue }
    }
    if (bits.length > 4) { errors.push(`${bits[0]} : trop de champs (rareté:séries:numérotées:style)`); continue }
    out.push({ rarity_id: id, max_series: max, numbered_series: num, card_style: style })
  }
  if (!errors.length) {
    const msg = validateTypeRarities(out)
    if (msg) errors.push(msg)
  }
  return { rarities: errors.length ? null : out, error: errors.join(' ; ') }
}

// Résumé lisible : « Ultra Rare 50 séries (5 numérotées) FullArt · Super Rare 100 séries … »
export function describeRarities(rarities, rarityList = []) {
  const name = (id) => rarityList.find((r) => r.id === id)?.name ?? id
  return (rarities ?? []).filter((r) => r.max_series >= 1)
    .map((r) => `${name(r.rarity_id)} ${r.max_series}${r.numbered_series >= r.max_series ? '' : r.numbered_series > 0 ? `/${r.numbered_series} num.` : ' non num.'}${r.card_style === 'fullart' ? ' FullArt' : ''}`)
    .join(' · ')
}

function checkImage(raw) {
  const image = raw.trim()
  if (image === '') return { image: '', kind: 'none' }
  if (/^https:\/\//i.test(image)) {
    if (/\s/.test(image)) return { image, kind: 'url', error: 'adresse avec des espaces' }
    if (image.length > MAX_URL) return { image, kind: 'url', error: 'adresse trop longue' }
    return { image, kind: 'url' }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(image)) return { image, kind: 'invalid', error: 'adresse non sécurisée : seul https:// est accepté' }
  if ([...image].length > MAX_EMOJI) return { image, kind: 'invalid', error: 'image invalide : un emoji ou une adresse https://' }
  return { image, kind: 'emoji' }
}

// existingNames : noms déjà présents dans la collection (pour prévenir des doublons, ignorés à l'import) ; rarityList : [{id, name}]
export function parseTypesFile(raw, existingNames = [], rarityList = []) {
  const text = String(raw ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const all = splitRows(text, detectDelimiter(text)).filter((r) => r.cells.some((c) => c.trim() !== ''))
  if (all.length === 0) return { rows: [], fileError: 'Le fichier est vide.' }

  // En-tête : si la première ligne contient des titres reconnus, ils fixent l'ordre des colonnes
  let order = ['name', 'position', 'image', 'secret', 'rarities']
  const keys = all[0].cells.map(keyOf)
  if (keys.includes('name')) {
    order = keys.map((k) => k ?? null)
    all.shift()
  }
  if (all.length === 0) return { rows: [], fileError: 'Le fichier ne contient que l’en-tête.' }
  if (all.length > MAX_ROWS) return { rows: [], fileError: `Trop de lignes : ${MAX_ROWS} cartes maximum par import.` }

  const seen = new Set(existingNames.map((n) => n.trim().toLowerCase()))
  const rows = all.map(({ cells, line }) => {
    const get = (k) => (order.includes(k) ? (cells[order.indexOf(k)] ?? '') : '')
    const name = get('name').trim()
    const posRaw = get('position').trim()
    const img = checkImage(get('image'))
    const errors = []
    if (!name) errors.push('nom manquant')
    else if ([...name].length > MAX_NAME) errors.push(`nom trop long (${MAX_NAME} caractères max)`)
    let position = null
    if (posRaw !== '') {
      if (/^\d{1,6}$/.test(posRaw)) position = Number(posRaw)
      else errors.push('position invalide : un nombre entier')
    }
    if (img.error) errors.push(img.error)
    const secRaw = strip(get('secret'))
    let secret = false
    if (TRUE_WORDS.includes(secRaw)) secret = true
    else if (!FALSE_WORDS.includes(secRaw)) errors.push('secret : oui ou non')
    const rar = parseRarities(get('rarities'), rarityList)
    if (rar.error) errors.push(rar.error)
    const key = name.toLowerCase()
    const duplicate = !errors.length && seen.has(key)
    if (!errors.length) seen.add(key)
    return { line, name, position, image: img.image, kind: img.kind, secret, rarities: rar.rarities, error: errors.join(' ; '), duplicate }
  })
  return { rows, fileError: '' }
}

// Rapproche des photos des types par leur nom de fichier (extension, accents, casse, _ - ignorés) : « Chat_Va.png » -> « Chat va ».
// files : [{name}] ; rows : lignes lues du fichier de types (celles en erreur ou déjà présentes sont écartées) ; existingTypes : [{id, name}].
// Une photo qui correspond à un type déjà présent met à jour sa photo ; deux photos pour le même type : la 2e est signalée.
export const photoKey = (fileName) => strip(String(fileName).replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_\-.]+/g, ' ')).replace(/\s+/g, ' ')
export function matchPhotos(files, rows = [], existingTypes = []) {
  const rowByKey = new Map(rows.filter((r) => !r.error && !r.duplicate).map((r) => [photoKey(r.name), r]))
  const existingByKey = new Map(existingTypes.map((t) => [photoKey(t.name), t]))
  const used = new Set()
  return files.map((f) => {
    const key = photoKey(f.name)
    let target = null
    if (rowByKey.has(key)) target = { kind: 'row', line: rowByKey.get(key).line, name: rowByKey.get(key).name }
    else if (existingByKey.has(key)) target = { kind: 'existing', id: existingByKey.get(key).id, name: existingByKey.get(key).name }
    const id = target ? `${target.kind}:${target.line ?? target.id}` : ''
    const duplicate = !!id && used.has(id)
    if (id) used.add(id)
    return { name: f.name, key, target, duplicate }
  })
}

// Modèle téléchargeable (BOM pour qu'Excel affiche bien les accents et les emojis). Le modèle simple (3 colonnes) reste lisible sans la
// liste des raretés ; makeTemplate(raretés) produit un modèle complet avec des exemples faits des raretés réelles du jeu.
export const TEMPLATE_CSV =
  '\uFEFFnom;position;image\r\nFootball;1;⚽\r\nBasketball;2;🏀\r\nTennis;3;https://exemple.com/tennis.png\r\n'
export function makeTemplate(rarityList = []) {
  const id = (i, d) => rarityList[i]?.name ?? d
  const [a, b, c] = [id(0, 'Ultra Rare'), id(1, 'Super Rare'), id(rarityList.length - 1, 'Commune')]
  return '\uFEFFnom;position;image;secret;raretés\r\n'
    + `Football;1;⚽;non;${a}:50:5:fullart|${b}:100:1|${c}:500:0\r\n`
    + `Basketball;2;🏀;;${a}:50|${c}:300:30\r\n`
    + `Tennis;3;https://exemple.com/tennis.png;oui;${a}:20:20:fullart\r\n`
    + 'Rugby;4;;;\r\n'
}

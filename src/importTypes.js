// Import de types depuis un fichier texte : une ligne par type, colonnes nom ; position ; image.
// Séparateur détecté automatiquement (tabulation, point-virgule ou virgule), guillemets acceptés,
// ligne d'en-tête facultative (ses titres peuvent réordonner les colonnes). Aucune dépendance : testable seule.

export const MAX_ROWS = 500
const MAX_NAME = 60
const MAX_EMOJI = 16
const MAX_URL = 2000

const strip = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const HEADER_KEYS = {
  name: ['nom', 'name', 'type', 'types', 'carte', 'libelle'],
  position: ['position', 'pos', 'ordre', 'order', 'rang'],
  image: ['image', 'emoji', 'url', 'adresse', 'illustration', 'visuel'],
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

// existingNames : noms déjà présents dans la catégorie (pour prévenir des doublons, ignorés à l'import)
export function parseTypesFile(raw, existingNames = []) {
  const text = String(raw ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const all = splitRows(text, detectDelimiter(text)).filter((r) => r.cells.some((c) => c.trim() !== ''))
  if (all.length === 0) return { rows: [], fileError: 'Le fichier est vide.' }

  // En-tête : si la première ligne contient des titres reconnus, ils fixent l'ordre des colonnes
  let order = ['name', 'position', 'image']
  const keys = all[0].cells.map(keyOf)
  if (keys.includes('name')) {
    order = keys.map((k) => k ?? null)
    all.shift()
  }
  if (all.length === 0) return { rows: [], fileError: 'Le fichier ne contient que l’en-tête.' }
  if (all.length > MAX_ROWS) return { rows: [], fileError: `Trop de lignes : ${MAX_ROWS} types maximum par import.` }

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
    const key = name.toLowerCase()
    const duplicate = !errors.length && seen.has(key)
    if (!errors.length) seen.add(key)
    return { line, name, position, image: img.image, kind: img.kind, error: errors.join(' ; '), duplicate }
  })
  return { rows, fileError: '' }
}

// Modèle téléchargeable (BOM pour qu'Excel affiche bien les accents et les emojis)
export const TEMPLATE_CSV =
  '\uFEFFnom;position;image\r\nFootball;1;⚽\r\nBasketball;2;🏀\r\nTennis;3;https://exemple.com/tennis.png\r\n'

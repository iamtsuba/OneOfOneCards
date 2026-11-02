// Préchargement des images des cartes (elles viennent du stockage de fichiers : sans préchargement, une carte tirée met 1 à 2 s à apparaître).
// Les fichiers sont servis avec un cache d'un an et ne changent jamais d'adresse : une fois chargée, une image est instantanée aux visites suivantes.
const isUrl = (v) => typeof v === 'string' && v.startsWith('https://')
const loading = new Map()   // adresse -> promesse (une seule demande par image)
const makeImage = () => (typeof Image === 'undefined' ? null : new Image())

// Charge une image (et la décode) pour qu'elle soit prête quand on l'affiche. Ne rejette jamais : en cas d'échec on pourra réessayer plus tard.
export function preloadImage(url, { make = makeImage } = {}) {
  if (!isUrl(url)) return Promise.resolve()
  if (loading.has(url)) return loading.get(url)
  const img = make()
  if (!img) return Promise.resolve()
  const p = new Promise((resolve) => {
    img.decoding = 'async'
    img.onload = () => { (typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve()).then(resolve) }
    img.onerror = () => { loading.delete(url); resolve() }
    img.src = url
  })
  loading.set(url, p)
  return p
}
export const preloadImages = (urls, opts) => Promise.all([...new Set((urls ?? []).filter(isUrl))].map((u) => preloadImage(u, opts)))

// Chauffe le cache en tâche de fond : quelques images à la fois, sans gêner l'écran
export function warmImages(urls, { concurrency = 3, make } = {}) {
  const queue = [...new Set((urls ?? []).filter(isUrl))]
  let active = 0
  const next = () => {
    while (active < concurrency && queue.length) {
      active++
      preloadImage(queue.shift(), { make }).finally(() => { active--; next() })
    }
  }
  next()
}

// Images d'une collection : la sienne (booster) et celles de ses cartes
export function collectionImageUrls(catalog, categoryId) {
  if (!catalog || categoryId == null) return []
  const cat = catalog.categoryMap?.[categoryId] ?? (catalog.categories ?? []).find((c) => c.id === categoryId)
  const types = (catalog.types ?? []).filter((t) => t.category_id === categoryId)
  return [...new Set([cat?.image, ...types.map((t) => t.image)].filter(isUrl))]
}

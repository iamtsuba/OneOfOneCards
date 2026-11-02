// Images des cartes et des collections : stockées comme FICHIERS dans le bucket public « o1ocards-images » (servi avec un cache d'un an),
// et non plus comme texte dans la base (chaque visite les retéléchargeait). Un dossier par environnement : pp/ (préproduction) et prod/ (production).
// Le nom du fichier est l'empreinte de son contenu : la même image envoyée deux fois donne la même adresse, et une adresse ne change jamais de contenu (cache sans risque).
import { supabase } from './supabase'
import { IS_PREPROD } from './env'

export const IMAGE_BUCKET = 'o1ocards-images'
export const IMAGE_FOLDER = IS_PREPROD ? 'pp' : 'prod'
const EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' }

// Image encore enregistrée dans la base (data:image/...) / image déjà dans le stockage
export const isEmbedded = (v) => typeof v === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(v)
export const isStored = (v) => typeof v === 'string' && v.startsWith('https://') && v.includes(`/storage/v1/object/public/${IMAGE_BUCKET}/`)

// data:image/webp;base64,... -> Blob (sans passer par fetch)
export function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl || '')
  if (!m) throw new Error('invalid_image')
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: m[1] })
}

async function digest(blob) {
  const buf = await blob.arrayBuffer()
  const d = await globalThis.crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

// Erreurs du stockage -> codes que le site sait expliquer
function storageError(error) {
  const status = String(error?.statusCode ?? error?.status ?? '')
  const msg = String(error?.message ?? '')
  if (/bucket not found/i.test(msg) || status === '404') return new Error('storage_not_ready')
  if (/row-level security|unauthorized|not authorized|permission/i.test(msg) || status === '403' || status === '401') return new Error('storage_denied')
  if (status === '413' || /too large|exceeded/i.test(msg)) return new Error('image_too_large')
  if (status === '415' || /mime|not supported/i.test(msg)) return new Error('invalid_image')
  return new Error('storage_failed')
}
const isDuplicate = (error) => String(error?.statusCode ?? error?.status ?? '') === '409' || /already exists|duplicate/i.test(String(error?.message ?? ''))

// Envoie une image dans le stockage (réservé au compte administrateur) et renvoie son adresse publique https
export async function uploadImage(blob, kind = 'types', storage = supabase.storage) {
  const type = blob.type
  if (!EXT[type]) throw new Error('invalid_image')   // seuls webp, png, jpeg et gif sont acceptés (pas de SVG : il pourrait contenir du code)
  const path = `${IMAGE_FOLDER}/${kind}/${await digest(blob)}.${EXT[type]}`
  const bucket = storage.from(IMAGE_BUCKET)
  const { error } = await bucket.upload(path, blob, { contentType: type, cacheControl: '31536000', upsert: false })
  if (error && !isDuplicate(error)) throw storageError(error)   // déjà présent = même contenu : on réutilise l'adresse
  return bucket.getPublicUrl(path).data.publicUrl
}

// Migration : déplace les images intégrées (collections puis cartes) vers le stockage, une par une. items : [{ kind: 'type' | 'category', id, name, image }].
// Une image qui échoue est notée et on continue ; une erreur qui touchera toutes les suivantes (mot de passe admin refusé, stockage absent ou interdit) interrompt tout.
const FATAL = /admin_|not_authenticated|storage_not_ready|storage_denied/
const defaultToUrl = (it) => uploadImage(dataUrlToBlob(it.image), it.kind === 'category' ? 'categories' : 'types')
export async function migrateEmbeddedImages(items, { toUrl = defaultToUrl, save, onProgress = () => {} }) {
  const failed = []
  let ok = 0
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    try {
      const url = await toUrl(it)
      await save(it, url)
      ok++
    } catch (e) {
      if (FATAL.test(String(e?.message ?? e))) throw e
      failed.push({ kind: it.kind, id: it.id, name: it.name, error: String(e?.message ?? e) })
    }
    onProgress({ done: i + 1, total: items.length, failed: [...failed] })
  }
  return { ok, failed }
}

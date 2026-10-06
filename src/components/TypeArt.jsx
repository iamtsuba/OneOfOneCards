// Illustration d'un type de carte : une image (adresse https ou image intégrée) ou un emoji
export const isImage = (v) => typeof v === 'string' && (v.startsWith('https://') || v.startsWith('data:image/'))

export default function TypeArt({ type, className = '' }) {
  if (!type) return <span className={`type-art ${className}`} aria-hidden="true">?</span>
  return isImage(type.image) ? (
    <img className={`type-art ${className}`} src={type.image} alt="" loading="lazy" draggable="false" />
  ) : (
    <span className={`type-art ${className}`} aria-hidden="true">{type.image || '🃏'}</span>
  )
}

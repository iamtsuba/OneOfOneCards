import { isFoil } from '../rarity'

// Carte numérotée. Les couleurs viennent de la table opennumber_rarities.
export default function Card({ series, number, rarity, quantity = 1, size = 'md', isNew = false, glow = false, shine = false, onClick }) {
  const style = rarity ? { '--c1': rarity.color, '--c2': rarity.color2, '--ct': rarity.text_color } : undefined
  const digits = String(number).length
  const cls = ['card', size, isFoil(rarity) ? 'foil' : '', glow ? 'glow' : '', shine ? 'shine' : '', onClick ? 'clickable' : '']
    .filter(Boolean)
    .join(' ')
  const label = `${rarity?.name ?? 'Carte'} ${number} sur ${series}${quantity > 1 ? `, ${quantity} exemplaires` : ''}`
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={cls} style={style} onClick={onClick} aria-label={label} type={onClick ? 'button' : undefined}>
      <div className="card-face" data-d={digits >= 4 ? 4 : digits}>
        <span className="card-rarity">{rarity?.name}</span>
        <div className="card-num">
          <span className="n">{number}</span>
          <span className="m">/ {series}</span>
        </div>
        {isNew && <span className="card-new">Nouvelle</span>}
        {quantity > 1 && <span className="card-qty">×{quantity}</span>}
      </div>
    </Tag>
  )
}

export function CardBack() {
  return (
    <div className="card">
      <div className="card-face card-back-face">
        <span className="back-mark">1/1</span>
        <span className="back-name">OneOfOne Pack</span>
      </div>
    </div>
  )
}

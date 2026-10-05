import { isSpecial } from '../rarity'

const MINE = { '--c1': '#3fcf8e', '--c2': '#12804f', '--ct': '#ffffff' }

// Carte numérotée. Les couleurs viennent de la table opennumber_rarities.
// tone : 'mine' (verte, à moi) | 'taken' (transparente, tirée par un autre joueur)
export default function Card({ series, number, rarity, size = 'md', tone, listed = false, glow = false, shine = false, onClick }) {
  let style = rarity ? { '--c1': rarity.color, '--c2': rarity.color2, '--ct': rarity.text_color } : undefined
  if (tone === 'mine') style = { ...style, ...MINE }
  const digits = String(number).length
  const cls = ['card', size, tone || '', !tone && isSpecial(rarity) ? 'foil' : '', glow ? 'glow' : '', shine ? 'shine' : '', onClick ? 'clickable' : '']
    .filter(Boolean)
    .join(' ')
  const state = tone === 'mine' ? ', à toi' : tone === 'taken' ? ', déjà tirée par un autre joueur' : ''
  const label = `${rarity?.name ?? 'Carte'} ${number} sur ${series}${state}${listed ? ', en vente' : ''}`
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={cls} style={style} onClick={onClick} aria-label={label} type={onClick ? 'button' : undefined}>
      <div className="card-face" data-d={digits >= 4 ? 4 : digits}>
        <span className="card-rarity">{rarity?.name}</span>
        {tone === 'mine' && rarity && (
          <i className="card-dot" title={rarity.name} style={{ background: `linear-gradient(135deg, ${rarity.color}, ${rarity.color2})` }} />
        )}
        <div className="card-num">
          <span className="n">{number}</span>
          <span className="m">/ {series}</span>
        </div>
        {listed && <span className="card-listed">En vente</span>}
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

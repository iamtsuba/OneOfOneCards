import { isSpecial } from '../rarity'
import { useGame } from '../game'
import TypeArt from './TypeArt'

const MINE = { '--c1': '#3fcf8e', '--c2': '#12804f', '--ct': '#ffffff' }

// Carte numérotée : couleur de la catégorie en fond, cadre et bandeau à la couleur de la rareté,
// illustration du type au centre, numérotation en bas.
// tone : 'mine' (verte, à moi) | 'taken' (transparente, tirée par un autre joueur)
export default function Card({ typeId, series, number, rarity, size = 'md', tone, listed = false, glow = false, shine = false, onClick }) {
  const game = useGame()
  const type = game?.catalog?.typeMap?.[typeId]
  const category = type ? game.catalog.categoryMap[type.category_id] : null

  let style = {
    '--c1': category?.color ?? '#f3efe6', '--c2': category?.color2 ?? '#cfc8b8', '--ct': category?.text_color ?? '#3a3630',
    '--r1': rarity?.color ?? '#cfc8b8', '--r2': rarity?.color2 ?? '#9a917f', '--rt': rarity?.text_color ?? '#3a3630',
  }
  if (tone === 'mine') style = { ...style, ...MINE }
  const cls = ['card', size, tone || '', !tone && isSpecial(rarity) ? 'foil' : '', glow ? 'glow' : '', shine ? 'shine' : '', onClick ? 'clickable' : '']
    .filter(Boolean)
    .join(' ')
  const state = tone === 'mine' ? ', à toi' : tone === 'taken' ? ', déjà tirée par un autre joueur' : ''
  const label = `${type?.name ?? 'Carte'}, ${rarity?.name ?? ''} ${number} sur ${series}${state}${listed ? ', en vente' : ''}`
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={cls} style={style} onClick={onClick} aria-label={label} type={onClick ? 'button' : undefined}>
      <div className="card-face">
        <span className="card-rarity">{rarity?.name}</span>
        <div className="card-art"><TypeArt type={type} /></div>
        <span className="card-type">{type?.name}</span>
        <div className="card-num">
          <span className="n">{number}</span>
          <span className="m">/ {series}</span>
        </div>
        {listed && <span className="card-listed">En vente</span>}
      </div>
    </Tag>
  )
}

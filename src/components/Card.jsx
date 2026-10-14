import { isSpecial } from '../rarity'
import { useGame } from '../game'
import TypeArt from './TypeArt'

// Carte numérotée : couleur entièrement déterminée par la rareté (pas par la catégorie/le booster),
// illustration du type au centre, numérotation en bas.
// tone : 'mine' (fond vert, à moi — le cadre et le bandeau restent à la couleur de la rareté) | 'taken' (tirée par un autre joueur)
export default function Card({ typeId, series, number, rarity, size = 'md', tone, listed = false, favorite = false, glow = false, shine = false, onClick }) {
  const game = useGame()
  const type = game?.catalog?.typeMap?.[typeId]
  const hidden = !!game?.catalog?.numberHidden?.(typeId, series)   // numéro n/m masqué pour cette rareté
  const setNo = game?.catalog?.checklist?.(typeId)                // numéro de checklist du type, ex. n° 2/50

  const style = {
    '--r1': rarity?.color ?? '#cfc8b8', '--r2': rarity?.color2 ?? '#9a917f', '--rt': rarity?.text_color ?? '#3a3630',
  }
  const cls = ['card', size, tone || '', !tone && isSpecial(rarity) ? 'foil' : '', glow ? 'glow' : '', shine ? 'shine' : '', onClick ? 'clickable' : '']
    .filter(Boolean)
    .join(' ')
  const state = tone === 'mine' ? ', à toi' : tone === 'taken' ? ', déjà tirée par un autre joueur' : ''
  const label = `${type?.name ?? 'Carte'}, ${rarity?.name ?? ''}${hidden ? '' : ` ${number} sur ${series}`}${setNo ? `, n° ${setNo.no} sur ${setNo.total}` : ''}${state}${listed ? ', en vente' : ''}${favorite ? ', favorite' : ''}`
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={cls} style={style} onClick={onClick} aria-label={label} type={onClick ? 'button' : undefined}>
      <div className="card-face">
        <span className="card-rarity">{rarity?.name}</span>
        <div className="card-art"><TypeArt type={type} /></div>
        <span className="card-type">{type?.name}</span>
        {setNo && <span className="card-setno">n° {setNo.no}/{setNo.total}</span>}
        {!hidden && (
          <div className="card-num">
            <span className="n">{number}</span>
            <span className="m">/ {series}</span>
          </div>
        )}
        {listed && <span className="card-listed">En vente</span>}
        {favorite && <span className="card-favorite" aria-hidden="true">♥</span>}
      </div>
    </Tag>
  )
}

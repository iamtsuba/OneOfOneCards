import { isSpecial } from '../rarity'
import { useGame } from '../game'
import TypeArt from './TypeArt'

// Carte numérotée : couleur entièrement déterminée par la rareté (pas par la catégorie/le booster).
// De haut en bas : rareté, numéro n/m en jaune cerné avec zéro devant (07/10 ; masqué selon la rareté), grande
// illustration du type, nom du type, numéro de checklist du type en bas à gauche (ex. 1/2).
// tone : 'mine' (fond vert, à moi — le cadre et le bandeau restent à la couleur de la rareté) | 'taken' (tirée par un autre joueur)
export default function Card({ typeId, base, series, number, rarity, size = 'md', tone, listed = false, favorite = false, isNew = false, count = 0, inAlbum = false, glow = false, shine = false, onClick }) {
  const game = useGame()
  const type = game?.catalog?.typeMap?.[typeId]
  const hidden = !!game?.catalog?.numberHidden?.(typeId, base, series)   // numéro n/m masqué pour cette rareté
  const setNo = game?.catalog?.checklist?.(typeId)                // numéro de checklist du type, ex. n° 2/50

  const style = {
    '--r1': rarity?.color ?? '#cfc8b8', '--r2': rarity?.color2 ?? '#9a917f', '--rt': rarity?.text_color ?? '#3a3630',
  }
  const cls = ['card', size, tone || '', hidden ? 'nonum' : '', !tone && isSpecial(rarity) ? 'foil' : '', glow ? 'glow' : '', shine ? 'shine' : '', onClick ? 'clickable' : '']
    .filter(Boolean)
    .join(' ')
  const state = tone === 'mine' ? ', à toi' : tone === 'taken' ? ', déjà tirée par un autre joueur' : ''
  const label = `${type?.name ?? 'Carte'}, ${rarity?.name ?? ''}${hidden ? '' : ` ${number} sur ${series}`}${setNo ? `, n° ${setNo.no} sur ${setNo.total}` : ''}${state}${listed ? ', en vente' : ''}${favorite ? ', favorite' : ''}${isNew ? ', nouvelle carte' : ''}${count > 1 ? `, pile de ${count} cartes` : ''}${inAlbum ? ', dans ton album' : ''}`
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={cls} style={style} onClick={onClick} aria-label={label} type={onClick ? 'button' : undefined}>
      <div className="card-face">
        <span className="card-rarity">{rarity?.name}</span>
        {!hidden && (
          <div className="card-num">{String(number).padStart(String(series).length, '0')}/{series}</div>
        )}
        <div className="card-art"><TypeArt type={type} /></div>
        <span className="card-type">{type?.name}</span>
        {setNo && <span className="card-setno">{setNo.no}/{setNo.total}</span>}
        {listed ? <span className="card-listed">En vente</span> : inAlbum && <span className="card-listed card-inalbum">Album</span>}
        {favorite && <span className="card-favorite" aria-hidden="true">♥</span>}
      </div>
      {count > 1 && <span className="card-count" aria-hidden="true">{count}</span>}
      {isNew && (
        // Nouvelle carte pour l'album (ce type dans cette rareté, qu'on n'avait pas) : petite étoile qui scintille au-dessus
        <span className="card-new-star" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 2.2l2.9 6.5 7.1.7-5.3 4.8 1.5 7-6.2-3.7-6.2 3.7 1.5-7L2 9.4l7.1-.7z" /></svg>
        </span>
      )}
    </Tag>
  )
}

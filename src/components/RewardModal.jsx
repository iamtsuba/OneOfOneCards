import { useGame } from '../game'
import TypeArt from './TypeArt'

// Annonce : une ou plusieurs séries viennent d'être complétées, un pack doré est débloqué par série
export default function RewardModal({ rewards, onClose }) {
  const { catalog } = useGame()
  const n = rewards.length
  return (
    <div className="legal-overlay" role="dialog" aria-modal="true" aria-label="Série complétée">
      <div className="legal-panel consent reward">
        <h2>{n > 1 ? `${n} séries complétées !` : 'Série complétée !'}</h2>
        <ul className="reward-list">
          {rewards.map((r) => {
            const type = catalog.typeMap[r.type_id]
            return (
              <li key={`${r.type_id}-${r.series}`}>
                <span className="reward-art"><TypeArt type={type} /></span>
                <span>
                  <strong>{type?.name ?? 'Type'}</strong>
                  <small>série de {r.series} cartes, toutes à toi</small>
                </span>
              </li>
            )
          })}
        </ul>
        <p>
          Tu es le premier joueur à la compléter : {n > 1 ? `${n} packs dorés sont` : 'un pack doré est'} débloqué{n > 1 ? 's' : ''}.
          Il contient 1 Alpha, 1 Omega, 1 Ultra Rare, 1 Super Rare et 1 Rare.
        </p>
        <div className="row">
          <button className="btn gold" onClick={() => onClose(true)}>Ouvrir mon pack doré</button>
          <button className="btn ghost" onClick={() => onClose(false)}>Plus tard</button>
        </div>
      </div>
    </div>
  )
}

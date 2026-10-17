import { useGame } from '../game'
import TypeArt from './TypeArt'

// Annonce : tous les emplacements d'une ou plusieurs cartes sont remplis dans l'album, un booster Gold est gagné par carte
export default function GoldRewardModal({ rewards, onClose }) {
  const { catalog } = useGame()
  const n = rewards.length
  return (
    <div className="legal-overlay" role="dialog" aria-modal="true" aria-label="Carte complétée">
      <div className="legal-panel consent reward">
        <h2>{n > 1 ? `${n} cartes complétées !` : 'Carte complétée !'}</h2>
        <ul className="reward-list">
          {rewards.map((r) => {
            const type = catalog.typeMap[r.type_id]
            return (
              <li key={r.id}>
                <span className="reward-art"><TypeArt type={type} /></span>
                <span>
                  <strong>{type?.name ?? 'Carte'}</strong>
                  <small>tous les emplacements de l’album sont remplis</small>
                </span>
              </li>
            )
          })}
        </ul>
        <p>{n > 1 ? `${n} boosters Gold sont débloqués.` : 'Un booster Gold est débloqué.'} Il contient 3 Rares, 1 Super Rare et une carte spéciale.</p>
        <div className="row">
          <button type="button" className="btn gold" onClick={() => onClose(true)}>Voir mon booster Gold</button>
          <button type="button" className="btn ghost" onClick={() => onClose(false)}>Plus tard</button>
        </div>
      </div>
    </div>
  )
}

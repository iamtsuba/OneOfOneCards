import { useGame } from '../game'
import TypeArt from './TypeArt'

// Annonce : tous les emplacements d'une ou plusieurs cartes sont remplis dans l'album.
// Nouveau mode : un booster (Premium…) est offert pour chaque carte, LIÉ à la collection de la carte (rewards = status.reward_notices).
// Ancien mode (aucun booster de récompense choisi) : un booster Gold à ouvrir est débloqué (rewards = status.gold_rewards).
export default function GoldRewardModal({ rewards, onClose }) {
  const { catalog, status } = useGame()
  const granted = rewards.length > 0 && rewards.every((r) => !!r.booster_name)
  const name = granted ? rewards[0].booster_name : status?.reward_booster?.name ?? 'Gold'
  const n = rewards.length
  const collections = [...new Set(rewards.map((r) => catalog.categoryMap?.[r.category_id ?? catalog.typeMap[r.type_id]?.category_id]?.name).filter(Boolean))]
  return (
    <div className="legal-overlay" role="dialog" aria-modal="true" aria-label="Carte complétée">
      <div className="legal-panel consent reward">
        <h2>{n > 1 ? `${n} cartes complétées !` : 'Carte complétée !'}</h2>
        <ul className="reward-list">
          {rewards.map((r) => {
            const type = catalog.typeMap[r.type_id]
            const coll = catalog.categoryMap?.[r.category_id ?? type?.category_id]?.name
            return (
              <li key={r.id}>
                <span className="reward-art"><TypeArt type={type} /></span>
                <span>
                  <strong>{type?.name ?? 'Carte'}</strong>
                  <small>tous les emplacements de l’album sont remplis{granted && coll ? ` · ${coll}` : ''}</small>
                </span>
              </li>
            )
          })}
        </ul>
        {granted ? (
          <p>{n > 1 ? `${n} boosters ${name} te sont offerts` : `Un booster ${name} t’est offert`}{collections.length === 1 ? ` pour la collection « ${collections[0]} »` : ' pour leurs collections'}. Il s’ouvre dans cette collection.</p>
        ) : (
          <p>{n > 1 ? `${n} boosters ${name} sont débloqués.` : `Un booster ${name} est débloqué.`}</p>
        )}
        <div className="row">
          <button type="button" className="btn gold" onClick={() => onClose(true)}>Voir mon booster {name}</button>
          <button type="button" className="btn ghost" onClick={() => onClose(false)}>Plus tard</button>
        </div>
      </div>
    </div>
  )
}

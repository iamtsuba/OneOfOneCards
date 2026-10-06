import { useEffect, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { useGame, fmt, fmtOdds } from '../game'

// Chances de tirage de la catégorie en cours, calculées par le serveur sur les cartes encore disponibles
export default function Odds({ category }) {
  const { rarityMap, status } = useGame()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const taken = status?.cards_taken

  useEffect(() => {
    if (!open || !category) return
    let cancelled = false
    api.getOdds(category.id).then((d) => !cancelled && setData(d)).catch((e) => !cancelled && setError(explain(e)))
    return () => { cancelled = true }
    // on relit les chances quand des cartes ont été tirées depuis
  }, [open, category?.id, taken])

  const golden = data?.golden
  const goldenList = (golden?.contents ?? [])
    .map((c) => `${c.quantity} ${rarityMap[c.rarity_id]?.name ?? c.rarity_id}`)
    .join(', ')

  return (
    <details className="odds" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Chances de tirage</summary>
      {error && <p className="msg error" role="alert">{error}</p>}
      {open && !data && !error && <p className="muted">Chargement…</p>}
      {data && (
        <>
          <p className="fine">
            Pour un booster de {data.cards_per_booster} cartes « {category.name} » : chance d’y trouver au moins une carte de chaque rareté,
            calculée sur les cartes encore disponibles.
          </p>
          <ul className="odds-list">
            {data.by_rarity.map((r) => {
              const rar = rarityMap[r.id]
              return (
                <li key={r.id} className={r.remaining === 0 ? 'gone' : ''}>
                  <i className="dot" style={{ '--dot': rar?.color, '--dot2': rar?.color2 }} />
                  <span className="odds-name">{rar?.name ?? r.id}</span>
                  <span className="odds-val">{r.remaining === 0 ? 'épuisée' : fmtOdds(r.per_booster)}</span>
                  <span className="odds-left">{fmt(r.remaining)} cartes restantes sur {fmt(r.total)}</span>
                </li>
              )
            })}
          </ul>
          {golden && (
            <p className="fine">
              Booster doré : {golden.chance > 0 ? fmtOdds(golden.chance) : 'désactivé'} par booster
              {goldenList ? `, il contient ${goldenList}` : ''}.
            </p>
          )}
          <p className="fine">
            {data.exponent === 0
              ? 'Chaque carte encore disponible a la même chance d’être tirée : une rareté qui compte peu de cartes sort rarement.'
              : 'Les cartes des petites séries ont moins de chances d’être tirées que celles des grandes séries.'}
            {' '}Ces chances évoluent à mesure que les cartes sont tirées.
          </p>
        </>
      )}
    </details>
  )
}

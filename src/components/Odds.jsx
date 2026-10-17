import { useEffect, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { useGame, fmt, fmtShare } from '../game'

// Contenu de l'encart : composition d'un booster carte par carte (raretés possibles et chances), part de chaque rareté (sans appel réseau : testable seul)
export function OddsBody({ data, category, rarityMap }) {
  const golden = data.golden
  const goldenList = (golden?.contents ?? []).map((c) => `${c.quantity} ${rarityMap[c.rarity_id]?.name ?? c.rarity_id}`).join(', ')
  const slots = data.slots
  const opts = data.slot_options ?? {}
  const name = (id) => rarityMap[id]?.name ?? id
  // « Carte 1 », « Cartes 1 à 3 » : numéros des cartes de chaque type d'emplacement, dans l'ordre du tirage
  const lines = []
  if (slots) {
    let from = 1
    for (const [cls, n] of [['common', slots.common], ['uncommon', slots.uncommon], ['premium', slots.premium]]) {
      if (n > 0) {
        lines.push({ cls, label: n === 1 ? `Carte ${from}` : `Cartes ${from} à ${from + n - 1}`, options: opts[cls] ?? [] })
        from += n
      }
    }
  }
  return (
    <>
      {lines.length > 0 && (
        <ul className="odds-slots" aria-label="Composition d’un booster">
          {lines.map((l) => (
            <li key={l.cls}>
              <strong>{l.label}</strong>
              <span>
                {l.options.length === 0 && 'au hasard parmi les cartes restantes'}
                {l.options.length === 1 && name(l.options[0].id)}
                {l.options.length > 1 && l.options.map((o) => `${name(o.id)} ${fmtShare(o.p)}`).join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="fine">
        Part de chaque rareté parmi les cartes tirées de « {category.name} » ({fmt(data.pool_left)} cartes encore disponibles).
      </p>
      <ul className="odds-list">
        {data.by_rarity.map((r) => {
          const rar = rarityMap[r.id]
          return (
            <li key={r.id} className={r.remaining === 0 ? 'gone' : ''}>
              <i className="dot" style={{ '--dot': rar?.color, '--dot2': rar?.color2 }} />
              <span className="odds-name">{rar?.name ?? r.id}</span>
              <span className="odds-val">{r.remaining === 0 ? 'épuisée' : fmtShare(r.share)}</span>
              <span className="odds-left">{fmt(r.remaining)} cartes restantes sur {fmt(r.total)}</span>
            </li>
          )
        })}
      </ul>
      {golden && golden.chance > 0 && (
        <p className="fine">
          Booster doré : {fmtShare(golden.chance)} par booster{goldenList ? `, il contient ${goldenList}` : ''}.
          {golden.unique_chance > 0 && ` Et ${fmtShare(golden.unique_chance)} de chances d’avoir en plus une carte Unique (1/1) !`}
        </p>
      )}
      <p className="fine">
        {data.exponent === 0 ? 'Dans une rareté, chaque carte restante a la même chance.' : 'Les petites séries ont moins de chances que les grandes.'} Si une rareté est épuisée, la carte est
        tirée parmi toutes celles qui restent.
      </p>
    </>
  )
}

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

  return (
    <details className="odds" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Chances de tirage</summary>
      {error && <p className="msg error" role="alert">{error}</p>}
      {open && !data && !error && <p className="muted">Chargement…</p>}
      {data && <OddsBody data={data} category={category} rarityMap={rarityMap} />}
    </details>
  )
}

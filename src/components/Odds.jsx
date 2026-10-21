import { useEffect, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { useGame, fmt, fmtShare } from '../game'
import { InfoButton, InfoSheet } from './Collection'

// Chance lisible : 100 %, 99,9 %, 55 %, 5,8 %, 0,8 %, 0,04 % (jamais de zéros inutiles)
export function fmtOdds(p) {
  const pct = p * 100
  if (pct >= 99.95) return '100 %'
  const digits = pct >= 1 ? 1 : pct >= 0.1 ? 2 : 3
  return `${pct.toLocaleString('fr-FR', { maximumFractionDigits: digits })} %`
}

const SPECIAL = ['unique', 'alpha', 'omega']
// Couleurs d'une rareté (comme sur les cartes) pour une pastille, une mini-carte ou un segment de barre
const tone = (r) => ({ '--r1': r?.color ?? '#d9d4c5', '--r2': r?.color2 ?? r?.color ?? '#b5ad99', '--rt': r?.text_color ?? '#222' })

// Encart concis : une ligne par carte du booster avec la chance de chaque rareté (calculée sur les cartes réellement restantes), les cartes spéciales
// par booster, le stock. Le détail (parts par rareté, règles, booster doré) est derrière le bouton « i ». Sans appel réseau : testable seul.
export function OddsBody({ data, category, rarityMap, initialInfo = false, compact = false }) {
  const [info, setInfo] = useState(initialInfo)
  const slots = data.slots
  const name = (id) => rarityMap[id]?.name ?? id
  // chance par rareté AFFICHÉE pour chaque carte du booster (serveur récent : data.positions) ; sinon par type d'emplacement (serveurs précédents)
  // en dessous de 0,1 %, la rareté n'est pas affichée sur la ligne (elle est dans « Par booster »)
  const entriesOf = (mix) => (mix ?? []).filter((o) => o.p >= 0.001)
  const mixOf = (cls) => data.slot_mix?.[cls] ?? data.slot_options?.[cls] ?? []
  let lines = []
  if (data.positions) {
    lines = data.positions.map((p) => ({ n: p.n, entries: entriesOf(p.mix) }))
  } else if (slots) {
    for (const [cls, n] of [['common', slots.common], ['uncommon', slots.uncommon], ['premium', slots.premium]]) {
      for (let i = 0; i < n; i++) lines.push({ n: lines.length + 1, entries: entriesOf(mixOf(cls)) })
    }
  }

  // cartes spéciales : chance d'en avoir au moins une dans un booster
  const specials = data.by_rarity.filter((r) => SPECIAL.includes(rarityMap[r.id]?.kind) && r.remaining > 0 && r.per_booster > 0)
    .sort((x, y) => SPECIAL.indexOf(rarityMap[x.id].kind) - SPECIAL.indexOf(rarityMap[y.id].kind) || 0)

  const golden = data.golden
  const goldenList = (golden?.contents ?? []).map((c) => `${c.quantity} ${name(c.rarity_id)}`).join(', ')
  return (
    <>
      {lines.length > 0 && (
        <ol className="odds-cards" aria-label="Chances par carte du booster">
          {lines.map((l) => (
            <li key={l.n} className="odds-card-row">
              <span className="odds-mini" style={tone(rarityMap[l.entries[0]?.id])} aria-hidden="true">{l.n}</span>
              <div className="odds-chips">
                <span className="sr-only">Carte {l.n} : </span>
                {l.entries.length === 0 && <span className="odds-chip plain">Au hasard parmi les cartes restantes</span>}
                {l.entries.map((o) => <span key={o.id} className="odds-chip" style={tone(rarityMap[o.id])}>{name(o.id)} <strong>{fmtOdds(o.p)}</strong></span>)}
                {l.entries.length > 1 && (
                  <span className="odds-bar" aria-hidden="true">
                    {l.entries.map((o) => <i key={o.id} style={{ ...tone(rarityMap[o.id]), flex: `${o.p} 1 0` }} />)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {specials.length > 0 && (
        <div className="odds-special">
          <span className="odds-special-label">Par booster</span>
          {specials.map((r) => <span key={r.id} className="odds-chip" style={tone(rarityMap[r.id])}>{name(r.id)} <strong>{fmtOdds(r.per_booster)}</strong></span>)}
        </div>
      )}
      {!compact && (
        <p className="odds-foot muted">
          {fmt(data.pool_left)} cartes encore disponibles
          <InfoButton onClick={() => setInfo(true)} label="Détail des chances de tirage" />
        </p>
      )}
      {info && !compact && (
        <InfoSheet title="Chances de tirage" onClose={() => setInfo(false)}>
          <p>Chances calculées sur les cartes encore disponibles de « {category.name} » : elles évoluent à mesure que les cartes sont tirées. Les Alpha, Omega et Unique sont des cartes spéciales tirées dans les mêmes emplacements que leur rareté d’origine.</p>
          <ul className="odds-list">
            {data.by_rarity.map((r) => {
              const rar = rarityMap[r.id]
              return (
                <li key={r.id} className={r.remaining === 0 ? 'gone' : ''}>
                  <i className="dot" style={{ '--dot': rar?.color, '--dot2': rar?.color2 }} />
                  <span className="odds-name">{rar?.name ?? r.id}</span>
                  <span className="odds-val">{r.remaining === 0 ? 'épuisée' : fmtOdds(r.share)}</span>
                  <span className="odds-left">{fmt(r.remaining)} restantes sur {fmt(r.total)}</span>
                </li>
              )
            })}
          </ul>
          <p>{data.exponent === 0 ? 'Dans une rareté, chaque carte restante a la même chance.' : 'Les petites séries ont moins de chances que les grandes.'} Si une rareté est épuisée, la carte est tirée parmi toutes celles qui restent.</p>
          {golden && golden.chance > 0 && (
            <p>
              Booster doré : {fmtShare(golden.chance)} par booster{goldenList ? `, il contient ${goldenList}` : ''}.
              {golden.unique_chance > 0 && ` Et ${fmtShare(golden.unique_chance)} de chances d’avoir en plus une carte Unique (1/1) !`}
            </p>
          )}
        </InfoSheet>
      )}
    </>
  )
}

// Chances de tirage de la collection en cours, calculées par le serveur sur les cartes encore disponibles
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

// Chances d'un type de booster (hors Standard) dans la collection en cours, dans une fenêtre
export function BoosterOddsSheet({ category, boosterType, rarityMap, onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    api.getOdds(category.id, boosterType.id).then((d) => !cancelled && setData(d)).catch((e) => !cancelled && setError(explain(e)))
    return () => { cancelled = true }
  }, [category.id, boosterType.id])
  return (
    <InfoSheet title={`Chances : ${boosterType.name}`} onClose={onClose}>
      {error && <p className="msg error" role="alert">{error}</p>}
      {!data && !error && <p className="muted">Chargement…</p>}
      {data && <OddsBody data={data} category={category} rarityMap={rarityMap} compact />}
    </InfoSheet>
  )
}

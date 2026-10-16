import { useEffect, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { useGame, fmt, fmtShare } from '../game'

// Nom d'un palier Premium annoncé par le serveur : Rare, Super Rare, Ultra Rare (noms des raretés), Full Art, autres raretés
const TIER_LABELS = { fullart: 'Full Art', other: 'Autres raretés' }
export const tierLabel = (tier, rarityMap) => TIER_LABELS[tier] ?? rarityMap?.[tier]?.name ?? tier

// Contenu de l'encart : composition d'un booster, chances de la carte Premium et part de chaque rareté (sans appel réseau : testable seul)
export function OddsBody({ data, category, rarityMap }) {
  const golden = data.golden
  const goldenList = (golden?.contents ?? []).map((c) => `${c.quantity} ${rarityMap[c.rarity_id]?.name ?? c.rarity_id}`).join(', ')
  const slots = data.slots
  const commonName = rarityMap.common?.name ?? 'Commune'
  const uncommonName = rarityMap.peu_commune?.name ?? 'Peu commune'
  const s = (n) => (n > 1 ? 's' : '')
  return (
    <>
      {slots && (
        <p className="odds-slots">
          <strong>Un booster</strong> = {data.cards_per_booster} cartes, tirées dans cet ordre :{' '}
          {[
            slots.common > 0 && `${slots.common} ${commonName}${s(slots.common)}`,
            slots.uncommon > 0 && `${slots.uncommon} ${uncommonName}${s(slots.uncommon)}`,
            slots.premium > 0 && `${slots.premium} carte${s(slots.premium)} Premium`,
          ].filter(Boolean).join(', ')}.
        </p>
      )}
      {slots?.premium > 0 && data.premium?.length > 0 && (
        <div className="odds-premium">
          <p className="fine"><strong>Carte Premium</strong> : sa rareté est tirée d’abord, puis la carte parmi celles qui restent de cette rareté.</p>
          <ul className="odds-list">
            {data.premium.map((t) => (
              <li key={t.tier}>
                <i className="dot" style={{ '--dot': rarityMap[t.tier]?.color ?? '#7c5cff', '--dot2': rarityMap[t.tier]?.color2 ?? '#c9a8ff' }} />
                <span className="odds-name">{tierLabel(t.tier, rarityMap)}</span>
                <span className="odds-val">{fmtShare(t.p)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="fine">
        {slots ? 'Part de chaque rareté parmi toutes les cartes d’un booster' : 'Part de chaque rareté sur la totalité des cartes encore disponibles'} de « {category.name} » ({fmt(data.pool_left)} cartes
        encore disponibles). C’est la chance qu’une carte tirée soit de cette rareté.
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
      {golden && (
        <p className="fine">
          Booster doré : {golden.chance > 0 ? fmtShare(golden.chance) : 'désactivé'} par booster
          {goldenList ? `, il contient ${goldenList}` : ''}.
          {golden.unique_chance > 0 && ` Et une chance de ${fmtShare(golden.unique_chance)} d’avoir en plus une carte Unique (1/1) !`}
        </p>
      )}
      <p className="fine">
        {slots
          ? 'Les Alpha, Omega et Unique sont des cartes spéciales : elles se trouvent dans les mêmes emplacements que leur rareté d’origine, d’où des parts un peu plus basses pour les raretés ordinaires. '
          : ''}
        {data.exponent === 0
          ? 'Dans chaque emplacement, chaque carte encore disponible de la rareté tirée a la même chance d’être tirée.'
          : 'Les cartes des petites séries ont moins de chances d’être tirées que celles des grandes séries.'}
        {' '}Si une rareté est épuisée, la carte est tirée parmi toutes celles qui restent. Ces chances évoluent à mesure que les cartes sont tirées.
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

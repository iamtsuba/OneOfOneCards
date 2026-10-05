import { useEffect, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { isSpecial } from '../rarity'
import { useGame, useCountdown, fmtClock, fmt } from '../game'
import Card, { CardBack } from './Card'
import Pack from './Pack'
import Fireworks from './Fireworks'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export default function Boosters({ goCollection }) {
  const { status, setStatus, refreshStatus, rarityMap } = useGame()
  const [overlay, setOverlay] = useState(null)
  const [error, setError] = useState('')
  const remaining = useCountdown(status, () => refreshStatus().catch(() => {}))

  useEffect(() => {
    refreshStatus().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const boosters = status?.boosters ?? 0
  const canOpen = status && boosters > 0 && !overlay

  async function open(fromSummary = false) {
    if (!(status && boosters > 0 && (fromSummary === true || !overlay))) return
    setError('')
    setOverlay({ phase: 'shake' })
    const t = setTimeout(() => setOverlay((o) => (o && o.phase === 'shake' ? { phase: 'tear' } : o)), 550)
    try {
      const [res] = await Promise.all([api.openBooster(), wait(1200)])
      setStatus(res.status)
      // Les cartes les plus rares sont révélées en dernier
      const cards = [...res.cards].sort(
        (a, b) => (rarityMap[b.rarity_id]?.sort_order ?? 0) - (rarityMap[a.rarity_id]?.sort_order ?? 0),
      )
      setOverlay({ phase: 'reveal', cards, idx: 0, flipped: false })
    } catch (e) {
      setOverlay(null)
      setError(explain(e))
      refreshStatus().catch(() => {})
    } finally {
      clearTimeout(t)
    }
  }

  return (
    <section className="page">
      <h1 className="page-title">Boosters</h1>

      <div className="pack-stage">
        <button className="pack-button" onClick={() => open()} disabled={!canOpen} aria-label="Ouvrir un booster">
          <Pack dim={boosters === 0} />
        </button>

        <p className="stock">
          {status ? (
            boosters > 0 ? (
              <><strong>{fmt(boosters)}</strong> {boosters > 1 ? 'boosters prêts' : 'booster prêt'}</>
            ) : (
              <>Aucun booster pour le moment</>
            )
          ) : (
            'Chargement…'
          )}
        </p>

        <button className="btn accent big" onClick={() => open()} disabled={!canOpen}>
          Ouvrir un booster
        </button>

        {error && <p className="msg error" role="alert">{error}</p>}

        {status && (
          <p className="refill">
            {remaining !== null ? (
              <>
                Prochaine recharge dans <strong className="clock">{fmtClock(remaining)}</strong> : +{status.regen_amount} boosters.
              </>
            ) : (
              <>Stock plein ({status.max_boosters} max). La recharge reprend dès que tu ouvres un booster.</>
            )}
          </p>
        )}
        {status && (
          <p className="fine">
            +{status.regen_amount} boosters toutes les {status.regen_minutes} minutes, jusqu’à {status.max_boosters} en stock.
            Chaque carte n’existe qu’en un exemplaire : {fmt(status.cards_taken)} déjà tirées sur {fmt(status.total_cards)}.
          </p>
        )}
      </div>

      {overlay && (
        <Overlay
          overlay={overlay}
          setOverlay={setOverlay}
          rarityMap={rarityMap}
          boosters={boosters}
          onAgain={() => open(true)}
          onCollection={() => { setOverlay(null); goCollection() }}
        />
      )}
    </section>
  )
}

function Overlay({ overlay, setOverlay, rarityMap, boosters, onAgain, onCollection }) {
  const close = () => setOverlay(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && overlay.phase === 'reveal') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (overlay.phase === 'shake' || overlay.phase === 'tear') {
    return (
      <div className="overlay" role="dialog" aria-modal="true" aria-label="Ouverture du booster">
        <Pack phase={overlay.phase} />
        <p className="overlay-hint">Ouverture…</p>
      </div>
    )
  }

  const { cards, idx, flipped, summary } = overlay

  if (summary) {
    const rarest = cards.reduce((best, c) => (rarityMap[c.rarity_id]?.sort_order < (rarityMap[best.rarity_id]?.sort_order ?? 99) ? c : best), cards[0])
    return (
      <div className="overlay" role="dialog" aria-modal="true" aria-label="Résumé du booster">
        <h2 className="overlay-title">Ton booster</h2>
        <ul className="summary-grid">
          {cards.map((c) => (
            <li key={`${c.series}-${c.number}`}>
              <Card series={c.series} number={c.number} rarity={rarityMap[c.rarity_id]} size="sm" glow />
            </li>
          ))}
        </ul>
        <p className="overlay-hint">
          {cards.length} carte{cards.length > 1 ? 's' : ''} ajoutée{cards.length > 1 ? 's' : ''} à ta collection. Meilleure carte : {rarityMap[rarest.rarity_id]?.name}, {rarest.number}/{rarest.series}.
        </p>
        <div className="overlay-actions">
          {boosters > 0 && <button className="btn accent" onClick={onAgain}>Ouvrir un autre booster</button>}
          <button className="btn light" onClick={onCollection}>Voir ma collection</button>
          <button className="btn ghost-light" onClick={close}>Fermer</button>
        </div>
      </div>
    )
  }

  const c = cards[idx]
  const rarity = rarityMap[c.rarity_id]
  const last = idx === cards.length - 1
  const flip = () => { if (!flipped) setOverlay({ ...overlay, flipped: true }) }
  const next = () => (last ? setOverlay({ ...overlay, summary: true }) : setOverlay({ ...overlay, idx: idx + 1, flipped: false }))

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Révélation des cartes">
      <p className="overlay-hint">Carte {idx + 1} sur {cards.length}</p>

      <div
        key={idx}
        className={`flip ${flipped ? 'is-flipped' : ''}`}
        onClick={flip}
        role="button"
        tabIndex={0}
        aria-label={flipped ? 'Carte révélée' : 'Retourner la carte'}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip() } }}
      >
        <div className="flip-inner">
          <div className="flip-face flip-back"><CardBack /></div>
          <div className="flip-face flip-front">
            <Card series={c.series} number={c.number} rarity={rarity} size="lg" glow shine={flipped} />
          </div>
        </div>
      </div>

      {flipped && isSpecial(rarity) && <Fireworks key={idx} rarity={rarity} />}

      <p className="reveal-line" aria-live="polite">
        {flipped
          ? <><strong>{rarity?.name}</strong> : la {c.number}/{c.series} n’existe qu’en un exemplaire, et c’est le tien.</>
          : 'Touche la carte pour la retourner'}
      </p>

      <div className="overlay-actions">
        {flipped ? (
          <button className="btn accent" onClick={next}>{last ? 'Voir le résumé' : 'Carte suivante'}</button>
        ) : (
          <button className="btn light" onClick={flip}>Retourner</button>
        )}
        {!last && <button className="btn ghost-light" onClick={() => setOverlay({ ...overlay, summary: true })}>Tout révéler</button>}
      </div>
    </div>
  )
}

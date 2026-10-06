import { useEffect, useRef, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { isSpecial } from '../rarity'
import { useGame, useCountdown, fmtClock, fmt } from '../game'
import Card from './Card'
import Pack from './Pack'
import Fireworks from './Fireworks'
import PurchaseConsent from './PurchaseConsent'
import LegalSheet from './Legal'

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
  const bonus = status?.bonus_boosters ?? 0
  const total = boosters + bonus
  const canOpen = status && total > 0 && !overlay
  const [consentOpen, setConsentOpen] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const returned = useRef(false)

  // Retour de la page de paiement Stripe : message, puis rafraîchissement du stock le temps que le paiement soit enregistré
  useEffect(() => {
    if (returned.current) return
    returned.current = true
    const params = new URLSearchParams(window.location.search)
    const pay = params.get('payment')
    if (!pay) return
    params.delete('payment')
    const qs = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash)
    if (pay === 'cancel') { setNotice('Paiement annulé : tu n’as pas été débité.'); return }
    if (pay === 'success') {
      setNotice('Merci ! Ton paiement est confirmé : tes boosters s’affichent dans quelques secondes.')
      let tries = 0
      const id = setInterval(() => {
        refreshStatus().catch(() => {})
        if (++tries >= 10) clearInterval(id)
      }, 2500)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function open(fromSummary = false) {
    if (!(status && total > 0 && (fromSummary === true || !overlay))) return
    setError('')
    setOverlay({ phase: 'shake' })
    const t0 = Date.now()
    try {
      const res = await api.openBooster()
      setStatus(res.status)
      // Les cartes les plus rares sont révélées en dernier
      const cards = [...res.cards].sort(
        (a, b) => (rarityMap[b.rarity_id]?.sort_order ?? 0) - (rarityMap[a.rarity_id]?.sort_order ?? 0),
      )
      const golden = !!res.golden
      if (golden) {
        // Le booster se transforme en or avant de s'ouvrir
        setOverlay({ phase: 'shake', golden: true })
        await wait(1700)
      } else {
        await wait(Math.max(0, 700 - (Date.now() - t0)))
      }
      setOverlay({ phase: 'tear', golden })
      await wait(700)
      setOverlay({ phase: 'reveal', cards, idx: 0, golden })
    } catch (e) {
      setOverlay(null)
      setError(explain(e))
      refreshStatus().catch(() => {})
    }
  }

  return (
    <section className="page">
      <h1 className="page-title">Boosters</h1>

      <div className="pack-stage">
        <button className="pack-button" onClick={() => open()} disabled={!canOpen} aria-label="Ouvrir un booster">
          <Pack dim={total === 0} />
        </button>

        <p className="stock">
          {status ? (
            total > 0 ? (
              <>
                <strong>{fmt(total)}</strong> {total > 1 ? 'boosters prêts' : 'booster prêt'}
                {bonus > 0 && <span className="muted stock-bonus"> dont {fmt(bonus)} acheté{bonus > 1 ? 's' : ''}</span>}
              </>
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

        {notice && <p className="msg info" role="status">{notice}</p>}
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

        {status?.shop_enabled && (
          <div className="shop">
            <div>
              <strong>Plus de boosters ?</strong>
              <p className="muted">
                {fmt(status.pack_boosters)} boosters en plus pour {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(status.pack_price_cents / 100)}.
                Ils s’ajoutent à ton stock et ne comptent pas dans le plafond de {status.max_boosters}.
              </p>
            </div>
            <button className="btn" onClick={() => setConsentOpen(true)}>
              Acheter {fmt(status.pack_boosters)} boosters
            </button>
            <p className="fine">
              Paiement sécurisé par Stripe. Les boosters achetés sont utilisés après ton stock gratuit.{' '}
              <button type="button" className="link" onClick={() => setTermsOpen(true)}>Conditions générales de vente</button>
            </p>
          </div>
        )}
      </div>

      {consentOpen && <PurchaseConsent status={status} onClose={() => setConsentOpen(false)} />}
      {termsOpen && <LegalSheet onClose={() => setTermsOpen(false)} />}

      {overlay && (
        <Overlay
          overlay={overlay}
          setOverlay={setOverlay}
          rarityMap={rarityMap}
          boosters={total}
          onAgain={() => open(true)}
          onCollection={() => { setOverlay(null); goCollection() }}
        />
      )}
    </section>
  )
}

export function Overlay({ overlay, setOverlay, rarityMap, boosters, onAgain, onCollection }) {
  const shownAt = useRef(Date.now())
  const close = () => setOverlay(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && overlay.phase === 'reveal') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (overlay.phase === 'shake' || overlay.phase === 'tear') {
    return (
      <div className="overlay" role="dialog" aria-modal="true" aria-label="Ouverture du booster">
        <Pack phase={overlay.phase} golden={overlay.golden} />
        <p className="overlay-hint">{overlay.golden ? 'Un booster doré !' : 'Ouverture…'}</p>
      </div>
    )
  }

  const { cards, idx, summary, revealAll, from, golden } = overlay

  if (summary) {
    const rarest = cards.reduce((best, c) => (rarityMap[c.rarity_id]?.sort_order < (rarityMap[best.rarity_id]?.sort_order ?? 99) ? c : best), cards[0])
    // « Tout révéler » : on joue quand même les feux d'artifice des cartes spéciales, rarest en premier
    const specials = revealAll
      ? [...new Map(cards.slice(from ?? 0).map((c) => rarityMap[c.rarity_id]).filter(isSpecial).map((r) => [r.id, r])).values()].sort((a, b) => a.sort_order - b.sort_order)
      : []
    return (
      <div className="overlay" role="dialog" aria-modal="true" aria-label="Résumé du booster">
        {specials.map((r, i) => <Fireworks key={r.id} rarity={r} delay={i * 1800} />)}
        <h2 className={`overlay-title ${golden ? 'gold' : ''}`}>{golden ? 'Booster doré' : 'Ton booster'}</h2>
        <ul className="summary-grid">
          {cards.map((c) => (
            <li key={`${c.series}-${c.number}`}>
              <Card series={c.series} number={c.number} rarity={rarityMap[c.rarity_id]} size="sm" glow shine={revealAll} />
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
  const next = () => {
    shownAt.current = Date.now()
    if (last) setOverlay({ ...overlay, summary: true })
    else setOverlay({ ...overlay, idx: idx + 1 })
  }
  // Un clic sur la carte passe directement à la suivante
  // (courte pause à l'apparition pour ne pas sauter une carte par un double clic)
  const advance = () => {
    if (Date.now() - shownAt.current > 250) next()
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Cartes du booster">
      <p className="overlay-hint">{golden ? 'Booster doré : ' : ''}carte {idx + 1} sur {cards.length}</p>

      <div
        key={idx}
        className="reveal-card"
        onClick={advance}
        role="button"
        tabIndex={0}
        aria-label={last ? 'Voir le résumé' : 'Carte suivante'}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance() } }}
      >
        <Card series={c.series} number={c.number} rarity={rarity} size="lg" glow shine />
      </div>

      {isSpecial(rarity) && <Fireworks key={idx} rarity={rarity} />}

      <p className="reveal-line" aria-live="polite">
        <strong>{rarity?.name}</strong> : la {c.number}/{c.series} n’existe qu’en un exemplaire, et c’est le tien.
      </p>
      <p className="overlay-hint">{last ? 'Touche la carte pour voir le résumé.' : 'Touche la carte pour passer à la suivante.'}</p>
    </div>
  )
}

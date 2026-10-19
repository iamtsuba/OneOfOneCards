import { useEffect, useRef, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { isSpecial } from '../rarity'
import { useGame, useCountdown, fmtClock, fmt } from '../game'
import Card from './Card'
import Pack from './Pack'
import Fireworks from './Fireworks'
import PurchaseConsent from './PurchaseConsent'
import { SubscriptionPanel, SubscribeConsent } from './Subscription'
import LegalSheet from './Legal'
import Odds, { BoosterOddsSheet } from './Odds'
import { InfoButton } from './Collection'

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// Résumé d'un booster : les cartes tirées, chacune est un bouton qui l'ouvre en grand
export function SummaryGrid({ cards, rarityMap, catalog, revealAll = false, onZoom }) {
  return (
    <ul className="summary-grid">
      {cards.map((c, i) => (
        <li key={`${c.type_id}-${c.base_rarity}-${c.series}-${c.number}`}>
          <button type="button" className="summary-card" onClick={() => onZoom(i)}
            aria-label={`Voir en grand : ${rarityMap[c.rarity_id]?.name ?? c.rarity_id}, ${catalog?.typeMap?.[c.type_id]?.name ?? 'carte'}`}>
            <Card typeId={c.type_id} base={c.base_rarity} series={c.series} number={c.number} rarity={rarityMap[c.rarity_id]} size="sm" isNew={!!c.is_new} glow shine={revealAll} />
          </button>
        </li>
      ))}
    </ul>
  )
}

// Une carte du booster en grand ; ‹ › pour passer à la précédente ou à la suivante, toucher le fond ou « Fermer » pour revenir au résumé
export function CardZoom({ cards, index, rarityMap, catalog, onClose, onMove }) {
  const c = cards[index]
  if (!c) return null
  const rarity = rarityMap[c.rarity_id]
  const stop = (e) => e.stopPropagation()
  return (
    <div className="zoom-overlay" role="dialog" aria-modal="true" aria-label="Carte en grand" onClick={onClose}>
      <div className="zoom-card" onClick={stop}>
        <Card typeId={c.type_id} base={c.base_rarity} series={c.series} number={c.number} rarity={rarity} size="lg" isNew={!!c.is_new} glow shine />
      </div>
      <p className="reveal-line" onClick={stop}>
        <strong>{rarity?.name ?? c.rarity_id}</strong> : « {catalog?.typeMap?.[c.type_id]?.name} »{catalog?.cardRef?.(c.type_id, c.base_rarity, c.number, c.series)}
        {c.is_new ? ' · nouvelle carte' : ''}
      </p>
      <div className="zoom-actions" onClick={stop}>
        <button type="button" className="btn ghost-light" disabled={index <= 0} onClick={() => onMove(-1)} aria-label="Carte précédente">‹</button>
        <button type="button" className="btn light" onClick={onClose}>Fermer</button>
        <button type="button" className="btn ghost-light" disabled={index >= cards.length - 1} onClick={() => onMove(1)} aria-label="Carte suivante">›</button>
      </div>
      <p className="zoom-count" onClick={stop}>{index + 1} / {cards.length}</p>
    </div>
  )
}

// Autres types de boosters (Silver, Gold, Légende…) : en stock et/ou en vente contre des pièces ; « i » ouvre leurs chances
export function ExtraBoosters({ items, coins, disabled, onOpen, onBuy, onInfo }) {
  if (!items || items.length === 0) return null
  return (
    <section className="extra-boosters" aria-label="Autres boosters">
      <h3>Autres boosters</h3>
      <ul className="extra-list">
        {items.map((it) => (
          <li key={it.id} style={{ '--bt': it.color }}>
            <i className="extra-dot" aria-hidden="true" />
            <span className="extra-text">
              <strong>{it.name}</strong>
              <small>{it.cards} carte{it.cards > 1 ? 's' : ''}{it.quantity > 0 ? ` · ${fmt(it.quantity)} en stock` : ''}</small>
            </span>
            <span className="extra-actions">
              <InfoButton onClick={() => onInfo(it)} label={`Chances du booster ${it.name}`} />
              {it.quantity > 0 && <button type="button" className="btn small" disabled={disabled} onClick={() => onOpen(it)} aria-label={`Ouvrir un booster ${it.name}`}>Ouvrir</button>}
              {it.price != null && (
                <button type="button" className="btn small ghost" disabled={disabled || coins < it.price} onClick={() => onBuy(it)} aria-label={`Acheter un booster ${it.name} pour ${it.price} pièces`}>
                  Acheter · {fmt(it.price)} 🪙
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// Boosters Gold gagnés en complétant tous les emplacements d'une carte dans l'album (un par carte), à ouvrir un par un
export function GoldRewardList({ rewards, typeMap, name = 'Gold', disabled, onOpen }) {
  if (!rewards || rewards.length === 0) return null
  return (
    <div className="golden-reward gold-rewards" aria-label={`Boosters ${name} à ouvrir`}>
      <strong>{rewards.length > 1 ? `${rewards.length} boosters ${name} à ouvrir` : `Un booster ${name} à ouvrir`}</strong>
      <p className="muted">Gagné en complétant tous les emplacements d’une carte dans l’album.</p>
      <ul className="gold-list">
        {rewards.map((g) => (
          <li key={g.id}>
            <span>{typeMap?.[g.type_id]?.name ?? 'Carte'}</span>
            <button type="button" className="btn gold small" onClick={() => onOpen(g.id)} disabled={disabled} aria-label={`Ouvrir le booster ${name} de ${typeMap?.[g.type_id]?.name ?? 'cette carte'}`}>Ouvrir</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Boosters({ goCollection }) {
  const { status, setStatus, refreshStatus, rarityMap, catalog, setRevealing } = useGame()
  const [overlay, setOverlay] = useState(null)
  const [error, setError] = useState('')
  const remaining = useCountdown(status, () => refreshStatus().catch(() => {}))

  useEffect(() => {
    refreshStatus().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tant que l'ouverture est à l'écran, l'annonce d'une série complétée attend la fin de la révélation
  useEffect(() => {
    setRevealing?.(!!overlay)
    return () => setRevealing?.(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!overlay])

  const boosters = status?.boosters ?? 0
  const bonus = status?.bonus_boosters ?? 0
  const total = boosters + bonus
  const category = catalog.categoryMap[status?.active_category_id]
  const nextCategory = status?.next_category
  const canOpen = status && total > 0 && !overlay && !!category
  const [consentOpen, setConsentOpen] = useState(false)
  const [subOpen, setSubOpen] = useState(false)
  const [subBusy, setSubBusy] = useState(false)
  const [subError, setSubError] = useState('')
  // « Gérer mon abonnement » : portail Stripe (résilier, changer de carte, factures)
  async function manageSubscription() {
    setSubBusy(true)
    setSubError('')
    try { window.location.href = await api.openSubscriptionPortal() } catch (e) { setSubError(explain(e)); setSubBusy(false) }
  }
  const [termsOpen, setTermsOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const returned = useRef(false)

  // Retour de la page de paiement Stripe : message, puis rafraîchissement du stock le temps que le paiement soit enregistré
  useEffect(() => {
    if (returned.current) return
    returned.current = true
    const params = new URLSearchParams(window.location.search)
    const pay = params.get('payment')
    const subReturn = params.get('subscription')
    if (!pay && !subReturn) return
    params.delete('payment')
    params.delete('subscription')
    const qs = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash)
    // Retour de la page d'abonnement ou du portail de gestion : l'état arrive par Stripe quelques secondes plus tard
    if (subReturn) {
      if (subReturn === 'cancel') { setNotice('Abonnement annulé : tu n’as pas été débité.'); return }
      setNotice(subReturn === 'success' ? 'Merci ! Ton abonnement s’active dans quelques secondes.' : 'Modifications enregistrées chez Stripe : elles s’affichent dans quelques secondes.')
      let tries = 0
      const id = setInterval(() => {
        refreshStatus().catch(() => {})
        if (++tries >= 10) clearInterval(id)
      }, 2500)
      return
    }
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

  const goldenPacks = status?.golden_packs ?? 0

  const goldRewards = status?.gold_rewards ?? []
  const [oddsFor, setOddsFor] = useState(null)
  const coinsFree = Math.max(0, (status?.coins ?? 0) - (status?.coins_locked ?? 0))

  async function buy(it) {
    if (!window.confirm(`Acheter un booster ${it.name} pour ${it.price} pièces ?`)) return
    setError('')
    setNotice('')
    try {
      const res = await api.buyBooster(it.id, 1)
      setStatus(res.status)
      setNotice(`Un booster ${it.name} a été ajouté à ton stock.`)
    } catch (e) {
      setError(explain(e))
    }
  }

  // kind : 'normal' (un booster), 'golden' (un pack doré gagné en complétant une série) ou 'gold' (un booster Gold gagné en complétant une carte : rewardId)
  async function open(fromSummary = false, kind = 'normal', rewardId = null) {
    const isGold = kind === 'gold'
    const isType = kind === 'type'
    const typeInfo = isType ? (status?.booster_types ?? []).find((x) => x.id === rewardId) : null
    const isPack = kind === 'golden' || isGold
    const goldType = isGold ? catalog?.typeMap?.[goldRewards.find((g) => g.id === rewardId)?.type_id] : null
    const goldCategory = goldType ? catalog?.categoryMap?.[goldType.category_id] : null
    if (!(status && (isGold ? goldCategory : category) && (isGold ? true : isType ? typeInfo?.quantity > 0 : isPack ? goldenPacks > 0 : total > 0) && (fromSummary === true || !overlay))) return
    setError('')
    // nom du booster pendant l'ouverture : celui du module Boosters (Gold, type choisi, booster des abonnés pour un abonné)
    const shakeLabel = isGold ? status?.reward_booster?.name : isType ? typeInfo?.name : kind === 'normal' && status?.subscription?.active && status?.subscription?.booster_name ? status?.standard_booster?.name : undefined
    setOverlay({ phase: 'shake', categoryId: (goldCategory ?? category).id, golden: isPack, gold: isGold, label: shakeLabel })
    const t0 = Date.now()
    try {
      const res = isType ? await api.openBoosterType(rewardId) : isGold ? await api.openGoldReward(rewardId) : isPack ? await api.openGoldenPack() : await api.openBooster()
      setStatus(res.status)
      // Les cartes les plus rares sont révélées en dernier
      const cards = [...res.cards].sort(
        (a, b) => (rarityMap[b.rarity_id]?.sort_order ?? 0) - (rarityMap[a.rarity_id]?.sort_order ?? 0),
      )
      const golden = !!res.golden
      if (isPack) {
        await wait(Math.max(0, 1100 - (Date.now() - t0)))
      } else if (golden) {
        // Le booster se transforme en or avant de s'ouvrir
        setOverlay((o) => ({ ...o, phase: 'shake', golden: true }))
        await wait(1700)
      } else {
        await wait(Math.max(0, 700 - (Date.now() - t0)))
      }
      setOverlay((o) => ({ ...o, phase: 'tear', golden }))
      await wait(700)
      setOverlay({ phase: 'reveal', cards, idx: 0, golden, gold: isGold, label: res.booster?.name, categoryId: res.category_id, nextCategoryId: res.status.active_category_id })
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
          <Pack dim={total === 0 || !category} category={category} />
        </button>

        {category && <p className="pack-name">Booster « {category.name} »</p>}
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

        <ExtraBoosters items={status?.booster_types} coins={coinsFree} disabled={!!overlay} onOpen={(it) => open(false, 'type', it.id)} onBuy={buy} onInfo={setOddsFor} />
        {oddsFor && category && <BoosterOddsSheet category={category} boosterType={oddsFor} rarityMap={rarityMap} onClose={() => setOddsFor(null)} />}
        <GoldRewardList rewards={goldRewards} typeMap={catalog?.typeMap} name={status?.reward_booster?.name} disabled={!!overlay} onOpen={(id) => open(false, 'gold', id)} />
        {goldenPacks > 0 && (
          <div className="golden-reward">
            <strong>{goldenPacks > 1 ? `${goldenPacks} packs dorés à ouvrir` : 'Un pack doré à ouvrir'}</strong>
            <p className="muted">Tu l’as gagné en complétant une série. Il contient 1 Alpha, 1 Omega, 1 Ultra Rare, 1 Super Rare et 1 Rare.</p>
            <button className="btn gold" onClick={() => open(false, 'golden')} disabled={!!overlay || !category}>
              Ouvrir un pack doré
            </button>
          </div>
        )}
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
          </p>
        )}
        {status && category && (
          <p className="fine">
            {category.name} : {fmt(status.cards_taken)} cartes tirées sur {fmt(status.total_cards)}.
            {nextCategory ? ` Quand elles seront toutes tirées, la catégorie « ${nextCategory.name} » s’ouvrira.` : ' C’est la dernière catégorie.'}
          </p>
        )}
        {category && <Odds category={category} />}
        {status && !category && (
          <p className="msg info">Toutes les catégories de boosters ont été entièrement tirées. De nouvelles arriveront bientôt.</p>
        )}

        <SubscriptionPanel sub={status?.subscription} baseMinutes={status?.subscription?.active ? null : status?.regen_minutes} onSubscribe={() => setSubOpen(true)} onManage={manageSubscription} busy={subBusy} error={subError} />

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
      {subOpen && <SubscribeConsent status={status} onClose={() => setSubOpen(false)} />}
      {termsOpen && <LegalSheet onClose={() => setTermsOpen(false)} />}

      {overlay && (
        <Overlay
          overlay={overlay}
          setOverlay={setOverlay}
          rarityMap={rarityMap}
          catalog={catalog}
          boosters={total}
          onAgain={() => open(true)}
          onCollection={() => { setOverlay(null); goCollection() }}
        />
      )}
    </section>
  )
}

export function Overlay({ overlay, setOverlay, rarityMap, catalog, boosters, onAgain, onCollection }) {
  const shownAt = useRef(Date.now())
  const close = () => setOverlay(null)
  const [zoom, setZoom] = useState(null)   // index de la carte ouverte en grand dans le résumé

  // Carte en grand : Échap revient au résumé (sans fermer le booster), flèches pour parcourir les cartes
  useEffect(() => {
    if (zoom == null) return undefined
    const n = overlay?.cards?.length ?? 0
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); setZoom(null) }
      else if (e.key === 'ArrowLeft') setZoom((z) => Math.max(0, (z ?? 0) - 1))
      else if (e.key === 'ArrowRight') setZoom((z) => Math.min(n - 1, (z ?? 0) + 1))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [zoom, overlay?.cards?.length])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && overlay.phase === 'reveal') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (overlay.phase === 'shake' || overlay.phase === 'tear') {
    return (
      <div className="overlay" role="dialog" aria-modal="true" aria-label="Ouverture du booster">
        <Pack phase={overlay.phase} golden={overlay.golden} category={catalog?.categoryMap?.[overlay.categoryId]} />
        <p className="overlay-hint">{overlay.gold ? `Ton booster ${overlay.label ?? 'Gold'} !` : overlay.golden ? 'Un booster doré !' : overlay.label ? `Ton booster ${overlay.label} !` : 'Ouverture…'}</p>
      </div>
    )
  }

  const { cards, idx, summary, revealAll, from, golden, gold, label } = overlay

  if (summary) {
    const rarest = cards.reduce((best, c) => (rarityMap[c.rarity_id]?.sort_order < (rarityMap[best.rarity_id]?.sort_order ?? 99) ? c : best), cards[0])
    // « Tout révéler » : on joue quand même les feux d'artifice des cartes spéciales, rarest en premier
    const specials = revealAll
      ? [...new Map(cards.slice(from ?? 0).map((c) => rarityMap[c.rarity_id]).filter(isSpecial).map((r) => [r.id, r])).values()].sort((a, b) => a.sort_order - b.sort_order)
      : []
    return (
      <div className="overlay" role="dialog" aria-modal="true" aria-label="Résumé du booster">
        {specials.map((r, i) => <Fireworks key={r.id} rarity={r} delay={i * 1800} />)}
        {overlay.nextCategoryId !== overlay.categoryId && catalog?.categoryMap?.[overlay.categoryId] && (
          <p className="category-done">
            Catégorie « {catalog.categoryMap[overlay.categoryId].name} » terminée !
            {catalog.categoryMap[overlay.nextCategoryId] ? ` « ${catalog.categoryMap[overlay.nextCategoryId].name} » est maintenant ouverte.` : ' Toutes les catégories sont terminées.'}
          </p>
        )}
        <h2 className={`overlay-title ${golden ? 'gold' : ''}`}>{gold ? `Booster ${label ?? 'Gold'}` : golden ? 'Booster doré' : label ? `Booster ${label}` : 'Ton booster'}</h2>
        <SummaryGrid cards={cards} rarityMap={rarityMap} catalog={catalog} revealAll={revealAll} onZoom={setZoom} />
        {zoom != null && <CardZoom cards={cards} index={zoom} rarityMap={rarityMap} catalog={catalog} onClose={() => setZoom(null)} onMove={(d) => setZoom((z) => Math.max(0, Math.min(cards.length - 1, (z ?? 0) + d)))} />}
        <p className="overlay-hint">
          {cards.length} carte{cards.length > 1 ? 's' : ''} ajoutée{cards.length > 1 ? 's' : ''} à ta collection{cards.filter((x) => x.is_new).length > 0 ? ` (dont ${cards.filter((x) => x.is_new).length} nouvelle${cards.filter((x) => x.is_new).length > 1 ? 's, placées' : ', placée'} dans ton album)` : ''}. Meilleure carte : {rarityMap[rarest.rarity_id]?.name}, {catalog?.typeMap?.[rarest.type_id]?.name}{catalog?.cardRef?.(rarest.type_id, rarest.base_rarity, rarest.number, rarest.series)}.
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
      {/* Tout le contenu d'une carte (légende, carte, feux d'artifice, texte) sous une seule clé : remplacé
          d'un seul bloc d'une carte à l'autre, jamais de morceau de la carte précédente qui traîne à l'écran. */}
      <div className="reveal-step" key={idx}>
        <p className="overlay-hint">{gold ? `Booster ${label ?? 'Gold'} : ` : golden ? 'Booster doré : ' : ''}carte {idx + 1} sur {cards.length}</p>

        <div
          className="reveal-card"
          onClick={advance}
          role="button"
          tabIndex={0}
          aria-label={last ? 'Voir le résumé' : 'Carte suivante'}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance() } }}
        >
          <Card typeId={c.type_id} base={c.base_rarity} series={c.series} number={c.number} rarity={rarity} size="lg" isNew={!!c.is_new} glow shine />
        </div>

        {isSpecial(rarity) && <Fireworks rarity={rarity} />}

        <p className="reveal-line" aria-live="polite">
          <strong>{rarity?.name}</strong> : « {catalog?.typeMap?.[c.type_id]?.name} »{catalog?.cardRef?.(c.type_id, c.base_rarity, c.number, c.series)} n’existe qu’en un exemplaire, et c’est le tien.
        </p>
        {c.is_new && <p className="reveal-new">⭐ Nouvelle carte : elle est déjà dans ton album.</p>}
        <p className="overlay-hint">{last ? 'Touche la carte pour voir le résumé.' : 'Touche la carte pour passer à la suivante.'}</p>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { isSpecial, isArtRare } from '../rarity'
import ArtIntro, { GOLD_FIREWORKS } from './ArtReveal'
import { useGame, useCountdown, fmtClock, fmt } from '../game'
import Card from './Card'
import Pack from './Pack'
import Fireworks from './Fireworks'
import PurchaseConsent from './PurchaseConsent'
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

// Limite d'attente de l'ouverture : au-delà, le paquet cesse de trembler, un message clair s'affiche et on peut réessayer (au lieu de rester figé).
// Le serveur peut très bien avoir ouvert le booster entre-temps : le stock est relu pour le vérifier. Durée en millisecondes (les tests la raccourcissent).
export const OPEN_TIMING = { timeout: 25000 }
export function withTimeout(promise, ms = OPEN_TIMING.timeout) {
  let timer
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('open_timeout')), ms) })
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer))
}

// Étagère : jusqu'à 3 boosters visibles à la fois (le booster du stock gratuit, puis les autres boosters que le joueur a en stock). On touche un paquet pour le choisir.
// packs = [{ key, name, glow, count }] ; selected = clé du paquet choisi. Avec un seul paquet, l'affichage reste celui d'un grand paquet.
export const SHELF_MAX = 3
export function PackShelf({ packs, selected, category, disabled, onSelect }) {
  if (packs.length < 2) return null
  return (
    <div className={`pack-shelf n${packs.length}`} role="group" aria-label="Tes boosters">
      {packs.map((p) => (
        <button key={p.key} type="button" className={`shelf-pack${p.key === selected ? ' on' : ''}`} aria-pressed={p.key === selected} disabled={disabled}
          aria-label={`Booster ${p.name}, ${p.count} en stock`} onClick={() => onSelect(p.key)}>
          <Pack dim={p.count === 0 || (!category && !p.golden)} golden={!!p.golden} category={category} label={p.name} glow={p.glow} color={p.color} />
          <span className="shelf-count" aria-hidden="true">×{fmt(p.count)}</span>
        </button>
      ))}
    </div>
  )
}

// Autres types de boosters (Silver, Gold, Légende…) : en stock et/ou en vente contre des pièces. Chacun est un PAQUET comme le booster principal (son nom sur la bande, son halo,
// son stock en pastille) avec ses boutons dessous (Ouvrir, Acheter) ; « i » ouvre leurs chances. category = la collection en cours (titre du paquet).
// Prix payé par CE joueur : le prix membre (remise du pass OneMore) quand il est plus bas que le prix affiché ; l'ancien prix est alors barré
export const buyPrice = (it) => (it.member_price != null && it.price != null && it.member_price < it.price ? it.member_price : it.price)
export function ExtraBoosters({ items, coins, disabled, onOpen, onBuy, onInfo, category = null }) {
  if (!items || items.length === 0) return null
  return (
    <section className="extra-boosters" aria-label="Autres boosters">
      <h3>Autres boosters</h3>
      <ul className="extra-packs">
        {items.map((it) => (
          <li key={it.id} style={{ '--bt': it.color }}>
            <span className="extra-pack-art">
              <Pack category={category} label={it.name} glow={it.glow} color={it.color} />
              {it.quantity > 0 && <span className="shelf-count" aria-hidden="true">×{fmt(it.quantity)}</span>}
            </span>
            <span className="extra-text">
              <strong>{it.name}</strong>
              <small>{it.cards} carte{it.cards > 1 ? 's' : ''}{it.quantity > 0 ? ` · ${fmt(it.quantity)} en stock` : ''}</small>
            </span>
            <span className="extra-actions">
              <InfoButton onClick={() => onInfo(it)} label={`Chances du booster ${it.name}`} />
              {it.quantity > 0 && <button type="button" className="btn small" disabled={disabled} onClick={() => onOpen(it)} aria-label={`Ouvrir un booster ${it.name}`}>Ouvrir</button>}
              {it.price != null && (
                <button type="button" className="btn small ghost" disabled={disabled || coins < buyPrice(it)} onClick={() => onBuy(it)}
                  aria-label={`Acheter un booster ${it.name} pour ${buyPrice(it)} pièces${buyPrice(it) < it.price ? ` au lieu de ${it.price}, remise membre` : ''}`}>
                  Acheter · {buyPrice(it) < it.price ? (<><s className="price-old">{fmt(it.price)}</s> <span className="price-new">{fmt(buyPrice(it))}</span></>) : fmt(it.price)} 🪙
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

// Collection choisie, retenue d'une visite à l'autre
const COLLECTION_KEY = 'o1o_collection'
const readSavedCollection = () => { try { const v = Number(window.localStorage.getItem(COLLECTION_KEY)); return v > 0 ? v : null } catch { return null } }
const saveCollection = (id) => { try { window.localStorage.setItem(COLLECTION_KEY, String(id)) } catch { /* stockage indisponible : le choix vaut pour cette visite */ } }

export default function Boosters({ goCollection, initialCategory = null }) {
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

  const subscriber = !!status?.subscription?.active
  // booster ouvert avec le stock gratuit : celui des abonnés (OneMore) pour un abonné
  const boosterName = subscriber && status?.subscription?.booster_name ? status?.standard_booster?.name : null
  const boosters = status?.boosters ?? 0
  const bonus = status?.bonus_boosters ?? 0
  const total = boosters + bonus
  // Collections ouvertes EN MÊME TEMPS : le joueur choisit celle dans laquelle il ouvre ses boosters ; tous les boosters de la page s'y rapportent
  const activeList = status?.active_categories ?? (status?.active_category_id ? [{ id: status.active_category_id, name: catalog.categoryMap[status.active_category_id]?.name, cards_taken: status.cards_taken, total_cards: status.total_cards }] : [])
  const [collPick, setCollPick] = useState(() => initialCategory ?? readSavedCollection())
  useEffect(() => { if (initialCategory) setCollPick(initialCategory) }, [initialCategory])
  const selectedCat = activeList.find((c) => c.id === collPick) ?? activeList[0] ?? null
  const category = selectedCat ? catalog.categoryMap[selectedCat.id] : undefined
  const pickCollection = (id) => { setCollPick(id); saveCollection(id) }
  // Boosters de chaque type : ceux sans collection + ceux liés à la collection choisie
  const linkedQty = (typeId) => (status?.linked_boosters ?? []).filter((l) => l.booster_type_id === typeId && l.category_id === selectedCat?.id).reduce((n, l) => n + l.quantity, 0)
  const boosterTypes = (status?.booster_types ?? []).map((b) => ({ ...b, quantity: b.quantity + linkedQty(b.id) }))
  // Étagère (3 paquets au plus) : le booster du stock gratuit (toujours montré), le booster Gold gagné s'il y en a un à ouvrir, et les autres boosters que le joueur a en stock.
  // L'ordre est celui réglé dans l'admin (« Ordre d'affichage » de chaque booster, 1 = en premier ; à égalité : stock gratuit, Gold, puis le plus ancien) : il décide aussi lesquels sont montrés s'il y en a trop.
  const goldRewards = status?.gold_rewards ?? []
  const hasGold = goldRewards.length > 0
  const [pick, setPick] = useState(null)   // clé du paquet choisi : 'main', 'gold' ou 't<id>' ; null = choix automatique
  const byOrder = (a, b) => (a.position ?? 1e9) - (b.position ?? 1e9)   // tri stable : à égalité, l'ordre d'arrivée (stock gratuit, Gold, puis boosters déjà classés par ordre et ancienneté par le serveur)
  const mainPack = { key: 'main', id: status?.standard_booster?.id, position: status?.standard_booster?.position, name: status?.standard_booster?.name, glow: status?.standard_booster?.glow, color: status?.standard_booster?.color, count: total }
  const goldPack = hasGold ? { key: 'gold', id: status?.reward_booster?.id, position: status?.reward_booster?.position, name: status?.reward_booster?.name ?? 'Gold', glow: status?.reward_booster?.glow, golden: true, count: goldRewards.length } : null
  const typePacks = boosterTypes.filter((b) => b.quantity > 0).map((b) => ({ key: `t${b.id}`, id: b.id, position: b.position, name: b.name, glow: b.glow, color: b.color, count: b.quantity }))
  const extraPacks = [...(goldPack ? [goldPack] : []), ...typePacks].sort(byOrder).slice(0, SHELF_MAX - 1)
  const shelfPacks = [mainPack, ...extraPacks].sort(byOrder)
  const shelfTypes = extraPacks.filter((p) => p.key.startsWith('t')).map((p) => boosterTypes.find((b) => b.id === p.id))
  const auto = total > 0 ? 'main' : hasGold ? 'gold' : shelfTypes.length === 0 ? 'main' : `t${shelfTypes[0].id}`   // par défaut : le stock gratuit, sinon le Gold, sinon le premier booster en stock
  const selectedKey = shelfPacks.some((p) => p.key === pick) ? pick : auto
  const selGold = selectedKey === 'gold' && hasGold
  const selType = selectedKey === 'main' || selGold ? null : shelfTypes.find((b) => `t${b.id}` === selectedKey) ?? null
  const nextGold = goldRewards[0]   // la plus ancienne récompense Gold à ouvrir
  const goldCard = catalog?.typeMap?.[nextGold?.type_id]
  const goldName = status?.reward_booster?.name ?? 'Gold'
  const canOpen = status && total > 0 && !overlay && !!category
  const canOpenSel = selGold ? !overlay && !!goldCard : selType ? !overlay && !!category && selType.quantity > 0 : canOpen
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

  const [oddsFor, setOddsFor] = useState(null)
  const coinsFree = Math.max(0, (status?.coins ?? 0) - (status?.coins_locked ?? 0))

  // Un booster acheté s'ouvre TOUT DE SUITE (il n'attend pas dans le stock). S'il ne peut pas s'ouvrir (collection terminée, réseau), il reste dans le stock et l'erreur est affichée.
  const [buying, setBuying] = useState(false)
  const confirmBuy = (it) => {
    const pay = buyPrice(it)
    return window.confirm(`Acheter un booster ${it.name} pour ${pay} pièces${pay < it.price ? ` (au lieu de ${it.price} : remise membre)` : ''} ?`)
  }
  async function buy(it) {
    if (buying || !confirmBuy(it)) return
    setError('')
    setNotice('')
    setBuying(true)
    try {
      const res = await api.buyBooster(it.id, 1, selectedCat?.id)
      setStatus(res.status)
      await open(false, 'type', it.id, { bought: it })
    } catch (e) {
      setError(explain(e))
    } finally {
      setBuying(false)
    }
  }
  // « Acheter un nouveau booster » à la fin de l'ouverture d'un booster payant : achat puis ouverture immédiate, sans quitter la fenêtre
  async function buyAgain(paid) {
    if (buying || !confirmBuy(paid)) return
    setBuying(true)
    try {
      const res = await api.buyBooster(paid.id, 1, selectedCat?.id)
      setStatus(res.status)
      await open(true, 'type', paid.id, { bought: paid })
    } catch (e) {
      setOverlay((o) => (o ? { ...o, buyError: explain(e) } : o))
    } finally {
      setBuying(false)
    }
  }

  // kind : 'normal' (un booster : le stock gratuit), 'type' (un booster d'un type du module Boosters) ou 'gold' (un booster Gold gagné en complétant une carte : rewardId)
  // ctx.bought : le booster payant qui vient d'être acheté (on l'ouvre sans attendre que le stock soit relu)
  async function open(fromSummary = false, kind = 'normal', rewardId = null, ctx = {}) {
    const isGold = kind === 'gold'
    const isType = kind === 'type'
    const typeInfo = isType ? (ctx.bought ?? boosterTypes.find((x) => x.id === rewardId)) : null
    // booster en vente contre des pièces : la fenêtre de résumé propose d'en racheter un
    const paid = isType && typeInfo?.price != null ? { id: typeInfo.id, name: typeInfo.name, glow: typeInfo.glow, color: typeInfo.color, price: typeInfo.price, member_price: typeInfo.member_price } : null
    const goldType = isGold ? catalog?.typeMap?.[goldRewards.find((g) => g.id === rewardId)?.type_id] : null
    const goldCategory = goldType ? catalog?.categoryMap?.[goldType.category_id] : null
    if (!(status && (isGold ? goldCategory : category) && (isGold ? true : isType ? (!!ctx.bought || typeInfo?.quantity > 0) : total > 0) && (fromSummary === true || !overlay))) return
    setError('')
    // nom du booster pendant l'ouverture : celui du module Boosters (Gold, type choisi, booster des abonnés pour un abonné)
    const shakeBooster = isGold ? status?.reward_booster : isType ? typeInfo : status?.standard_booster
    setOverlay({ phase: 'shake', categoryId: (goldCategory ?? category).id, golden: isGold, gold: isGold, label: shakeBooster?.name, glow: shakeBooster?.glow, color: shakeBooster?.color })
    const t0 = Date.now()
    try {
      const res = await withTimeout(isType ? api.openBoosterType(rewardId, selectedCat?.id) : isGold ? api.openGoldReward(rewardId) : api.openBooster(selectedCat?.id))
      setStatus(res.status)   // (une collection terminée entre-temps arrive comme une erreur « collection_closed » : rien n'est ouvert, le stock est intact)
      // Les cartes les plus rares sont révélées en dernier
      const cards = [...res.cards].sort(
        (a, b) => (rarityMap[b.rarity_id]?.sort_order ?? 0) - (rarityMap[a.rarity_id]?.sort_order ?? 0),
      )
      const golden = !!res.golden   // booster Gold gagné, ou booster ordinaire devenu Gold par hasard
      if (isGold) {
        await wait(Math.max(0, 1100 - (Date.now() - t0)))
      } else if (golden) {
        // Le booster se transforme en booster Gold avant de s'ouvrir
        setOverlay((o) => ({ ...o, phase: 'shake', golden: true, gold: true, label: res.booster?.name ?? status?.reward_booster?.name ?? 'Gold' }))
        await wait(1700)
      } else {
        await wait(Math.max(0, 700 - (Date.now() - t0)))
      }
      setOverlay((o) => ({ ...o, phase: 'tear', golden }))
      await wait(700)
      setOverlay({ phase: 'reveal', cards, idx: 0, golden, gold: isGold || golden, label: res.booster?.name, categoryId: res.category_id, nextCategoryId: res.status.active_category_id, paid })
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
        {shelfPacks.length > 1 ? (
          <PackShelf packs={shelfPacks} selected={selectedKey} category={category} disabled={!!overlay} onSelect={setPick} />
        ) : (
          <button className="pack-button" onClick={() => open()} disabled={!canOpen} aria-label={boosterName ? `Ouvrir un booster ${boosterName}` : 'Ouvrir un booster'}>
            <Pack dim={total === 0 || !category} category={category} label={status?.standard_booster?.name} glow={status?.standard_booster?.glow} color={status?.standard_booster?.color} />
          </button>
        )}

        {(selGold || category) && (
          <>
            <p className="pack-name">Booster{selGold ? ` ${goldName}` : selType ? ` ${selType.name}` : boosterName ? ` ${boosterName}` : ''}</p>
            {selGold ? (
              <p className="pack-collection">{catalog?.categoryMap?.[goldCard?.category_id]?.name ?? category?.name}</p>
            ) : activeList.length > 1 ? (
              <label className="select pack-collection">
                <span className="sr">Collection</span>
                <select value={selectedCat?.id ?? ''} disabled={!!overlay} onChange={(e) => pickCollection(Number(e.target.value))}>
                  {activeList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            ) : (
              <p className="pack-collection">{category.name}</p>
            )}
          </>
        )}
        <p className="stock">
          {status ? (
            selGold ? (
              <><strong>{fmt(goldRewards.length)}</strong> {goldRewards.length > 1 ? `boosters ${goldName} prêts` : `booster ${goldName} prêt`}<span className="muted stock-bonus"> · gagné avec {goldCard?.name ?? 'une carte complétée'}{goldRewards.length > 1 ? ' (puis les suivants)' : ''}</span></>
            ) : selType ? (
              <><strong>{fmt(selType.quantity)}</strong> {selType.quantity > 1 ? 'boosters prêts' : 'booster prêt'}<span className="muted stock-bonus"> · {selType.cards} carte{selType.cards > 1 ? 's' : ''} <InfoButton onClick={() => setOddsFor(selType)} label={`Chances du booster ${selType.name}`} /></span></>
            ) : total > 0 ? (
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

        <button className="btn accent big" onClick={() => (selGold ? open(false, 'gold', nextGold.id) : selType ? open(false, 'type', selType.id) : open())} disabled={!canOpenSel}>
          Ouvrir un booster{selGold ? ` ${goldName}` : selType ? ` ${selType.name}` : boosterName ? ` ${boosterName}` : ''}
        </button>

        <ExtraBoosters category={category} items={boosterTypes.filter((b) => !shelfTypes.some((s) => s.id === b.id))} coins={coinsFree} disabled={!!overlay || buying} onOpen={(it) => open(false, 'type', it.id)} onBuy={buy} onInfo={setOddsFor} />
        {oddsFor && category && <BoosterOddsSheet category={category} boosterType={oddsFor} rarityMap={rarityMap} onClose={() => setOddsFor(null)} />}
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
        {status && selectedCat && (
          <p className="fine">
            {selectedCat.name} : {fmt(selectedCat.cards_taken)} cartes tirées sur {fmt(selectedCat.total_cards)}.
          </p>
        )}
        {category && <Odds category={category} />}
        {status && !category && (
          <p className="msg info">Toutes les collections de boosters ont été entièrement tirées. De nouvelles arriveront bientôt.</p>
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
          catalog={catalog}
          boosters={total}
          onAgain={() => open(true)}
          coins={coinsFree}
          onBuyAgain={buyAgain}
          onCollection={() => { setOverlay(null); goCollection() }}
        />
      )}
    </section>
  )
}

export function Overlay({ overlay, setOverlay, rarityMap, catalog, boosters, onAgain, onCollection, coins = 0, onBuyAgain }) {
  const shownAt = useRef(Date.now())
  const close = () => setOverlay(null)
  const [zoom, setZoom] = useState(null)   // index de la carte ouverte en grand dans le résumé
  const [artDone, setArtDone] = useState(-1)   // index de la dernière carte Art Rare dont l'animation plein écran est terminée (ou passée)

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
        <Pack phase={overlay.phase} golden={overlay.golden} category={catalog?.categoryMap?.[overlay.categoryId]} label={overlay.label} glow={overlay.glow} color={overlay.color} />
        <p className="overlay-hint">{overlay.gold ? `Ton booster ${overlay.label ?? 'Gold'} !` : overlay.label ? `Ton booster ${overlay.label} !` : 'Ouverture…'}</p>
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
            Collection « {catalog.categoryMap[overlay.categoryId].name} » terminée !
            {catalog.categoryMap[overlay.nextCategoryId] ? ` « ${catalog.categoryMap[overlay.nextCategoryId].name} » est maintenant ouverte.` : ' Toutes les collections sont terminées.'}
          </p>
        )}
        <h2 className={`overlay-title ${golden ? 'gold' : ''}`}>{gold ? `Booster ${label ?? 'Gold'}` : label ? `Booster ${label}` : 'Ton booster'}</h2>
        <SummaryGrid cards={cards} rarityMap={rarityMap} catalog={catalog} revealAll={revealAll} onZoom={setZoom} />
        {zoom != null && <CardZoom cards={cards} index={zoom} rarityMap={rarityMap} catalog={catalog} onClose={() => setZoom(null)} onMove={(d) => setZoom((z) => Math.max(0, Math.min(cards.length - 1, (z ?? 0) + d)))} />}
        <p className="overlay-hint">
          {cards.length} carte{cards.length > 1 ? 's' : ''} ajoutée{cards.length > 1 ? 's' : ''} à ta collection{cards.filter((x) => x.is_new).length > 0 ? ` (dont ${cards.filter((x) => x.is_new).length} nouvelle${cards.filter((x) => x.is_new).length > 1 ? 's, placées' : ', placée'} dans ton album)` : ''}. Meilleure carte : {rarityMap[rarest.rarity_id]?.name}, {catalog?.typeMap?.[rarest.type_id]?.name}{catalog?.cardRef?.(rarest.type_id, rarest.base_rarity, rarest.number, rarest.series)}.
        </p>
        {overlay.buyError && <p className="msg error" role="alert">{overlay.buyError}</p>}
        <div className="overlay-actions">
          {overlay.paid && onBuyAgain && (
            <button className="btn accent buy-again" onClick={() => onBuyAgain(overlay.paid)} disabled={coins < buyPrice(overlay.paid)}
              aria-label={`Acheter un nouveau booster ${overlay.paid.name} pour ${buyPrice(overlay.paid)} pièces`}>
              Acheter un nouveau booster · {buyPrice(overlay.paid) < overlay.paid.price ? (<><s className="price-old">{fmt(overlay.paid.price)}</s> <span className="price-new">{fmt(buyPrice(overlay.paid))}</span></>) : fmt(overlay.paid.price)} 🪙
            </button>
          )}
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
  // Une carte Art Rare (même si son numéro l'affiche Alpha ou Omega) commence par une animation plein écran : l'illustration se réduit jusqu'à devenir la carte
  const art = isArtRare(rarityMap[c.base_rarity])
  const introOn = art && artDone !== idx
  const advance = () => {
    if (introOn) return
    if (Date.now() - shownAt.current > 250) next()
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Cartes du booster">
      {/* Tout le contenu d'une carte (légende, carte, feux d'artifice, texte) sous une seule clé : remplacé
          d'un seul bloc d'une carte à l'autre, jamais de morceau de la carte précédente qui traîne à l'écran. */}
      <div className="reveal-step" key={idx}>
        <p className="overlay-hint">{gold ? `Booster ${label ?? 'Gold'} : ` : ''}carte {idx + 1} sur {cards.length}</p>

        <div
          className={`reveal-card${art && !introOn ? ' art-landed' : ''}`}
          style={introOn ? { visibility: 'hidden' } : undefined}
          onClick={advance}
          role="button"
          tabIndex={0}
          aria-label={last ? 'Voir le résumé' : 'Carte suivante'}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance() } }}
        >
          <Card typeId={c.type_id} base={c.base_rarity} series={c.series} number={c.number} rarity={rarity} size="lg" isNew={!!c.is_new} glow shine />
        </div>

        {introOn && <ArtIntro type={catalog?.typeMap?.[c.type_id]} onDone={() => setArtDone(idx)} />}
        {/* feux d'artifice : ceux de la rareté spéciale, sinon dorés pour une Art Rare ; ils partent quand l'animation plein écran est finie */}
        {!introOn && (isSpecial(rarity) ? <Fireworks rarity={rarity} /> : art && <Fireworks rarity={GOLD_FIREWORKS} />)}
        {c.is_new && <p className="reveal-new">⭐ Nouvelle carte : elle est déjà dans ton album.</p>}
        <p className="overlay-hint">{last ? 'Touche la carte pour voir le résumé.' : 'Touche la carte pour passer à la suivante.'}</p>
      </div>
    </div>
  )
}

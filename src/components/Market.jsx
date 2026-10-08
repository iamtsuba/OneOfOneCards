import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { useGame, useNow, fmt, fmtAgo, fmtClock, fmtCoins } from '../game'
import Card from './Card'

const KINDS = [[null, 'Toutes'], ['auction', 'Enchères'], ['buy_now', 'Achat direct']]
const SORTS = [['ending', 'Fin proche'], ['price', 'Prix croissant'], ['rarity', 'Plus rares'], ['recent', 'Récentes']]
const VIEWS = [['browse', 'À vendre'], ['mine', 'Mes ventes'], ['offers', 'Mes offres'], ['favorites', 'Favoris']]

export default function Market({ initialView = 'browse', initialListingId = null }) {
  const { status, setStatus, refreshStatus, rarityMap, catalog } = useGame()
  const [view, setView] = useState(initialView)
  const [kind, setKind] = useState(null)
  const [sort, setSort] = useState('ending')
  const [browse, setBrowse] = useState([])
  const [mine, setMine] = useState([])
  const [offers, setOffers] = useState([])
  const [favorites, setFavorites] = useState([])
  const [skew, setSkew] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const now = useNow()
  const lastLoad = useRef(0)
  const consumedInitial = useRef(false)

  const load = useCallback(async () => {
    lastLoad.current = Date.now()
    try {
      if (view === 'browse') {
        const rows = await api.marketList({ kind, sort, limit: 60 })
        if (rows[0]?.server_now) setSkew(new Date(rows[0].server_now).getTime() - Date.now())
        setBrowse(rows)
      } else if (view === 'mine') {
        const rows = await api.marketMine()
        if (rows[0]?.server_now) setSkew(new Date(rows[0].server_now).getTime() - Date.now())
        setMine(rows.map((r) => ({ ...r, is_mine: r.role === 'seller' })))
      } else if (view === 'offers') {
        setOffers(await api.myOffers())
      } else if (view === 'favorites') {
        setFavorites(await api.listFavorites())
      }
      setError('')
    } catch (e) {
      setError(explain(e))
    } finally {
      setLoading(false)
    }
  }, [view, kind, sort])

  useEffect(() => { setLoading(true); load() }, [load])
  useEffect(() => { refreshStatus().catch(() => {}) }, [refreshStatus])
  useEffect(() => {
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [load])

  // Arrivée depuis une notification : ouvre directement l'annonce visée, une seule fois
  useEffect(() => {
    if (consumedInitial.current || !initialListingId || view !== 'browse') return
    if (browse.some((r) => r.listing_id === initialListingId)) {
      setSelectedId(initialListingId)
      consumedInitial.current = true
    }
  }, [browse, initialListingId, view])

  const rows = view === 'browse' ? browse : mine
  const ended = rows.some((r) => r.status !== 'sold' && r.status !== 'expired' && r.status !== 'cancelled' && r.ends_at && new Date(r.ends_at).getTime() <= now + skew)
  useEffect(() => {
    if (!ended || Date.now() - lastLoad.current < 3000) return
    const t = setTimeout(() => { load(); refreshStatus().catch(() => {}) }, 1200)
    return () => clearTimeout(t)
  }, [ended, now, load, refreshStatus])

  const selected = browse.find((r) => r.listing_id === selectedId) || mine.find((r) => r.listing_id === selectedId)
  const left = (r) => (r.ends_at ? new Date(r.ends_at).getTime() - (now + skew) : null)

  return (
    <section className="page">
      <h1 className="page-title">Marché</h1>

      {status && (
        <p className="wallet">
          <strong>{fmtCoins(status.coins)}</strong>
          {status.coins_locked > 0 && <span className="muted"> dont {fmt(status.coins_locked)} bloquée{status.coins_locked > 1 ? 's' : ''} dans tes enchères</span>}
        </p>
      )}

      <div className="segmented" role="tablist" aria-label="Marché">
        {VIEWS.map(([v, label]) => (
          <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{label}</button>
        ))}
      </div>

      {error && <p className="msg error" role="alert">{error}</p>}

      {view === 'browse' && (
        <>
          <div className="chips" role="group" aria-label="Type d’annonce">
            {KINDS.map(([k, label]) => (
              <button key={String(k)} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)} aria-pressed={kind === k}>{label}</button>
            ))}
          </div>
          <div className="toolbar">
            <span className="muted">{loading ? 'Chargement…' : `${fmt(browse.length)} annonce${browse.length > 1 ? 's' : ''}`}</span>
            <label className="select">
              <span className="sr">Trier</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>

          {!loading && browse.length === 0 ? (
            <div className="empty">
              <p><strong>Aucune annonce pour l’instant.</strong></p>
              <p>Ouvre ta collection, choisis une carte à toi et mets-la en vente.</p>
            </div>
          ) : (
            <ul className="tiles">
              {browse.map((r) => {
                const ms = left(r)
                return (
                  <li key={r.listing_id}>
                    <button className="tile" onClick={() => setSelectedId(r.listing_id)}>
                      <Card typeId={r.card_type} series={r.card_series} number={r.card_number} rarity={rarityMap[r.rarity_id]} size="sm" />
                      <span className="tile-name">{catalog.typeMap[r.card_type]?.name}</span>
                      <span className="tile-kind">{r.kind === 'auction' ? 'Enchère' : 'Achat direct'}</span>
                      <span className="tile-price">{fmtCoins(r.price)}</span>
                      {r.kind === 'auction' && ms !== null && (
                        <span className={`tile-time ${ms < 60000 ? 'urgent' : ''}`}>{fmtClock(ms)}</span>
                      )}
                      {r.is_mine && <span className="tile-flag">Ta vente</span>}
                      {r.is_leading && <span className="tile-flag good">Tu es en tête</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {view === 'mine' && (
        <>
          {!loading && mine.length === 0 ? (
            <div className="empty">
              <p><strong>Rien pour l’instant.</strong></p>
              <p>Tes annonces, tes enchères et tes achats des 7 derniers jours apparaîtront ici.</p>
            </div>
          ) : (
            <ul className="mine-list">
              {mine.map((r) => {
                const active = r.status === 'active'
                return (
                  <li key={r.listing_id}>
                    <button className="mine-row" onClick={() => active && setSelectedId(r.listing_id)} disabled={!active}>
                      <div className="mine-card"><Card typeId={r.card_type} series={r.card_series} number={r.card_number} rarity={rarityMap[r.rarity_id]} size="sm" /></div>
                      <div className="mine-text">
                        <strong>{catalog.typeMap[r.card_type]?.name} {r.card_number}/{r.card_series}</strong>
                        <span>{describe(r, left(r))}</span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {view === 'offers' && (
        <OffersPanel rows={offers} loading={loading} rarityMap={rarityMap} catalog={catalog} status={status} setStatus={setStatus} reload={load} />
      )}

      {view === 'favorites' && (
        <FavoritesPanel rows={favorites} loading={loading} rarityMap={rarityMap} catalog={catalog} reload={load} onOpenListing={(id) => { setView('browse'); setSelectedId(id) }} />
      )}

      {selected && (
        <ListingModal
          row={selected}
          ms={left(selected)}
          rarity={rarityMap[selected.rarity_id]}
          coins={status?.coins ?? 0}
          onClose={() => setSelectedId(null)}
          onStatus={setStatus}
          reload={load}
        />
      )}
    </section>
  )
}

function describe(r, ms) {
  const clock = ms !== null && ms !== undefined ? fmtClock(ms) : ''
  if (r.status === 'active') {
    if (r.role === 'seller') {
      if (r.kind === 'buy_now') return `En vente à ${fmtCoins(r.price)}.`
      return r.bid_count > 0
        ? `Enchère à ${fmtCoins(r.current_bid)} (${r.bid_count} offre${r.bid_count > 1 ? 's' : ''}). Fin dans ${clock}.`
        : `Enchère sans offre pour l’instant. Fin dans ${clock}.`
    }
    return r.is_leading
      ? `Tu es en tête avec ${fmtCoins(r.my_bid)}. Fin dans ${clock}.`
      : `Tu as été dépassé (ta mise : ${fmtCoins(r.my_bid)}, actuellement ${fmtCoins(r.current_bid)}). Fin dans ${clock}.`
  }
  if (r.role === 'seller') {
    if (r.status === 'sold') return `Vendue ${fmtCoins(r.final_price)}.`
    if (r.status === 'expired') return 'Enchère terminée sans offre : la carte est restée dans ta collection.'
    return 'Annonce retirée.'
  }
  if (r.role === 'buyer') return `${r.kind === 'auction' ? 'Enchère gagnée' : 'Achetée'} pour ${fmtCoins(r.final_price)}. La carte est à toi.`
  return `Enchère perdue (ta mise : ${fmtCoins(r.my_bid)}). Tes pièces t’ont été rendues.`
}

const OFFER_STATUS_LABEL = { pending: 'En attente', accepted: 'Acceptée', declined: 'Refusée', cancelled: 'Annulée' }

function OffersPanel({ rows, loading, rarityMap, catalog, status, setStatus, reload }) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  async function act(id, fn) {
    setBusyId(id)
    setError('')
    try {
      const res = await fn()
      if (res?.status) setStatus(res.status)
      await reload()
    } catch (e) {
      setError(explain(e))
    } finally {
      setBusyId(null)
    }
  }

  if (!loading && rows.length === 0) {
    return (
      <div className="empty">
        <p><strong>Aucune offre pour l’instant.</strong></p>
        <p>Propose un prix pour la carte d’un autre joueur depuis sa collection, ou attends une offre sur une de tes cartes.</p>
      </div>
    )
  }

  return (
    <>
      {error && <p className="msg error" role="alert">{error}</p>}
      <ul className="mine-list">
        {rows.map((r) => (
          <li key={r.offer_id}>
            <div className="mine-row offer-row">
              <div className="mine-card"><Card typeId={r.card_type} series={r.card_series} number={r.card_number} rarity={rarityMap[r.rarity_id]} size="sm" /></div>
              <div className="mine-text">
                <strong>{catalog.typeMap[r.card_type]?.name} {r.card_number}/{r.card_series}</strong>
                <span>
                  {r.role === 'buyer' ? `Ton offre à ${r.counterpart_name} : ` : `Offre de ${r.counterpart_name} : `}
                  {fmtCoins(r.amount)} · {OFFER_STATUS_LABEL[r.status] ?? r.status} · {fmtAgo(r.created_at)}
                </span>
                {r.status === 'pending' && r.role === 'seller' && (
                  <div className="row">
                    <button className="btn accent sm" disabled={busyId === r.offer_id} onClick={() => act(r.offer_id, () => api.respondOffer(r.offer_id, true))}>Accepter</button>
                    <button className="btn ghost sm" disabled={busyId === r.offer_id} onClick={() => act(r.offer_id, () => api.respondOffer(r.offer_id, false))}>Refuser</button>
                  </div>
                )}
                {r.status === 'pending' && r.role === 'buyer' && (
                  <div className="row">
                    <button className="btn ghost sm" disabled={busyId === r.offer_id} onClick={() => act(r.offer_id, () => api.cancelOffer(r.offer_id))}>Retirer l’offre</button>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

function FavoritesPanel({ rows, loading, rarityMap, catalog, reload, onOpenListing }) {
  const [busyKey, setBusyKey] = useState(null)
  const [error, setError] = useState('')

  async function unfav(r) {
    const key = `${r.card_type}-${r.card_series}-${r.card_number}`
    setBusyKey(key)
    setError('')
    try {
      await api.toggleFavorite(r.card_type, r.card_series, r.card_number)
      await reload()
    } catch (e) {
      setError(explain(e))
    } finally {
      setBusyKey(null)
    }
  }

  if (!loading && rows.length === 0) {
    return (
      <div className="empty">
        <p><strong>Aucun favori pour l’instant.</strong></p>
        <p>Dans ta collection, ouvre une carte que tu n’as pas et mets-la en favori (♡) pour être prévenu si elle arrive sur le marché.</p>
      </div>
    )
  }

  return (
    <>
      {error && <p className="msg error" role="alert">{error}</p>}
      <ul className="mine-list">
        {rows.map((r) => {
          const key = `${r.card_type}-${r.card_series}-${r.card_number}`
          return (
            <li key={key}>
              <div className="mine-row offer-row">
                <div className="mine-card"><Card typeId={r.card_type} series={r.card_series} number={r.card_number} rarity={rarityMap[r.rarity_id]} size="sm" /></div>
                <div className="mine-text">
                  <strong>{catalog.typeMap[r.card_type]?.name} {r.card_number}/{r.card_series}</strong>
                  {r.listing_id ? (
                    <span>En vente à {fmtCoins(r.listing_price)} ({r.listing_kind === 'auction' ? 'enchère' : 'achat direct'}).</span>
                  ) : r.owner_name ? (
                    <span>Possédée par {r.owner_name}, pas en vente actuellement.</span>
                  ) : (
                    <span>Encore dans les boosters.</span>
                  )}
                  <div className="row">
                    {r.listing_id && <button className="btn accent sm" onClick={() => onOpenListing(r.listing_id)}>Voir l’annonce</button>}
                    <button className="btn ghost sm" disabled={busyKey === key} onClick={() => unfav(r)}>Retirer des favoris</button>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function ListingModal({ row, ms, rarity, coins, onClose, onStatus, reload }) {
  const [amount, setAmount] = useState(String(row.min_bid ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const lastMin = useRef(row.min_bid)

  // Si quelqu'un surenchérit pendant que la fenêtre est ouverte, on remet la mise minimale à jour
  useEffect(() => {
    if (row.min_bid != null && row.min_bid !== lastMin.current) {
      lastMin.current = row.min_bid
      setAmount((a) => (Number(a) < row.min_bid ? String(row.min_bid) : a))
    }
  }, [row.min_bid])

  async function act(fn, done) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await fn()
      if (res?.status) onStatus(res.status)
      await reload()
      if (done === 'close') onClose()
      else setNotice(done)
    } catch (e) {
      setError(explain(e))
      reload()
    } finally {
      setBusy(false)
    }
  }

  const isAuction = row.kind === 'auction'
  const mine = row.is_mine || row.role === 'seller'
  const bid = Number(amount)
  const ended = ms !== null && ms <= 0

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Détail de l’annonce" onClick={onClose}>
      <div className="detail" onClick={(e) => e.stopPropagation()}>
        <div className="detail-card">
          <Card typeId={row.card_type} series={row.card_series} number={row.card_number} rarity={rarity} size="lg" glow shine />
        </div>
        <p className="reveal-line"><strong>{rarity?.name}</strong> : carte {row.card_number} de la série de {row.card_series}.</p>

        <div className="sheet">
          {isAuction ? (
            <>
              <p className="sheet-line">
                <strong>{row.bid_count > 0 ? `Offre actuelle : ${fmtCoins(row.current_bid)}` : `Départ à ${fmtCoins(row.price)}, aucune offre`}</strong>
                {row.bid_count > 0 && <span className="muted"> ({row.bid_count} offre{row.bid_count > 1 ? 's' : ''})</span>}
              </p>
              <p className={`sheet-line ${ms !== null && ms < 60000 ? 'urgent' : ''}`}>
                {ended ? 'Enchère terminée.' : <>Fin dans <strong className="clock">{fmtClock(ms)}</strong>{ms < 60000 ? ' : une mise relance le compteur à 1 minute.' : ''}</>}
              </p>
              {row.is_leading && <p className="msg info">Tu es en tête avec {fmtCoins(row.current_bid)}.</p>}
            </>
          ) : (
            <p className="sheet-line"><strong>Prix : {fmtCoins(row.price)}</strong></p>
          )}
          <p className="muted">Vendeur : {mine ? 'toi' : row.seller_name}.</p>

          {mine ? (
            isAuction && row.bid_count > 0 ? (
              <p className="muted">Des offres ont été faites : l’annonce ne peut plus être retirée.</p>
            ) : (
              <button className="btn ghost" disabled={busy} onClick={() => act(() => api.cancelListing(row.listing_id), 'close')}>Retirer de la vente</button>
            )
          ) : isAuction ? (
            <>
              <label>
                Ta mise, en pièces (minimum {fmt(row.min_bid)})
                <input type="number" inputMode="numeric" min={row.min_bid} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
              <p className="fine">Tu as {fmtCoins(coins)}. Ta mise est bloquée tant que tu es en tête, et rendue si quelqu’un te dépasse.</p>
              <button className="btn accent" disabled={busy || ended || !(bid >= row.min_bid)} onClick={() => act(() => api.placeBid(row.listing_id, bid), 'Mise enregistrée.')}>
                Enchérir à {fmtCoins(bid || 0)}
              </button>
            </>
          ) : (
            <>
              {coins < row.price && <p className="msg error">Il te manque {fmtCoins(row.price - coins)}.</p>}
              <button className="btn accent" disabled={busy || coins < row.price} onClick={() => act(() => api.buyNow(row.listing_id), 'close')}>
                Acheter pour {fmtCoins(row.price)}
              </button>
            </>
          )}
          {notice && <p className="msg info" role="status">{notice}</p>}
          {error && <p className="msg error" role="alert">{error}</p>}
        </div>
        <button className="btn ghost-light" onClick={onClose}>Fermer</button>
      </div>
    </div>
  )
}

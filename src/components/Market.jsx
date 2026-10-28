import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { useGame, useNow, fmt, fmtAgo, fmtClock, fmtCoins } from '../game'
import Card from './Card'
import CardModal from './CardModal'

const KINDS = [[null, 'Toutes'], ['auction', 'Enchères'], ['buy_now', 'Achat direct']]
const SORTS = [['ending', 'Fin proche'], ['price', 'Prix croissant'], ['rarity', 'Plus rares'], ['recent', 'Récentes']]
const VIEWS = [['browse', 'À vendre'], ['mine', 'Mes ventes'], ['offers', 'Mes offres'], ['favorites', 'Favoris']]

export default function Market({ initialView = 'browse', initialListingId = null }) {
  const { status, setStatus, refreshStatus, rarityMap, catalog } = useGame()
  const [view, setView] = useState(initialView)
  const [kind, setKind] = useState(null)
  const [sort, setSort] = useState('ending')
  const [rarity, setRarity] = useState('')      // filtre par rareté affichée ('' = toutes)
  const [missing, setMissing] = useState(false) // seulement les cartes qui manquent à mon album
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
        const rows = await api.marketList({ kind, sort, limit: 60, rarity, missing })
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
  }, [view, kind, sort, rarity, missing])

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
        <BrowsePanel rows={browse} loading={loading} kind={kind} setKind={setKind} sort={sort} setSort={setSort} rarity={rarity} setRarity={setRarity} missing={missing} setMissing={setMissing}
          rarityMap={rarityMap} catalog={catalog} left={left} onSelect={setSelectedId} />
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
                      <div className="mine-card"><Card typeId={r.card_type} base={r.card_base} series={r.card_series} number={r.card_number} rarity={rarityMap[r.rarity_id]} size="sm" /></div>
                      <div className="mine-text">
                        <strong>{catalog.typeMap[r.card_type]?.name}{catalog.cardRef(r.card_type, r.card_base, r.card_number, r.card_series)}</strong>
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
        <FavoritesPanel rows={favorites} loading={loading} rarityMap={rarityMap} catalog={catalog} reload={load} onOpenListing={(id) => { setView('browse'); setSelectedId(id) }} onGoMarket={() => setView('browse')} />
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

// Liste des annonces à vendre : type d'annonce, filtre « Non possédées » (cartes dont l'emplacement d'album manque encore), filtre par rareté, tri ; une pastille « Non possédée » sur chaque
// annonce dont la carte n'est pas encore à moi. Les filtres sont appliqués par le serveur avant la limite d'annonces.
export function BrowsePanel({ rows, loading, kind, setKind, sort, setSort, rarity, setRarity, missing, setMissing, rarityMap, catalog, left, onSelect }) {
  const rarities = Object.values(rarityMap ?? {}).sort((a, b) => b.sort_order - a.sort_order)
  const filtered = missing || !!rarity
  return (
    <>
      <div className="chips wrap" role="group" aria-label="Filtres des annonces">
        {KINDS.map(([k, label]) => (
          <button key={String(k)} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)} aria-pressed={kind === k}>{label}</button>
        ))}
        <button className={`chip ${missing ? 'on' : ''}`} onClick={() => setMissing(!missing)} aria-pressed={missing}>Non possédées</button>
      </div>
      <div className="toolbar">
        <span className="muted">{loading ? 'Chargement…' : `${fmt(rows.length)} annonce${rows.length > 1 ? 's' : ''}`}</span>
        <span className="toolbar-selects">
          <label className="select">
            <span className="sr">Filtrer par rareté</span>
            <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
              <option value="">Toutes les raretés</option>
              {rarities.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="select">
            <span className="sr">Trier</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </span>
      </div>

      {!loading && rows.length === 0 ? (
        <div className="empty">
          {filtered ? (
            <>
              <p><strong>Aucune annonce ne correspond à ces filtres.</strong></p>
              <p><button type="button" className="btn ghost sm" onClick={() => { setMissing(false); setRarity('') }}>Retirer les filtres</button></p>
            </>
          ) : (
            <>
              <p><strong>Aucune annonce pour l’instant.</strong></p>
              <p>Ouvre ta collection, choisis une carte à toi et mets-la en vente.</p>
            </>
          )}
        </div>
      ) : (
        <ul className="tiles">
          {rows.map((r) => {
            const ms = left(r)
            return (
              <li key={r.listing_id}>
                <button className="tile" onClick={() => onSelect(r.listing_id)}>
                  <Card typeId={r.card_type} base={r.card_base} series={r.card_series} number={r.card_number} rarity={rarityMap[r.rarity_id]} size="sm" />
                  <span className="tile-name">{catalog.typeMap[r.card_type]?.name}</span>
                  <span className="tile-kind">{r.kind === 'auction' ? 'Enchère' : 'Achat direct'}</span>
                  <span className="tile-price">{fmtCoins(r.price)}</span>
                  {r.kind === 'auction' && ms !== null && (
                    <span className={`tile-time ${ms < 60000 ? 'urgent' : ''}`}>{fmtClock(ms)}</span>
                  )}
                  {r.is_mine && <span className="tile-flag">Ta vente</span>}
                  {r.is_leading && <span className="tile-flag good">Tu es en tête</span>}
                  {r.i_own === false && <span className="tile-flag missing">Non possédée</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

// Offres reçues et envoyées. À chaque proposition, l'AUTRE partie répond : accepter, refuser ou faire une CONTRE-OFFRE (qui lui renvoie la balle) ; l'auteur d'une proposition peut la retirer.
export function OffersPanel({ rows, loading, rarityMap, catalog, status, setStatus, reload }) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')
  const [counter, setCounter] = useState(null)   // contre-offre en préparation : { id, value }

  async function act(id, fn) {
    setBusyId(id)
    setError('')
    try {
      const res = await fn()
      if (res?.status) setStatus(res.status)
      setCounter(null)
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
        {rows.map((r) => {
          // Serveur à jour : il dit à qui de répondre. Sinon : comme avant (le vendeur répond, l'acheteur retire).
          const known = r.waiting_on_me !== undefined
          const mustReply = r.status === 'pending' && (known ? r.waiting_on_me : r.role === 'seller')
          const mine = r.status === 'pending' && (known ? r.proposed_by_me : r.role === 'buyer')
          const negotiated = (r.rounds ?? 0) > 0
          const busy = busyId === r.offer_id
          const open = counter?.id === r.offer_id
          const value = open ? counter.value : ''
          const valid = Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) !== r.amount
          let line
          if (mustReply) line = `${negotiated ? 'Contre-offre' : 'Offre'} de ${r.counterpart_name} : `
          else if (mine) line = `${negotiated ? 'Ta contre-offre' : 'Ton offre'} à ${r.counterpart_name} : `
          else line = r.role === 'buyer' ? `Ton offre à ${r.counterpart_name} : ` : `Offre de ${r.counterpart_name} : `
          return (
            <li key={r.offer_id}>
              <div className="mine-row offer-row">
                <div className="mine-card"><Card typeId={r.card_type} base={r.card_base} series={r.card_series} number={r.card_number} rarity={rarityMap[r.rarity_id]} size="sm" /></div>
                <div className="mine-text">
                  <strong>{catalog.typeMap[r.card_type]?.name}{catalog.cardRef(r.card_type, r.card_base, r.card_number, r.card_series)}</strong>
                  <span>
                    {line}{fmtCoins(r.amount)} · {OFFER_STATUS_LABEL[r.status] ?? r.status} · {fmtAgo(r.created_at)}
                  </span>
                  {mustReply && !open && (
                    <div className="row">
                      <button className="btn accent sm" disabled={busy} onClick={() => act(r.offer_id, () => api.respondOffer(r.offer_id, true))}>Accepter</button>
                      <button className="btn ghost sm" disabled={busy} onClick={() => act(r.offer_id, () => api.respondOffer(r.offer_id, false))}>Refuser</button>
                      {known && <button className="btn ghost sm" disabled={busy} onClick={() => setCounter({ id: r.offer_id, value: String(r.amount) })}>Contre-offre</button>}
                    </div>
                  )}
                  {mustReply && open && (
                    <form className="row counter-form" onSubmit={(e) => { e.preventDefault(); if (valid) act(r.offer_id, () => api.counterOffer(r.offer_id, Number(value))) }}>
                      <label>
                        <span className="sr">Ta contre-offre en pièces</span>
                        <input type="number" inputMode="numeric" min="1" step="1" value={value} onChange={(e) => setCounter({ id: r.offer_id, value: e.target.value })} aria-label="Ta contre-offre en pièces" />
                      </label>
                      <button className="btn accent sm" disabled={busy || !valid}>Envoyer la contre-offre</button>
                      <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setCounter(null)}>Annuler</button>
                    </form>
                  )}
                  {mine && (
                    <>
                      <small className="fine">En attente de la réponse de {r.counterpart_name}.</small>
                      <div className="row">
                        <button className="btn ghost sm" disabled={busy} onClick={() => act(r.offer_id, () => api.cancelOffer(r.offer_id))}>{negotiated ? 'Retirer ma contre-offre' : 'Retirer l’offre'}</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}

// Favoris : pour chaque carte, ce qu'il en est (en vente, chez un joueur, encore dans les boosters), si elle manque encore à mon album (« Manque à ton album » / « Déjà dans ton album »)
// et, quand un autre joueur la possède, un bouton « Faire une offre » (même formulaire que depuis la collection).
export function FavoritesPanel({ rows, loading, rarityMap, catalog, reload, onOpenListing, onGoMarket = () => {} }) {
  const [busyKey, setBusyKey] = useState(null)
  const [error, setError] = useState('')
  const [sel, setSel] = useState(null)   // carte dont on prépare l'offre

  async function unfav(r) {
    const key = `${r.card_type}-${r.card_series}-${r.card_number}`
    setBusyKey(key)
    setError('')
    try {
      await api.toggleFavorite(r.card_type, r.card_base, r.card_series, r.card_number)
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
                <div className="mine-card"><Card typeId={r.card_type} base={r.card_base} series={r.card_series} number={r.card_number} rarity={rarityMap[r.rarity_id]} size="sm" /></div>
                <div className="mine-text">
                  <strong>{catalog.typeMap[r.card_type]?.name}{catalog.cardRef(r.card_type, r.card_base, r.card_number, r.card_series)}</strong>
                  {/* Est-ce que cet emplacement de mon album est encore vide ? (information : une offre reste toujours possible) */}
                  {r.is_mine ? <small className="friend-tag owned">C’est ta carte</small>
                    : r.i_own === true ? <small className="friend-tag owned">Déjà dans ton album</small>
                    : r.i_own === false ? <small className="friend-tag missing">Manque à ton album</small> : null}
                  {r.listing_id ? (
                    <span>En vente à {fmtCoins(r.listing_price)} ({r.listing_kind === 'auction' ? 'enchère' : 'achat direct'}).</span>
                  ) : r.owner_name ? (
                    <span>Possédée par {r.owner_name}, pas en vente actuellement.</span>
                  ) : (
                    <span>Encore dans les boosters.</span>
                  )}
                  <div className="row">
                    {r.listing_id && <button className="btn accent sm" onClick={() => onOpenListing(r.listing_id)}>Voir l’annonce</button>}
                    {r.owner_id && !r.is_mine && (
                      <button className={`btn sm${r.listing_id ? ' ghost' : ' accent'}`} onClick={() => setSel({ typeId: r.card_type, base: r.card_base, series: r.card_series, number: r.card_number, rarityId: r.rarity_id, state: 'taken', ownerName: r.owner_name, favorited: true, iOwn: r.i_own })}>
                        Faire une offre
                      </button>
                    )}
                    <button className="btn ghost sm" disabled={busyKey === key} onClick={() => unfav(r)}>Retirer des favoris</button>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      {sel && <CardModal sel={sel} rarity={rarityMap[sel.rarityId]} onClose={() => setSel(null)} onChanged={() => setSel(null)} onRefresh={reload} goMarket={(v) => { setSel(null); onGoMarket(v) }} />}
    </>
  )
}

function ListingModal({ row, ms, rarity, coins, onClose, onStatus, reload }) {
  const { catalog } = useGame()
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
          <Card typeId={row.card_type} base={row.card_base} series={row.card_series} number={row.card_number} rarity={rarity} size="lg" glow shine />
        </div>
        <p className="reveal-line"><strong>{rarity?.name}</strong>{catalog.numberHidden(row.card_type, row.card_base, row.card_series) ? ' : numéro masqué' : ` : carte ${row.card_number} de la série de ${row.card_series}`}.</p>

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

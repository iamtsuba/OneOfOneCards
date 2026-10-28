import { useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { useGame, fmtCoins } from '../game'
import Card from './Card'

// Détail d'une carte : état, revente à la banque, mise en vente sur le marché
export default function CardModal({ sel, rarity, onClose, onChanged, onRefresh, goMarket }) {
  const { status, setStatus, catalog } = useGame()
  const [mode, setMode] = useState('buy_now')
  const [price, setPrice] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [favorited, setFavorited] = useState(!!sel.favorited)
  const [favBusy, setFavBusy] = useState(false)
  const [offerAmount, setOfferAmount] = useState('')
  const [offerSent, setOfferSent] = useState(false)

  const type = catalog.typeMap[sel.typeId]
  const category = type ? catalog.categoryMap[type.category_id] : null
  const categoryClosed = !!category && (status?.closed_categories ?? []).includes(category.id)

  async function run(fn) {
    setBusy(true)
    setError('')
    try {
      const res = await fn()
      if (res?.status) setStatus(res.status)
      onChanged()
    } catch (e) {
      setError(explain(e))
      setBusy(false)
      setConfirm(false)
    }
  }

  const sell = () => run(() => api.sellDirect(sel.typeId, sel.base, sel.series, sel.number))
  const list = () =>
    run(() => api.listCard({ type: sel.typeId, base: sel.base, series: sel.series, number: sel.number, kind: mode, price: mode === 'buy_now' ? Number(price) : null }))

  async function toggleFav() {
    setFavBusy(true)
    setError('')
    try {
      const res = await api.toggleFavorite(sel.typeId, sel.base, sel.series, sel.number)
      setFavorited(!!res.favorited)
      onRefresh?.()
    } catch (e) {
      setError(explain(e))
    } finally {
      setFavBusy(false)
    }
  }

  async function sendOffer() {
    setBusy(true)
    setError('')
    try {
      await api.makeOffer(sel.typeId, sel.base, sel.series, sel.number, Number(offerAmount))
      setOfferSent(true)
      onRefresh?.()
    } catch (e) {
      setError(explain(e))
    } finally {
      setBusy(false)
    }
  }

  const sellPrice = status?.sell_prices?.[rarity?.id ?? sel.rarityId] ?? status?.direct_sell_price ?? 1   // prix de revente rapide de la rareté de cette carte (sinon le prix général)
  const toneMsg = {
    taken: 'Cette carte a déjà été tirée par un autre joueur. Tu peux peut-être l’acheter sur le marché.',
    free: category?.closed
      ? 'Cette carte n’a pas été tirée.'
      : 'Cette carte n’a pas encore été tirée : elle est toujours dans les boosters de sa collection.',
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Détail de la carte" onClick={onClose}>
      <div className="detail" onClick={(e) => e.stopPropagation()}>
        <div className="detail-card">
          <Card typeId={sel.typeId} base={sel.base} series={sel.series} number={sel.number} rarity={rarity} size="lg" glow shine />
        </div>
        <p className="reveal-line">
          <strong>{rarity?.name}</strong> : {type?.name}{catalog.numberHidden(sel.typeId, sel.base, sel.series) ? '' : `, carte ${sel.number} de la série de ${sel.series}`}
          {category ? ` (${category.name})` : ''}.
        </p>

        {sel.state !== 'mine' ? (
          <>
            <button className={`btn-heart ${favorited ? 'on' : ''}`} onClick={toggleFav} disabled={favBusy}
              aria-pressed={favorited} aria-label={favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}>
              <span aria-hidden="true">{favorited ? '♥' : '♡'}</span> {favorited ? 'Favorite' : 'Mettre en favori'}
            </button>
            <p className="overlay-hint">{sel.friend ? `Un double de ${sel.ownerName}.${sel.iOwn === true ? ' Tu as déjà une carte de cet emplacement.' : sel.iOwn === false ? ' Cette carte te manque.' : ''} Propose-lui une offre : tes pièces ne sont débitées que si elle est acceptée.` : `${toneMsg[sel.state] ?? ''}${sel.state === 'taken' && sel.iOwn === true ? ' Tu as déjà une carte de cet emplacement dans ton album.' : sel.state === 'taken' && sel.iOwn === false ? ' Cette carte manque à ton album.' : ''}`}</p>
            {sel.state === 'taken' && (
              <div className="sheet">
                <section>
                  <h3>Faire une offre</h3>
                  {offerSent ? (
                    <p className="msg info" role="status">
                      Offre envoyée à {sel.ownerName ?? 'ce joueur'}. Tu seras prévenu de sa réponse.
                    </p>
                  ) : (
                    <>
                      <p className="muted">
                        Propose un prix à {sel.ownerName ?? 'ce joueur'}. Tes pièces ne sont débitées que si l’offre est acceptée.
                      </p>
                      <label>
                        Ton offre, en pièces
                        <input type="number" inputMode="numeric" min="1" step="1" value={offerAmount}
                          onChange={(e) => setOfferAmount(e.target.value)} placeholder="Ex. 15" />
                      </label>
                      <button className="btn accent" onClick={sendOffer} disabled={busy || !(Number(offerAmount) >= 1)}>
                        Envoyer l’offre
                      </button>
                    </>
                  )}
                </section>
              </div>
            )}
            {sel.state === 'taken' && !sel.friend && <button className="btn ghost" onClick={() => goMarket('browse')}>Aller au marché</button>}
          </>
        ) : sel.inAlbum ? (
          <>
            <p className="overlay-hint">Cette carte est dans ton album : elle ne peut pas être vendue. Retire-la de l’album pour la vendre.</p>
            <button className="btn ghost-light" disabled={busy} onClick={() => run(() => api.clearAlbumPick(sel.typeId, sel.rarityId))}>Retirer de l’album</button>
          </>
        ) : sel.listingId ? (
          <>
            <p className="overlay-hint">Cette carte est en vente sur le marché.</p>
            <button className="btn accent" onClick={() => goMarket('mine')}>Voir mes ventes</button>
          </>
        ) : (
          <div className="sheet">
            <section>
              <h3>Revendre à la banque</h3>
              {categoryClosed ? (
                <p className="muted">
                  Indisponible : la collection « {category.name} » est terminée, la progression est définitive. Tu peux vendre cette carte sur le marché.
                </p>
              ) : (
                <>
                  <p className="muted">
                    Tu reçois {fmtCoins(sellPrice)}. La carte est définitivement retirée du jeu : elle ne reviendra plus dans les boosters.
                  </p>
                  {confirm ? (
                    <div className="row">
                      <button className="btn accent" onClick={sell} disabled={busy}>Oui, revendre</button>
                      <button className="btn ghost" onClick={() => setConfirm(false)} disabled={busy}>Annuler</button>
                    </div>
                  ) : (
                    <button className="btn ghost" onClick={() => setConfirm(true)} disabled={busy}>Revendre pour {fmtCoins(sellPrice)}</button>
                  )}
                </>
              )}
            </section>

            <section>
              <h3>Mettre sur le marché</h3>
              <div className="segmented small" role="tablist" aria-label="Type de vente">
                <button role="tab" aria-selected={mode === 'buy_now'} className={mode === 'buy_now' ? 'on' : ''} onClick={() => setMode('buy_now')}>Achat direct</button>
                <button role="tab" aria-selected={mode === 'auction'} className={mode === 'auction' ? 'on' : ''} onClick={() => setMode('auction')}>Enchère {status?.auction_minutes ?? 60} min</button>
              </div>
              {mode === 'buy_now' ? (
                <label>
                  Ton prix, en pièces
                  <input type="number" inputMode="numeric" min="1" step="1" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Ex. 25" />
                </label>
              ) : (
                <p className="muted">
                  Départ à {fmtCoins(status?.auction_start_price ?? 1)}. Si quelqu’un enchérit dans la dernière minute, le compteur repart à 1 minute.
                </p>
              )}
              <button className="btn" onClick={list} disabled={busy || (mode === 'buy_now' && !(Number(price) >= 1))}>Mettre en vente</button>
            </section>
          </div>
        )}

        {error && <p className="msg error" role="alert">{error}</p>}
        <button className="btn ghost-light" onClick={onClose}>Fermer</button>
      </div>
    </div>
  )
}

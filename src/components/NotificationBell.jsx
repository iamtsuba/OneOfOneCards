import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api'
import { useGame, fmtAgo, fmtCoins } from '../game'

const POLL_MS = 20000

const KIND_ICON = {
  favorite_listed: '♥',
  offer_received: '💰',
  offer_accepted: '✅',
  offer_declined: '✖',
  offer_countered: '↔',
  offer_sold: '🪙',
  offer_counter_declined: '✖',
}

function describe(n, catalog) {
  const name = catalog?.typeMap?.[n.card_type]?.name ?? 'une carte'
  const who = n.actor_name || 'Un joueur'
  const ref = catalog?.cardRef?.(n.card_type, n.card_base, n.card_number, n.card_series)?.trim()
  const card = `${name}${ref ? ` (${ref})` : ''}`
  switch (n.kind) {
    case 'favorite_listed':
      return `${who} a mis en vente ${card}, dans tes favoris, pour ${fmtCoins(n.amount)}.`
    case 'offer_received':
      return `${who} te propose ${fmtCoins(n.amount)} pour ta carte ${card}.`
    case 'offer_accepted':
      return `Ton offre de ${fmtCoins(n.amount)} pour ${card} a été acceptée : la carte est à toi.`
    case 'offer_declined':
      return `Ton offre de ${fmtCoins(n.amount)} pour ${card} a été refusée.`
    case 'offer_countered':
      return `${who} te fait une contre-offre de ${fmtCoins(n.amount)} pour ${card}.`
    case 'offer_sold':
      return `${who} a accepté ta contre-offre de ${fmtCoins(n.amount)} pour ${card} : la carte est vendue.`
    case 'offer_counter_declined':
      return `${who} a refusé ta contre-offre de ${fmtCoins(n.amount)} pour ${card}.`
    default:
      return ''
  }
}

// Cloche de notifications : carte favorite mise en vente, offre reçue ou offre répondue
export default function NotificationBell({ onOpenListing, onOpenOffers }) {
  const { catalog } = useGame()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const load = useCallback(() => { api.notificationsList(30).then(setItems).catch(() => {}) }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!open) return
    load()
    function onDocClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open, load])

  const unread = items[0]?.unread_total ?? 0

  async function openItem(n) {
    setOpen(false)
    try { await api.notificationsMarkRead([n.id]) } catch { /* tant pis, ça repassera non lu */ }
    setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
    if (n.kind === 'favorite_listed' && n.listing_id) onOpenListing(n.listing_id)
    else onOpenOffers()
  }

  async function markAllRead() {
    try { await api.notificationsMarkRead(null) } catch { return }
    setItems((cur) => cur.map((x) => ({ ...x, read: true, unread_total: 0 })))
  }

  return (
    <div className="bell-wrap" ref={ref}>
      <button className="bell-btn" onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread > 0 ? `, ${unread} non lue${unread > 1 ? 's' : ''}` : ''}`} aria-expanded={open}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 10.5a6 6 0 1 1 12 0c0 4 1.3 5.3 1.8 6H4.2c.5-.7 1.8-2 1.8-6Z" /><path d="M10 19.5a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && <span className="tab-badge bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="bell-popup" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
            {unread > 0 && <button className="link" onClick={markAllRead}>Tout marquer comme lu</button>}
          </div>
          {items.length === 0 ? (
            <p className="muted bell-empty">Rien pour l’instant.</p>
          ) : (
            <ul className="bell-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button className={`bell-item ${n.read ? '' : 'unread'}`} onClick={() => openItem(n)}>
                    <span className="bell-icon" aria-hidden="true">{KIND_ICON[n.kind] ?? '•'}</span>
                    <span className="bell-text">
                      <span>{describe(n, catalog)}</span>
                      <span className="bell-time">{fmtAgo(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

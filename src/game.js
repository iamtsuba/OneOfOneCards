import { createContext, useContext, useEffect, useState } from 'react'

export const GameContext = createContext(null)
export const useGame = () => useContext(GameContext)

export const fmt = (n) => new Intl.NumberFormat('fr-FR').format(n ?? 0)
export const fmtPct = (x) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: x < 1 ? 3 : 1 }).format(x) + ' %'
export const fmtDate = (d) =>
  new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

export function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`
}

// Temps restant avant la prochaine recharge (corrigé du décalage d'horloge avec le serveur)
export function useCountdown(status, onZero) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const remaining = status?.next_refill_at
    ? new Date(status.next_refill_at).getTime() - (now + (status.offset || 0))
    : null
  const due = remaining !== null && remaining <= 0

  useEffect(() => {
    if (!due) return
    const t = setTimeout(() => onZero?.(), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due, status?.next_refill_at])

  return remaining
}

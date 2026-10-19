import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import * as api from '../api'
import { explain } from '../api'
import { useGame, fmt } from '../game'
import Card from './Card'
import LegalSheet from './Legal'
import Admin from './Admin'
import { ProPanel, ProConsent } from './Pro'

// Carte d'identité : le pseudo est unique et définitif, il n'y a donc pas de bouton pour le changer
export function IdentityCard({ username, email }) {
  return (
    <div className="panel">
      <div className="identity">
        <div>
          <p className="identity-name">{username}</p>
          <p className="muted">{email}</p>
          <p className="fine">Ton pseudo est unique et définitif.</p>
        </div>
      </div>
    </div>
  )
}

// Les quatre tuiles du profil. « Cartes complétées » = cartes dont tous les emplacements de l'album sont remplis (un booster Gold gagné chacune)
export function StatTiles({ stats, status }) {
  return (
    <dl className="stats">
      <div><dt>Pièces</dt><dd>{fmt(status?.coins)}</dd></div>
      <div><dt>Cartes à toi</dt><dd>{fmt(stats.unique_owned)}</dd></div>
      <div><dt>Boosters ouverts</dt><dd>{fmt(status?.boosters_opened)}</dd></div>
      <div><dt>Cartes complétées</dt><dd>{stats.types_completed == null ? '–' : fmt(stats.types_completed)}</dd></div>
    </dl>
  )
}

export default function Profile({ session }) {
  const { status, rarityMap, catalog, refreshStatus } = useGame()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [terms, setTerms] = useState(false)
  const [admin, setAdmin] = useState(false)
  const [proOpen, setProOpen] = useState(false)
  const [proPending, setProPending] = useState(false)   // retour de paiement : pass en cours d'activation
  const [notice, setNotice] = useState('')
  const returned = useRef(false)

  // Retour de la page de paiement Stripe (?pro=success&session_id=… ou ?pro=cancel)
  useEffect(() => {
    if (returned.current) return
    const params = new URLSearchParams(window.location.search)
    const back = params.get('pro')
    const sessionId = params.get('session_id')
    if (!back) return
    returned.current = true
    params.delete('pro')
    params.delete('session_id')
    const qs = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash)
    if (back === 'cancel') { setNotice('Achat annulé : tu n’as pas été débité.'); return }
    if (back !== 'success') return
    // Paiement validé : le serveur relit la session chez Stripe et donne le pass tout de suite ; le webhook fait pareil en différé.
    // Pendant ce temps, plus de bouton d'achat (« activation en cours »).
    setProPending(true)
    setNotice('Merci ! Ton paiement est validé, activation de ton pass…')
    ;(async () => {
      try { if (sessionId) await api.confirmSubscription(sessionId) } catch { /* le webhook prendra le relais */ }
      for (let i = 0; i < 12; i++) {
        let s = null
        try { s = await refreshStatus() } catch { /* on réessaie */ }
        if (s?.subscription?.active) { setProPending(false); setNotice(`Bienvenue dans ${s.subscription.name} ! Tes avantages sont actifs, à vie.`); return }
        await new Promise((r) => setTimeout(r, 2500))
      }
      setProPending(false)
      setNotice('Ton paiement est bien enregistré, mais l’activation prend plus de temps que prévu. Recharge la page dans un instant ; si rien ne change, contacte-nous.')
    })()
  }, [refreshStatus])

  useEffect(() => {
    api.getStats().then(setStats).catch((e) => setError(explain(e)))
  }, [])

  const rarest = stats?.rarest
  return (
    <section className="page">
      <h1 className="page-title">Profil</h1>

      <IdentityCard username={status?.username} email={session.user.email} />
      {error && <p className="msg error" role="alert">{error}</p>}
      {notice && <p className="msg info" role="status">{notice}</p>}

      <ProPanel sub={status?.subscription} baseMinutes={status?.subscription?.active ? null : status?.regen_minutes} gift={(status?.booster_types ?? []).find((b) => b.id === status?.subscription?.gift_id) ?? null} onBuy={() => setProOpen(true)} pending={proPending} />

      {stats && <StatTiles stats={stats} status={status} />}

      {rarest && (
        <div className="panel rarest">
          <div className="rarest-card">
            <Card typeId={rarest.type_id} base={rarest.base_rarity} series={rarest.series} number={rarest.number} rarity={rarityMap[rarest.rarity_id]} size="sm" glow />
          </div>
          <div>
            <p className="identity-name">Ta carte la plus rare</p>
            <p className="muted">{rarityMap[rarest.rarity_id]?.name}, {catalog.typeMap[rarest.type_id]?.name}{catalog.numberHidden(rarest.type_id, rarest.base_rarity, rarest.series) ? '' : ` ${rarest.number} sur ${rarest.series}`}.</p>
          </div>
        </div>
      )}

      <button className="btn ghost wide" onClick={() => setTerms(true)}>Conditions de vente et mentions légales</button>
      <button className="btn ghost wide" onClick={() => setAdmin(true)}>Console admin</button>
      <button className="btn ghost wide" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
      {admin && <Admin onClose={() => setAdmin(false)} />}
      {terms && <LegalSheet onClose={() => setTerms(false)} />}
      {proOpen && <ProConsent status={status} onClose={() => setProOpen(false)} />}
    </section>
  )
}

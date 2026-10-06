import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import * as api from '../api'
import { explain } from '../api'
import { useGame, fmt } from '../game'
import Card from './Card'
import LegalSheet from './Legal'

export default function Profile({ session }) {
  const { status, refreshStatus, rarityMap } = useGame()
  const [stats, setStats] = useState(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [terms, setTerms] = useState(false)

  useEffect(() => {
    api.getStats().then(setStats).catch((e) => setError(explain(e)))
  }, [])

  async function save(e) {
    e.preventDefault()
    setError('')
    try {
      await api.setUsername(name)
      await refreshStatus()
      setEditing(false)
      setMsg('Pseudo mis à jour.')
    } catch (err) {
      setError(explain(err))
    }
  }

  const rarest = stats?.rarest
  return (
    <section className="page">
      <h1 className="page-title">Profil</h1>

      <div className="panel">
        {editing ? (
          <form className="inline-form" onSubmit={save}>
            <label>
              Pseudo
              <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={24} autoFocus required />
            </label>
            <div className="row">
              <button className="btn">Enregistrer</button>
              <button type="button" className="btn ghost" onClick={() => setEditing(false)}>Annuler</button>
            </div>
          </form>
        ) : (
          <div className="identity">
            <div>
              <p className="identity-name">{status?.username}</p>
              <p className="muted">{session.user.email}</p>
            </div>
            <button className="btn ghost" onClick={() => { setName(status?.username || ''); setEditing(true); setMsg('') }}>Changer le pseudo</button>
          </div>
        )}
        {msg && <p className="msg info" role="status">{msg}</p>}
        {error && <p className="msg error" role="alert">{error}</p>}
      </div>

      {stats && (
        <dl className="stats">
          <div><dt>Pièces</dt><dd>{fmt(status?.coins)}</dd></div>
          <div><dt>Cartes à toi</dt><dd>{fmt(stats.unique_owned)}</dd></div>
          <div><dt>Boosters ouverts</dt><dd>{fmt(status?.boosters_opened)}</dd></div>
          <div><dt>Séries commencées</dt><dd>{fmt(stats.series_started)}</dd></div>
        </dl>
      )}

      {rarest && (
        <div className="panel rarest">
          <div className="rarest-card">
            <Card series={rarest.series} number={rarest.number} rarity={rarityMap[rarest.rarity_id]} size="sm" glow />
          </div>
          <div>
            <p className="identity-name">Ta carte la plus rare</p>
            <p className="muted">{rarityMap[rarest.rarity_id]?.name}, {rarest.number} sur {rarest.series}.</p>
          </div>
        </div>
      )}

      <button className="btn ghost wide" onClick={() => setTerms(true)}>Conditions de vente et mentions légales</button>
      <button className="btn ghost wide" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
      {terms && <LegalSheet onClose={() => setTerms(false)} />}
    </section>
  )
}

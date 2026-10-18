import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import * as api from '../api'
import { explain } from '../api'
import { useGame, fmt } from '../game'
import Card from './Card'
import LegalSheet from './Legal'
import Admin from './Admin'

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
  const { status, rarityMap, catalog } = useGame()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const [terms, setTerms] = useState(false)
  const [admin, setAdmin] = useState(false)

  useEffect(() => {
    api.getStats().then(setStats).catch((e) => setError(explain(e)))
  }, [])

  const rarest = stats?.rarest
  return (
    <section className="page">
      <h1 className="page-title">Profil</h1>

      <IdentityCard username={status?.username} email={session.user.email} />
      {error && <p className="msg error" role="alert">{error}</p>}

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
    </section>
  )
}

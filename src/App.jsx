import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import * as api from './api'
import { explain } from './api'
import { GameContext } from './game'
import Auth from './components/Auth'
import Brand from './components/Brand'
import TabBar from './components/TabBar'
import Boosters from './components/Boosters'
import Collection from './components/Collection'
import Profile from './components/Profile'

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="splash"><Brand size="lg" /></div>
  if (!session) return <Auth />
  return <Game key={session.user.id} session={session} />
}

function Game({ session }) {
  const [tab, setTab] = useState('boosters')
  const [rarities, setRarities] = useState(null)
  const [status, setStatusRaw] = useState(null)
  const [error, setError] = useState('')

  const setStatus = useCallback((s) => {
    setStatusRaw({ ...s, offset: new Date(s.server_now).getTime() - Date.now() })
  }, [])
  const refreshStatus = useCallback(async () => setStatus(await api.getStatus()), [setStatus])

  const load = useCallback(async () => {
    setError('')
    try {
      const [r] = await Promise.all([api.getRarities(), refreshStatus()])
      setRarities(r)
    } catch (e) {
      setError(explain(e))
    }
  }, [refreshStatus])

  useEffect(() => { load() }, [load])

  const rarityMap = useMemo(() => Object.fromEntries((rarities || []).map((r) => [r.id, r])), [rarities])
  const ctx = useMemo(() => ({ rarities, rarityMap, status, setStatus, refreshStatus }), [rarities, rarityMap, status, setStatus, refreshStatus])

  if (error) {
    return (
      <main className="auth">
        <div className="auth-card">
          <Brand size="lg" />
          <p className="msg error" role="alert">{error}</p>
          <button className="btn accent" onClick={load}>Réessayer</button>
          <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
        </div>
      </main>
    )
  }
  if (!rarities || !status) return <div className="splash"><Brand size="lg" /></div>

  return (
    <GameContext.Provider value={ctx}>
      <header className="topbar"><Brand /></header>
      <main>
        {tab === 'boosters' && <Boosters goCollection={() => setTab('collection')} />}
        {tab === 'collection' && <Collection />}
        {tab === 'profile' && <Profile session={session} />}
      </main>
      <TabBar tab={tab} onChange={setTab} boosters={status.boosters} />
    </GameContext.Provider>
  )
}

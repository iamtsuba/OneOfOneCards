import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import * as api from './api'
import { explain } from './api'
import { GameContext, fmtCoins } from './game'
import Auth from './components/Auth'
import Brand from './components/Brand'
import TabBar from './components/TabBar'
import Boosters from './components/Boosters'
import Collection from './components/Collection'
import Market from './components/Market'
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
  const [marketView, setMarketView] = useState('browse')
  const [rarities, setRarities] = useState(null)
  const [catalogRaw, setCatalogRaw] = useState(null)
  const [status, setStatusRaw] = useState(null)
  const [error, setError] = useState('')

  const setStatus = useCallback((s) => {
    setStatusRaw({ ...s, offset: new Date(s.server_now).getTime() - Date.now() })
  }, [])
  const refreshStatus = useCallback(async () => setStatus(await api.getStatus()), [setStatus])

  const refreshCatalog = useCallback(async () => setCatalogRaw(await api.getCatalog()), [])

  const load = useCallback(async () => {
    setError('')
    try {
      const [r] = await Promise.all([api.getRarities(), refreshStatus(), refreshCatalog()])
      setRarities(r)
    } catch (e) {
      setError(explain(e))
    }
  }, [refreshStatus, refreshCatalog])

  useEffect(() => { load() }, [load])

  // Une catégorie vient de se terminer (ou a été modifiée) : on relit le catalogue
  const activeCategory = status?.active_category_id
  useEffect(() => {
    if (catalogRaw) refreshCatalog().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory])

  const rarityMap = useMemo(() => Object.fromEntries((rarities || []).map((r) => [r.id, r])), [rarities])
  const catalog = useMemo(() => {
    if (!catalogRaw) return null
    return {
      ...catalogRaw,
      typeMap: Object.fromEntries(catalogRaw.types.map((t) => [t.id, t])),
      categoryMap: Object.fromEntries(catalogRaw.categories.map((c) => [c.id, c])),
    }
  }, [catalogRaw])
  const ctx = useMemo(
    () => ({ rarities, rarityMap, catalog, refreshCatalog, status, setStatus, refreshStatus }),
    [rarities, rarityMap, catalog, refreshCatalog, status, setStatus, refreshStatus],
  )

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
  if (!rarities || !status || !catalog) return <div className="splash"><Brand size="lg" /></div>

  return (
    <GameContext.Provider value={ctx}>
      <header className="topbar">
        <Brand />
        <button className="coin-pill" onClick={() => { setMarketView('browse'); setTab('market') }} aria-label={`${fmtCoins(status.coins)}, ouvrir le marché`}>
          <i className="coin" aria-hidden="true">1</i>
          {fmtCoins(status.coins)}
        </button>
      </header>
      <main>
        {tab === 'boosters' && <Boosters goCollection={() => setTab('collection')} />}
        {tab === 'collection' && <Collection goMarket={(v) => { setMarketView(v || 'browse'); setTab('market') }} />}
        {tab === 'market' && <Market key={marketView} initialView={marketView} />}
        {tab === 'profile' && <Profile session={session} />}
      </main>
      <TabBar tab={tab} onChange={(t) => { if (t === 'market') setMarketView('browse'); setTab(t) }} boosters={status.boosters + (status.bonus_boosters || 0)} />
    </GameContext.Provider>
  )
}

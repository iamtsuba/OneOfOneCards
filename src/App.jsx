import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import * as api from './api'
import { explain } from './api'
import { GameContext, fmt, fmtCoins } from './game'
import { captureInviteFromUrl, runPendingInvite, inviteMessage } from './invite'
import Auth from './components/Auth'
import Brand from './components/Brand'
import TabBar from './components/TabBar'
import Friends from './components/Friends'
import GoldRewardModal from './components/GoldRewardModal'
import Boosters from './components/Boosters'
import Collection from './components/Collection'
import Market from './components/Market'
import Profile from './components/Profile'
import RewardModal from './components/RewardModal'
import EnvBanner from './components/EnvBanner'
import NotificationBell from './components/NotificationBell'
import { numberVisible, typeSeries, checklistNumbers, cardStyle } from './bands'

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  let screen
  if (session === undefined) screen = <div className="splash"><Brand size="lg" /></div>
  else if (!session) screen = <Auth />
  else screen = <Game key={session.user.id} session={session} />
  return (
    <>
      <EnvBanner />
      {screen}
    </>
  )
}

// Lien d'invitation (?ami=…) : retenu dès l'arrivée sur le site, même avant la connexion, pour être accepté une fois connecté
captureInviteFromUrl(window)

function Game({ session }) {
  // retour du paiement du pass Pro (?pro=…) : on arrive sur le profil, où le pass s'active
  const [tab, setTab] = useState(() => (new URLSearchParams(window.location.search).has('pro') ? 'profile' : 'boosters'))
  const [marketView, setMarketView] = useState('browse')
  const [marketListingId, setMarketListingId] = useState(null)
  const [boostersCategory, setBoostersCategory] = useState(null)   // collection à montrer sur la page Boosters (arrivée depuis l'annonce d'une récompense)
  const [revealing, setRevealing] = useState(false)
  const [rarities, setRarities] = useState(null)
  const [catalogRaw, setCatalogRaw] = useState(null)
  const [status, setStatusRaw] = useState(null)
  const [error, setError] = useState('')
  const [inviteNotice, setInviteNotice] = useState('')

  const setStatus = useCallback((s) => {
    setStatusRaw({ ...s, offset: new Date(s.server_now).getTime() - Date.now() })
  }, [])
  const refreshStatus = useCallback(async () => { const s = await api.getStatus(); setStatus(s); return s }, [setStatus])

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
  // Une invitation d'ami en attente (lien ouvert avant de se connecter ou de créer le compte) : on devient ami, puis on arrive sur l'écran Amis
  useEffect(() => {
    let alive = true
    runPendingInvite(window.localStorage, api.friendAcceptInvite).then((r) => {
      if (!alive || r.kind === 'none') return
      setInviteNotice(inviteMessage(r, explain))
      if (r.kind !== 'error') { setTab('friends'); refreshStatus().catch(() => {}) }
    })
    return () => { alive = false }
  }, [refreshStatus])
  // Abonné : le fond du jeu passe du gris clair au doré clair
  const subscriberOn = !!status?.subscription?.active
  useEffect(() => {
    document.documentElement.classList.toggle('subscriber', subscriberOn)
    return () => document.documentElement.classList.remove('subscriber')
  }, [subscriberOn])

  // Une collection vient de se terminer (ou a été modifiée) : on relit le catalogue
  const activeCategory = status?.active_category_id
  useEffect(() => {
    if (catalogRaw) refreshCatalog().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory])

  const rarityMap = useMemo(() => Object.fromEntries((rarities || []).map((r) => [r.id, r])), [rarities])
  const catalog = useMemo(() => {
    if (!catalogRaw) return null
    const typeMap = Object.fromEntries(catalogRaw.types.map((t) => [t.id, t]))
    const categoryMap = Object.fromEntries(catalogRaw.categories.map((c) => [c.id, c]))
    const rowsByType = {}
    for (const r of catalogRaw.typeRarities ?? []) (rowsByType[r.type_id] ??= []).push(r)
    const lists = checklistNumbers(catalogRaw.types)
    return {
      ...catalogRaw,
      typeMap,
      categoryMap,
      // Raretés par type : nombre de séries du type, numéros masqués, numéro de checklist « [k/N] »
      seriesOf: (typeId) => typeSeries(typeMap[typeId], categoryMap[typeMap[typeId]?.category_id]),
      cardStyle: (typeId, base) => cardStyle(rowsByType[typeId], base),
      numberHidden: (typeId, base, series) => !numberVisible(rowsByType[typeId], base, series),
      cardRef: (typeId, base, number, series) => (numberVisible(rowsByType[typeId], base, series) ? ` ${number}/${series}` : ''),
      checklist: (typeId) => lists[typeId] ?? null,
    }
  }, [catalogRaw])
  const ctx = useMemo(
    () => ({ rarities, rarityMap, catalog, refreshCatalog, status, setStatus, refreshStatus, setRevealing }),
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
        <div className="topbar-actions">
          <button className="coin-pill" onClick={() => { setMarketView('browse'); setMarketListingId(null); setTab('market') }} aria-label={`${fmtCoins(status.coins)}, ouvrir le marché`}>
            <i className="coin" aria-hidden="true">1</i>
            <span className="coin-num">{fmt(status.coins)}</span><span className="coin-unit"> {Math.abs(Number(status.coins)) > 1 ? 'pièces' : 'pièce'}</span>
          </button>
          <NotificationBell
            onOpenListing={(id) => { setMarketView('browse'); setMarketListingId(id); setTab('market') }}
            onOpenOffers={() => { setMarketView('offers'); setMarketListingId(null); setTab('market') }}
          />
        </div>
      </header>
      <main>
        {inviteNotice && (
          <p className="msg info invite-notice" role="status">{inviteNotice} <button type="button" className="link" onClick={() => setInviteNotice('')}>Fermer</button></p>
        )}
        {tab === 'boosters' && <Boosters goCollection={() => setTab('collection')} initialCategory={boostersCategory} />}
        {tab === 'collection' && <Collection goMarket={(v) => { setMarketView(v || 'browse'); setMarketListingId(null); setTab('market') }} />}
        {tab === 'market' && <Market key={`${marketView}-${marketListingId || ''}`} initialView={marketView} initialListingId={marketListingId} />}
        {tab === 'friends' && <Friends />}
        {tab === 'profile' && <Profile session={session} />}
      </main>
      {!revealing && (status.unseen_rewards ?? []).length > 0 && (
        <RewardModal
          rewards={status.unseen_rewards}
          onClose={async (openNow) => {
            try { setStatus(await api.ackRewards()) } catch { /* l'annonce réapparaîtra */ }
            if (openNow) setTab('boosters')
          }}
        />
      )}
      {!revealing && (status.unseen_rewards ?? []).length === 0 && (status.reward_notices ?? []).length > 0 && (
        <GoldRewardModal
          rewards={status.reward_notices}
          onClose={async (openNow) => {
            const first = status.reward_notices[0]
            try { setStatus(await api.ackGoldRewards()) } catch { /* l'annonce réapparaîtra */ }
            if (openNow) { setBoostersCategory(first?.category_id ?? null); setTab('boosters') }
          }}
        />
      )}
      {!revealing && (status.unseen_rewards ?? []).length === 0 && (status.reward_notices ?? []).length === 0 && (status.gold_rewards ?? []).some((g) => !g.seen) && (
        <GoldRewardModal
          rewards={status.gold_rewards.filter((g) => !g.seen)}
          onClose={async (openNow) => {
            try { setStatus(await api.ackGoldRewards()) } catch { /* l'annonce réapparaîtra */ }
            if (openNow) setTab('boosters')
          }}
        />
      )}
      <TabBar tab={tab} onChange={(t) => { if (t === 'market') { setMarketView('browse'); setMarketListingId(null) } setTab(t) }} boosters={status.boosters + (status.bonus_boosters || 0)} requests={status.friend_requests || 0} />
    </GameContext.Provider>
  )
}

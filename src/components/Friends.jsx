import { useCallback, useEffect, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { useGame, fmt } from '../game'
import Card from './Card'
import CardModal from './CardModal'

// Page « Amis » : chercher un joueur, gérer les demandes, voir la collection d'un ami et ses doubles, lui proposer une offre sur un double.
// Les vues (FriendsView, FriendCollectionView) sont pures : tout vient des propriétés, c'est ce qui est testé sans navigateur.

const plural = (n, one, many) => `${fmt(n)} ${n > 1 ? many : one}`

export function FriendsView({ rows, results, query, notice, error, busy, onQuery, onSearch, onRequest, onRespond, onRemove, onOpen }) {
  const received = (rows ?? []).filter((r) => r.relation === 'received')
  const sent = (rows ?? []).filter((r) => r.relation === 'sent')
  const friends = (rows ?? []).filter((r) => r.relation === 'friend')
  return (
    <div className="page friends-page">
      <h2 className="page-title">Amis</h2>

      <section className="friends-add" aria-label="Ajouter un ami">
        <label htmlFor="friend-q">Ajouter un ami</label>
        <div className="friends-search">
          <input id="friend-q" value={query} placeholder="Pseudo du joueur" maxLength={30} autoComplete="off" onChange={(e) => onQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSearch()} />
          <button type="button" className="btn" disabled={busy || query.trim().length < 2} onClick={onSearch}>Chercher</button>
        </div>
        {results && (
          <ul className="friend-rows" aria-label="Résultats">
            {results.length === 0 && <li className="muted">Aucun joueur trouvé.</li>}
            {results.map((r) => (
              <li key={r.user_id}>
                <strong>{r.username}</strong>
                {r.relation === 'none' && <button type="button" className="btn small" disabled={busy} onClick={() => onRequest(r.user_id)}>Ajouter</button>}
                {r.relation === 'sent' && <span className="muted">Demande envoyée</span>}
                {r.relation === 'received' && <button type="button" className="btn small" disabled={busy} onClick={() => onRequest(r.user_id)}>Accepter</button>}
                {r.relation === 'friend' && <span className="muted">Déjà ami</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {notice && <p className="msg info" role="status">{notice}</p>}
      {error && <p className="msg error" role="alert">{error}</p>}
      {rows === null && !error && <p className="muted">Chargement…</p>}

      {received.length > 0 && (
        <section aria-label="Demandes reçues">
          <h3>Demandes reçues</h3>
          <ul className="friend-rows">
            {received.map((r) => (
              <li key={r.friendship_id}>
                <strong>{r.username}</strong>
                <span className="friend-actions">
                  <button type="button" className="btn small" disabled={busy} onClick={() => onRespond(r.friendship_id, true)}>Accepter</button>
                  <button type="button" className="btn small ghost" disabled={busy} onClick={() => onRespond(r.friendship_id, false)}>Refuser</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sent.length > 0 && (
        <section aria-label="Demandes envoyées">
          <h3>Demandes envoyées</h3>
          <ul className="friend-rows">
            {sent.map((r) => (
              <li key={r.friendship_id}>
                <strong>{r.username}</strong>
                <button type="button" className="btn small ghost" disabled={busy} onClick={() => onRemove(r.user_id, r.username)}>Annuler</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Mes amis">
        <h3>Mes amis{friends.length > 0 ? ` (${friends.length})` : ''}</h3>
        {rows !== null && friends.length === 0 && <p className="muted">Aucun ami pour l’instant. Cherche un joueur par son pseudo.</p>}
        <ul className="friend-rows">
          {friends.map((r) => (
            <li key={r.friendship_id} className="friend-row">
              <span className="friend-name"><strong>{r.username}</strong><small className="muted">{plural(r.cards, 'carte', 'cartes')} · {plural(r.doubles, 'double', 'doubles')}</small></span>
              <span className="friend-actions">
                <button type="button" className="btn small" onClick={() => onOpen(r)}>Voir</button>
                <button type="button" className="btn small ghost" disabled={busy} onClick={() => onRemove(r.user_id, r.username)} aria-label={`Retirer ${r.username}`}>Retirer</button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

// Collection d'un ami : toutes ses cartes, ou seulement ses doubles (touche un double pour lui faire une offre)
export function FriendCollectionView({ friend, cards, total, doublesTotal, doublesOnly, loading, error, rarityMap, onToggle, onPick, onMore, onBack }) {
  const shown = cards ?? []
  const more = shown.length < total
  return (
    <div className="page friends-page">
      <button type="button" className="btn ghost small" onClick={onBack}>← Amis</button>
      <h2 className="page-title">Collection de {friend.username}</h2>
      <div className="segmented" role="tablist" aria-label="Cartes à afficher">
        <button type="button" role="tab" aria-selected={!doublesOnly} className={!doublesOnly ? 'on' : ''} onClick={() => onToggle(false)}>Toutes{doublesOnly ? '' : ` (${fmt(total)})`}</button>
        <button type="button" role="tab" aria-selected={doublesOnly} className={doublesOnly ? 'on' : ''} onClick={() => onToggle(true)}>Doubles ({fmt(doublesTotal)})</button>
      </div>
      {error && <p className="msg error" role="alert">{error}</p>}
      {loading && shown.length === 0 && <p className="muted">Chargement…</p>}
      {!loading && shown.length === 0 && !error && <p className="muted">{doublesOnly ? `${friend.username} n’a aucun double pour le moment.` : `${friend.username} n’a aucune carte pour le moment.`}</p>}
      {shown.length > 0 && <p className="fine">Touche un double pour proposer une offre à {friend.username}.</p>}
      <ul className="friend-cards">
        {shown.map((c) => {
          const rarity = rarityMap[c.rarity_id]
          const key = `${c.card_type}-${c.card_base}-${c.card_series}-${c.card_number}`
          return (
            <li key={key}>
              <button type="button" className={`friend-card${c.is_double ? ' double' : ''}`} disabled={!c.is_double}
                aria-label={`${rarity?.name ?? c.rarity_id}${c.is_double ? ', double' : c.in_album ? ', dans son album' : ''}${c.listing_id ? ', en vente' : ''}`}
                onClick={() => onPick(c)}>
                <Card typeId={c.card_type} base={c.card_base} series={c.card_series} number={c.card_number} rarity={rarity} size="sm" />
                {c.is_double && <small className="friend-tag">Double</small>}
                {c.is_double && c.listing_id && <small className="friend-tag sale">En vente</small>}
              </button>
            </li>
          )
        })}
      </ul>
      {more && <button type="button" className="btn ghost" disabled={loading} onClick={onMore}>Voir plus ({fmt(total - shown.length)})</button>}
    </div>
  )
}

const PAGE = 60

function FriendCollection({ friend, onBack }) {
  const { rarityMap, catalog } = useGame()
  const [doublesOnly, setDoublesOnly] = useState(false)
  const [cards, setCards] = useState(null)
  const [total, setTotal] = useState(0)
  const [doublesTotal, setDoublesTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sel, setSel] = useState(null)

  const load = useCallback(async (doubles, offset) => {
    setLoading(true)
    setError('')
    try {
      const rows = await api.friendCards(friend.user_id, doubles, PAGE, offset)
      setCards((cur) => (offset === 0 ? rows : [...(cur ?? []), ...rows]))
      if (rows[0]) { setTotal(Number(rows[0].total)); setDoublesTotal(Number(rows[0].doubles_total)) } else if (offset === 0) setTotal(0)
    } catch (e) {
      setError(explain(e))
    } finally {
      setLoading(false)
    }
  }, [friend.user_id])

  useEffect(() => { load(doublesOnly, 0) }, [load, doublesOnly])
  // « Doubles (n) » reste exact même quand on affiche toutes les cartes (le premier lot donne doubles_total)
  useEffect(() => { if (cards && cards[0]) setDoublesTotal(Number(cards[0].doubles_total)) }, [cards])

  return (
    <>
      <FriendCollectionView friend={friend} cards={cards} total={total} doublesTotal={doublesTotal} doublesOnly={doublesOnly} loading={loading} error={error} rarityMap={rarityMap}
        onToggle={(d) => { setCards(null); setDoublesOnly(d) }}
        onPick={(c) => setSel({ typeId: c.card_type, base: c.card_base, series: c.card_series, number: c.card_number, rarityId: c.rarity_id, state: 'taken', ownerName: friend.username, friend: true })}
        onMore={() => load(doublesOnly, cards?.length ?? 0)} onBack={onBack} />
      {sel && catalog && <CardModal sel={sel} rarity={rarityMap[sel.rarityId]} onClose={() => setSel(null)} onChanged={() => setSel(null)} onRefresh={() => {}} goMarket={() => {}} />}
    </>
  )
}

export default function Friends() {
  const { setStatus } = useGame()
  const [rows, setRows] = useState(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(null)

  const load = useCallback(async () => {
    try { setRows(await api.friendsList()) } catch (e) { setError(explain(e)) }
  }, [])
  useEffect(() => { load() }, [load])

  async function search() {
    setError('')
    setNotice('')
    try { setResults(await api.friendSearch(query)) } catch (e) { setError(explain(e)) }
  }
  async function act(fn, message) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await fn()
      setNotice(typeof message === 'function' ? message(res) : message)
      await load()
      if (results) setResults(await api.friendSearch(query))
      api.getStatus().then(setStatus).catch(() => {})   // la pastille de l'onglet Amis
    } catch (e) {
      setError(explain(e))
    } finally {
      setBusy(false)
    }
  }

  if (open) return <FriendCollection friend={open} onBack={() => { setOpen(null); load() }} />
  return (
    <FriendsView rows={rows} results={results} query={query} notice={notice} error={error} busy={busy}
      onQuery={setQuery} onSearch={search} onOpen={setOpen}
      onRequest={(id) => act(() => api.friendRequest(id), (r) => (r?.status === 'accepted' ? 'Vous êtes amis !' : 'Demande envoyée.'))}
      onRespond={(id, accept) => act(() => api.friendRespond(id, accept), accept ? 'Vous êtes amis !' : 'Demande refusée.')}
      onRemove={(id, name) => { if (window.confirm(`Retirer ${name} de tes amis (ou annuler la demande) ?`)) act(() => api.friendRemove(id), `${name} a été retiré.`) }} />
  )
}

import { useCallback, useEffect, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { useGame, fmt } from '../game'
import Card from './Card'
import CardModal from './CardModal'
import { inviteLink } from '../invite'

// Page « Amis » : chercher un joueur, gérer les demandes, voir la collection d'un ami et ses doubles, lui proposer une offre sur un double.
// Les vues (FriendsView, FriendCollectionView) sont pures : tout vient des propriétés, c'est ce qui est testé sans navigateur.

const plural = (n, one, many) => `${fmt(n)} ${n > 1 ? many : one}`

// Inviter par lien : on copie son lien et on l'envoie à un ami ; en l'ouvrant il devient ami automatiquement.
// invite = { link, copied, canShare, busy, error } ; le lien est préparé d'avance pour que la copie parte directement du toucher.
export function InviteBlock({ invite, onCopy, onShare, onReset }) {
  const { link, copied, canShare, busy, error } = invite
  return (
    <section className="friends-invite" aria-label="Inviter un ami par lien">
      <h3>Inviter un ami par lien</h3>
      <p className="muted">Envoie ton lien à un ami : quand il l’ouvre (et se connecte ou crée son compte), vous devenez amis automatiquement.</p>
      <button type="button" className="btn accent" disabled={busy} onClick={onCopy}>{copied ? 'Lien copié ✓' : 'Copier mon lien d’invitation'}</button>
      {link && (
        <>
          <input className="invite-link" readOnly value={link} aria-label="Ton lien d’invitation" onFocus={(e) => e.target.select()} />
          <span className="friend-actions">
            {canShare && <button type="button" className="btn small" disabled={busy} onClick={onShare}>Partager</button>}
            <button type="button" className="btn small ghost" disabled={busy} onClick={onReset}>Nouveau lien</button>
          </span>
        </>
      )}
      {error && <p className="msg error" role="alert">{error}</p>}
    </section>
  )
}

export function FriendsView({ rows, results, query, notice, error, busy, invite, onCopyInvite, onShareInvite, onResetInvite, onQuery, onSearch, onRequest, onRespond, onRemove, onOpen }) {
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

      {invite && <InviteBlock invite={invite} onCopy={onCopyInvite} onShare={onShareInvite} onReset={onResetInvite} />}

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
        {rows !== null && friends.length === 0 && <p className="muted">Aucun ami pour l’instant. Cherche un joueur par son pseudo ou envoie-lui ton lien d’invitation.</p>}
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
                aria-label={`${rarity?.name ?? c.rarity_id}${c.is_double ? ', double' : c.in_album ? ', dans son album' : ''}${c.listing_id ? ', en vente' : ''}${c.is_double && c.i_own === true ? ', déjà possédé' : c.is_double && c.i_own === false ? ', il te manque' : ''}`}
                onClick={() => onPick(c)}>
                <Card typeId={c.card_type} base={c.card_base} series={c.card_series} number={c.card_number} rarity={rarity} size="sm" />
                {c.is_double && <small className="friend-tag">Double</small>}
                {c.is_double && c.listing_id && <small className="friend-tag sale">En vente</small>}
                {/* « Déjà possédé » : tu as déjà une carte de cet emplacement. Simple information : l'offre reste possible. */}
                {c.is_double && c.i_own === true && <small className="friend-tag owned">Déjà possédé</small>}
                {c.is_double && c.i_own === false && <small className="friend-tag missing">Manquante</small>}
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
        onPick={(c) => setSel({ typeId: c.card_type, base: c.card_base, series: c.card_series, number: c.card_number, rarityId: c.rarity_id, state: 'taken', ownerName: friend.username, friend: true, iOwn: c.i_own })}
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
  const [code, setCode] = useState(null)        // code d'invitation (préparé d'avance)
  const [copied, setCopied] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const link = code ? inviteLink(window.location.origin, code) : ''

  // Le code est demandé dès l'ouverture de l'écran : au toucher, la copie part tout de suite (le navigateur n'autorise la copie que juste après un toucher)
  useEffect(() => { api.friendInviteCode(false).then(setCode).catch(() => {}) }, [])

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true } catch { return false }
  }
  async function copyInvite() {
    setInviteError('')
    let c = code
    if (!c) {
      setInviteBusy(true)
      try { c = await api.friendInviteCode(false); setCode(c) } catch (e) { setInviteError(explain(e)); setInviteBusy(false); return }
      setInviteBusy(false)
    }
    const ok = await copyText(inviteLink(window.location.origin, c))
    setCopied(ok)
    if (ok) setTimeout(() => setCopied(false), 2500)
    else setInviteError('Copie automatique impossible : touche le lien ci-dessous pour le sélectionner, puis copie-le.')
  }
  async function shareInvite() {
    try { await navigator.share({ title: '1/1 Cards', text: 'Deviens mon ami sur 1/1 Cards :', url: link }) } catch { /* partage annulé */ }
  }
  async function resetInvite() {
    if (!window.confirm('Générer un nouveau lien ? L’ancien lien ne fonctionnera plus.')) return
    setInviteBusy(true)
    setInviteError('')
    try { setCode(await api.friendInviteCode(true)); setCopied(false) } catch (e) { setInviteError(explain(e)) } finally { setInviteBusy(false) }
  }

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
      invite={{ link, copied, canShare: typeof navigator !== 'undefined' && typeof navigator.share === 'function', busy: inviteBusy, error: inviteError }}
      onCopyInvite={copyInvite} onShareInvite={shareInvite} onResetInvite={resetInvite}
      onQuery={setQuery} onSearch={search} onOpen={setOpen}
      onRequest={(id) => act(() => api.friendRequest(id), (r) => (r?.status === 'accepted' ? 'Vous êtes amis !' : 'Demande envoyée.'))}
      onRespond={(id, accept) => act(() => api.friendRespond(id, accept), accept ? 'Vous êtes amis !' : 'Demande refusée.')}
      onRemove={(id, name) => { if (window.confirm(`Retirer ${name} de tes amis (ou annuler la demande) ?`)) act(() => api.friendRemove(id), `${name} a été retiré.`) }} />
  )
}

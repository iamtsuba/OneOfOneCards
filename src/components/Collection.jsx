import { useCallback, useEffect, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { useGame, fmt, fmtPct } from '../game'
import Card from './Card'
import CardModal from './CardModal'
import TypeArt from './TypeArt'
import { albumStats, isBonus, pickerEntries, stackInfo } from '../albumLogic'

const SORTS = [
  ['series', 'Par série'],
  ['rarity', 'Par rareté'],
  ['recent', 'Plus récentes'],
]
const PAGE = 60

export default function Collection({ goMarket }) {
  const { rarities, rarityMap, status, catalog } = useGame()
  const { categories, types } = catalog
  const [catId, setCatId] = useState(status?.active_category_id ?? categories[0]?.id)
  const [view, setView] = useState('album')
  const [albumRows, setAlbumRows] = useState(null)
  const [stack, setStack] = useState(null)   // pile ouverte : { typeId, rarityId }
  const [stats, setStats] = useState(null)
  const [version, setVersion] = useState(0)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')

  const category = catalog.categoryMap[catId]
  // Un type secret reste caché tant qu'on n'en possède aucune carte
  const ownedByType = Object.fromEntries((stats?.types ?? []).map((t) => [t.id, t.owned]))
  const catTypes = types.filter((t) => t.category_id === catId && (!t.secret || ownedByType[t.id] > 0))

  useEffect(() => {
    if (catId == null) return
    api.getStats(catId).then(setStats).catch((e) => setError(explain(e)))
  }, [catId, version])

  // Album : un emplacement par carte (type) et par rareté, chargé ici pour alimenter aussi les statistiques
  useEffect(() => {
    if (catId == null) return
    let cancelled = false
    api.albumView(catId).then((r) => { if (!cancelled) setAlbumRows(r) }).catch((e) => !cancelled && setError(explain(e)))
    return () => { cancelled = true }
  }, [catId, version])

  const changed = () => { setSelected(null); setVersion((v) => v + 1) }
  const refresh = () => setVersion((v) => v + 1)
  const pickCategory = (id) => { setCatId(id); setAlbumRows(null) }

  const stateLabel = (c) =>
    (status?.closed_categories ?? []).includes(c.id) ? 'Terminée' : c.id === status?.active_category_id ? 'En cours' : 'À venir'

  if (!category) {
    return (
      <section className="page">
        <h1 className="page-title">Collection</h1>
        <div className="empty"><p><strong>Aucune catégorie pour le moment.</strong></p></div>
      </section>
    )
  }

  return (
    <section className="page">
      <h1 className="page-title">Collection</h1>

      <div className="cat-tabs" role="tablist" aria-label="Catégories de boosters">
        {categories.filter((c) => c.enabled).map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={c.id === catId}
            className={`cat-tab ${c.id === catId ? 'on' : ''}`}
            style={{ '--cat1': c.color, '--cat2': c.color2 }}
            onClick={() => pickCategory(c.id)}
          >
            <i className="cat-dot" />
            <span>{c.name}</span>
            <small>{stateLabel(c)}</small>
          </button>
        ))}
      </div>

      <AlbumStats rows={albumRows} rarityMap={rarityMap} />

      <div className="segmented" role="tablist" aria-label="Affichage">
        <button role="tab" aria-selected={view === 'album'} className={view === 'album' ? 'on' : ''} onClick={() => setView('album')}>Album</button>
        <button role="tab" aria-selected={view === 'cards'} className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>Mes cartes</button>
      </div>

      {error && <p className="msg error" role="alert">{error}</p>}

      {view === 'album' && (
        <Album rows={albumRows} catalog={catalog} rarityMap={rarityMap} onRefresh={refresh} categoryId={catId} />
      )}
      {view === 'cards' && (
        <MyCards
          catId={catId}
          catTypes={catTypes}
          rarities={rarities}
          rarityMap={rarityMap}
          stats={stats}
          version={version}
          onSelect={setSelected}
          onStack={setStack}
        />
      )}

      {stack && (
        <StackModal
          stack={stack}
          catalog={catalog}
          rarityMap={rarityMap}
          onClose={() => setStack(null)}
          onChanged={() => { setStack(null); refresh() }}
          onListOne={(card) => { setStack(null); setSelected({ typeId: stack.typeId, base: card.base_rarity, series: card.series, number: card.number, rarityId: stack.rarityId, state: 'mine' }) }}
        />
      )}

      {selected && (
        <CardModal sel={selected} rarity={rarityMap[selected.rarityId]} onClose={() => setSelected(null)} onChanged={changed} onRefresh={refresh} goMarket={(v) => { setSelected(null); goMarket(v) }} />
      )}
    </section>
  )
}

// Statistiques de l'album de la catégorie : le full set compte tous les emplacements SAUF la rareté Unique, qui n'en fait pas partie (cartes 1/1)
export function AlbumStats({ rows, rarityMap }) {
  if (!rows) return <div className="collection-head"><p className="fine">Chargement de l’album…</p></div>
  const st = albumStats(rows, rarityMap)
  const { base, bonus } = st
  return (
    <div className="collection-head">
      <p className="collection-count">
        <strong>{fmt(base.filled)}</strong> emplacement{base.filled > 1 ? 's' : ''} rempli{base.filled > 1 ? 's' : ''} sur {fmt(base.total)}
        <span className="muted nowrap"> ({fmtPct(base.pct)})</span>
      </p>
      <div className="progress" aria-hidden="true"><span style={{ width: `${Math.max(base.pct, base.filled ? 1 : 0)}%` }} /></div>
      {base.complete && <p className="album-complete">★ Full set complet !</p>}
      {bonus.total > 0 && (
        <p className="fine">Cartes 1/1, hors full set : <strong>{bonus.filled}/{bonus.total}</strong></p>
      )}
      {st.secrets.total > 0 && (
        <p className="fine">Cartes secrètes découvertes, hors full set : <strong>{st.secrets.found}/{st.secrets.total}</strong></p>
      )}
      <p className="fine">
        {st.fillable > 0
          ? `${fmt(st.fillable)} autre${st.fillable > 1 ? 's' : ''} emplacement${st.fillable > 1 ? 's peuvent' : ' peut'} être rempli${st.fillable > 1 ? 's' : ''} avec tes cartes.`
          : 'Aucun autre emplacement ne peut être rempli avec tes cartes pour le moment.'}
      </p>
      {st.byRarity.length > 0 && (
        <ul className="album-rarity-stats" aria-label="Emplacements remplis par rareté">
          {st.byRarity.map((e) => (
            <li key={e.id} style={{ '--r1': rarityMap[e.id]?.color, '--r2': rarityMap[e.id]?.color2 }}>
              <i className="rarity-dot" aria-hidden="true" />
              {rarityMap[e.id]?.name ?? e.id} <strong>{e.filled}/{e.total}</strong>
              {e.bonus && <span className="muted"> · 1/1</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Album : pour chaque carte (type), un emplacement par rareté ; on y met un de ses exemplaires numérotés de cette rareté
export function Album({ rows, catalog, rarityMap, onRefresh, categoryId = null }) {
  const [picker, setPicker] = useState(null)
  const [showCollection, setShowCollection] = useState(false)
  if (rows === null) return null
  if (rows.length === 0) {
    return <div className="empty"><p><strong>Aucune carte dans cette catégorie pour l’instant.</strong></p></div>
  }
  const groups = []
  for (const r of rows) {
    let g = groups[groups.length - 1]
    if (!g || g.typeId !== r.type_id) { g = { typeId: r.type_id, name: r.type_name, mystery: r.revealed === false, slots: [] }; groups.push(g) }
    if (!g.mystery) g.slots.push(r)
  }
  return (
    <>
      <div className="album-intro">
        <p className="fine">
          Un emplacement par rareté de chaque carte : clique-en un pour choisir, parmi tes exemplaires de cette rareté, celui qui y figure.
          Une carte placée dans l’album ne peut plus être vendue. Les cartes 1/1 (rareté Unique) ne comptent pas dans le full set.
        </p>
        {categoryId != null && (
          <button type="button" className="btn ghost album-collection-btn" onClick={() => setShowCollection(true)}>Voir la collection</button>
        )}
      </div>
      {showCollection && categoryId != null && <CollectionHoldersModal categoryId={categoryId} catalog={catalog} onClose={() => setShowCollection(false)} />}
      <div className="album-types">
        {groups.map((g) => {
          const setNo = catalog.checklist(g.typeId)
          if (g.mystery) {
            // Carte secrète pas encore découverte : visible dans l'album avec son numéro (ex. 4/3), mais sans nom ni visuel
            return (
              <section className="album-type album-mystery" key={g.typeId}>
                <header className="album-type-head">
                  <h3>Carte secrète</h3>
                  {setNo && <span className="muted">n° {setNo.no}/{setNo.total} · secrète</span>}
                </header>
                <div className="album-mystery-tile" role="img" aria-label="Carte secrète pas encore découverte">
                  <span aria-hidden="true">?</span>
                  <small>À découvrir dans un booster</small>
                </div>
              </section>
            )
          }
          const base = g.slots.filter((x) => !isBonus(rarityMap[x.rarity_id]))
          const bonus = g.slots.filter((x) => isBonus(rarityMap[x.rarity_id]))
          const done = base.filter((x) => x.pick_series != null).length
          const bonusDone = bonus.filter((x) => x.pick_series != null).length
          return (
            <section className="album-type" key={g.typeId}>
              <header className="album-type-head">
                <h3>{g.name}</h3>
                {setNo && <span className="muted">n° {setNo.no}/{setNo.total}{setNo.secret ? ' · secrète' : ''}</span>}
                <span className="fine album-type-count">
                  {done}/{base.length}{bonus.length > 0 ? ` · 1/1 : ${bonusDone}/${bonus.length}` : ''}
                </span>
              </header>
              <ul className="album-slots">
                {g.slots.map((slot) => {
                  const rarity = rarityMap[slot.rarity_id]
                  const picked = slot.pick_series != null
                  const owned = Number(slot.owned_count)
                  const bonusSlot = isBonus(rarity)
                  return (
                    <li key={slot.rarity_id}>
                      <button
                        className={`album-slot ${picked ? 'filled' : owned > 0 ? 'fillable' : 'missing'} ${bonusSlot ? 'bonus' : ''}`}
                        style={{ '--r1': rarity?.color, '--r2': rarity?.color2 }}
                        disabled={!picked && owned === 0}
                        aria-label={`${g.name}, ${rarity?.name}${bonusSlot ? ' (1/1, hors full set)' : ''} : ${picked ? 'rempli, changer' : owned > 0 ? 'à remplir' : 'aucune carte'}`}
                        onClick={() => setPicker({ typeId: g.typeId, typeName: g.name, rarityId: slot.rarity_id, hasPick: picked })}
                      >
                        <span className="album-card-slot">
                          {picked ? (
                            <Card typeId={g.typeId} base={slot.pick_base} series={slot.pick_series} number={slot.pick_number} rarity={rarity} size="sm" />
                          ) : (
                            <span className="album-empty"><TypeArt type={catalog.typeMap[g.typeId]} /></span>
                          )}
                        </span>
                        <span className="album-slot-label">{rarity?.name}{bonusSlot && <small className="album-bonus-tag">1/1</small>}</span>
                        {!picked && <span className="album-slot-hint">{owned > 0 ? `À remplir (${owned})` : 'Manquante'}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>

      {picker && (
        <AlbumPicker
          typeId={picker.typeId}
          typeName={picker.typeName}
          rarityId={picker.rarityId}
          rarityName={rarityMap[picker.rarityId]?.name ?? ''}
          rarityMap={rarityMap}
          hasPick={picker.hasPick}
          onClose={() => setPicker(null)}
          onChanged={() => { setPicker(null); onRefresh() }}
        />
      )}
    </>
  )
}

// Choix de la carte d'un emplacement : une seule proposition pour toutes les cartes à numéro masqué (elles sont
// indiscernables), une par carte à numéro visible. Une fois placée dans l'album, une carte ne peut plus être vendue.
// « Voir la collection » : toutes les cartes de la catégorie avec leur numéro et, dessous, 👤 + le nombre de détenteurs (joueurs qui en
// possèdent au moins un exemplaire, toi compris : 20 exemplaires chez toi et 3 chez un ami = 2 détenteurs). Une carte est visible dès
// qu'elle a au moins un détenteur ; celles que personne ne possède restent cachées derrière un « ? » (leur numéro reste visible).
export function CollectionHoldersView({ categoryName, types, checklist, holders, loading = false, error = '', onClose }) {
  const counts = new Map((holders ?? []).map((h) => [h.type_id, Number(h.holders)]))
  const items = types
    .map((t) => ({ t, n: counts.get(t.id) ?? 0, list: checklist(t.id) }))
    .sort((a, b) => (a.list?.no ?? 1e9) - (b.list?.no ?? 1e9) || a.t.id - b.t.id)
  const revealed = items.filter((x) => x.n > 0).length
  const s = (n) => (n > 1 ? 's' : '')
  return (
    <div className="legal-overlay" role="dialog" aria-modal="true" aria-label={`Collection ${categoryName}`} onClick={onClose}>
      <div className="legal-panel holders-panel" onClick={(e) => e.stopPropagation()}>
        <div className="holders-head">
          <h2>Collection « {categoryName} »</h2>
          <button type="button" className="btn ghost" onClick={onClose}>Fermer</button>
        </div>
        <p className="fine">
          Toutes les cartes de la collection, avec leur numéro. Sous chacune, 👤 indique le nombre de joueurs qui en possèdent au moins un exemplaire
          (toi compris). Une carte est visible <strong>dès qu’un joueur la possède</strong> ; celles que personne n’a encore tirées restent cachées (?).
        </p>
        {error && <p className="msg error" role="alert">{error}</p>}
        {loading ? (
          <p className="muted">Chargement…</p>
        ) : (
          <>
            <p className="holders-sum"><strong>{revealed}</strong> carte{s(revealed)} dévoilée{s(revealed)} sur {items.length}</p>
            <ul className="holder-grid">
              {items.map(({ t, n, list }) => {
                const open = n > 0
                return (
                  <li key={t.id} className={`holder-tile${open ? '' : ' hidden'}`}>
                    <div className="holder-art" role="img" aria-label={open ? t.name : 'Carte cachée'}>
                      {open ? <TypeArt type={t} /> : <span aria-hidden="true">?</span>}
                    </div>
                    <span className="holder-no">{list ? `n° ${list.no}/${list.total}${list.secret ? ' · secrète' : ''}` : ''}</span>
                    <strong className="holder-name">{open ? t.name : '???'}</strong>
                    <span className="holder-count" aria-label={`${fmt(n)} détenteur${s(n)}`}><span aria-hidden="true">👤 {fmt(n)}</span></span>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

function CollectionHoldersModal({ categoryId, catalog, onClose }) {
  const [holders, setHolders] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    api.collectionHolders(categoryId).then((r) => !cancelled && setHolders(r)).catch((e) => !cancelled && setError(explain(e)))
    return () => { cancelled = true }
  }, [categoryId])
  return (
    <CollectionHoldersView
      categoryName={catalog.categoryMap[categoryId]?.name ?? ''}
      types={catalog.types.filter((t) => t.category_id === categoryId)}
      checklist={catalog.checklist}
      holders={holders}
      loading={holders === null && !error}
      error={error}
      onClose={onClose}
    />
  )
}

export function AlbumPicker({ typeId, typeName, rarityId, rarityName, rarityMap, hasPick, onClose, onChanged, initialCards }) {
  const [cards, setCards] = useState(initialCards ?? [])   // initialCards : cartes déjà connues (tests de rendu)
  const [loading, setLoading] = useState(!initialCards)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (initialCards) return undefined
    let cancelled = false
    api.myTypeCards(typeId, rarityId).then((r) => !cancelled && setCards(r)).catch((e) => !cancelled && setError(explain(e))).finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [typeId, rarityId, initialCards])

  const { entries, listedCount } = pickerEntries(cards)

  async function choose(entry) {
    if (entry.picked) { onClose(); return }   // déjà dans l'album : rien à changer
    setBusy(true)
    setError('')
    try {
      await api.setAlbumPick(typeId, entry.card.base_rarity, entry.card.series, entry.card.number)
      onChanged()
    } catch (e) {
      setError(explain(e))
      setBusy(false)
    }
  }

  async function clear() {
    setBusy(true)
    setError('')
    try {
      await api.clearAlbumPick(typeId, rarityId)
      onChanged()
    } catch (e) {
      setError(explain(e))
      setBusy(false)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={`Choisir la carte ${typeName}, ${rarityName}, de l’album`} onClick={onClose}>
      <div className="detail" onClick={(e) => e.stopPropagation()}>
        <h2>{typeName}</h2>
        <p className="reveal-line"><strong>{rarityName}</strong></p>
        {error && <p className="msg error" role="alert">{error}</p>}
        {!loading && entries.length === 0 ? (
          <p className="muted">{listedCount > 0 ? 'Tes exemplaires de cette rareté sont tous en vente : retire-en un de la vente pour le placer.' : 'Tu n’as aucun exemplaire de cette carte dans cette rareté.'}</p>
        ) : (
          <ul className="grid picker-grid">
            {entries.map((e) => (
              <li key={e.key} className={e.picked ? 'picked' : ''}>
                <Card typeId={typeId} base={e.card.base_rarity} series={e.card.series} number={e.card.number} rarity={rarityMap[rarityId]} size="sm"
                  count={e.kind === 'stack' ? e.count : 0} onClick={() => !busy && choose(e)} />
                {e.picked && <span className="picker-mark">Dans l’album</span>}
              </li>
            ))}
          </ul>
        )}
        {entries.some((e) => e.kind === 'stack') && (
          <p className="fine picker-note">Les cartes sans numéro visible sont identiques : elles sont regroupées en une seule proposition.</p>
        )}
        {listedCount > 0 && entries.length > 0 && (
          <p className="fine picker-note">{listedCount} carte{listedCount > 1 ? 's' : ''} en vente non proposée{listedCount > 1 ? 's' : ''}.</p>
        )}
        <div className="row">
          {hasPick && <button className="btn ghost-light" disabled={busy} onClick={clear}>Vider cet emplacement</button>}
          <button className="btn ghost-light" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}

// Pile de cartes sans numéro visible (même type, même rareté) : vente rapide d'une ou plusieurs, ou mise en vente d'une seule
export function StackModal({ stack, catalog, rarityMap, onClose, onChanged, onListOne, initialCards }) {
  const { status, setStatus } = useGame()
  const [cards, setCards] = useState(initialCards ?? null)   // initialCards : cartes déjà connues (tests de rendu)
  const [qty, setQty] = useState(1)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const rarity = rarityMap[stack.rarityId]
  const type = catalog.typeMap[stack.typeId]
  const category = type ? catalog.categoryMap[type.category_id] : null
  const closed = !!category && (status?.closed_categories ?? []).includes(category.id)
  const price = status?.direct_sell_price ?? 1

  useEffect(() => {
    if (initialCards) return undefined
    let cancelled = false
    api.myTypeCards(stack.typeId, stack.rarityId).then((r) => !cancelled && setCards(r)).catch((e) => !cancelled && setError(explain(e)))
    return () => { cancelled = true }
  }, [stack.typeId, stack.rarityId, initialCards])

  const info = stackInfo(cards)
  const n = Math.min(Math.max(Number(qty) || 1, 1), Math.max(info.free, 1))

  async function sell() {
    setBusy(true)
    setError('')
    try {
      const res = await api.sellDirectMany(stack.typeId, stack.rarityId, n)
      if (res?.status) setStatus(res.status)
      onChanged()
    } catch (e) {
      setError(explain(e))
      setBusy(false)
      setConfirm(false)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={`Pile de cartes ${type?.name}, ${rarity?.name}`} onClick={onClose}>
      <div className="detail" onClick={(e) => e.stopPropagation()}>
        <div className="detail-card">
          <Card typeId={stack.typeId} base={stack.base} series={stack.series} number={stack.number} rarity={rarity} size="lg" count={info.total} glow shine />
        </div>
        <p className="reveal-line">
          <strong>{rarity?.name}</strong> : {type?.name}
          {cards ? ` — ${info.total} carte${info.total > 1 ? 's' : ''} identique${info.total > 1 ? 's' : ''}` : ''}
        </p>
        {cards && (
          <p className="fine stack-breakdown">
            {info.free} vendable{info.free > 1 ? 's' : ''}
            {info.listed > 0 ? ` · ${info.listed} en vente` : ''}
            {info.inAlbum > 0 ? ' · 1 dans l’album' : ''}
          </p>
        )}

        {cards && (
          <div className="sheet">
            <section>
              <h3>Vente rapide</h3>
              {closed ? (
                <p className="muted">Indisponible : la catégorie « {category.name} » est terminée. Tu peux vendre tes cartes sur le marché, une par une.</p>
              ) : info.free === 0 ? (
                <p className="muted">Aucune carte vendable dans cette pile (elles sont en vente ou dans l’album).</p>
              ) : (
                <>
                  <p className="muted">Tu reçois {price} pièce{price > 1 ? 's' : ''} par carte. Les cartes sont définitivement retirées du jeu : elles ne reviendront plus dans les boosters.</p>
                  <div className="stack-qty">
                    <button type="button" className="btn ghost icon" onClick={() => setQty(Math.max(n - 1, 1))} disabled={busy || n <= 1} aria-label="Une carte de moins">−</button>
                    <input type="number" inputMode="numeric" min="1" max={info.free} value={n} aria-label="Nombre de cartes à vendre"
                      onChange={(e) => setQty(e.target.value)} />
                    <button type="button" className="btn ghost icon" onClick={() => setQty(Math.min(n + 1, info.free))} disabled={busy || n >= info.free} aria-label="Une carte de plus">+</button>
                    <button type="button" className="btn ghost sm" onClick={() => setQty(info.free)} disabled={busy || n >= info.free}>Tout ({info.free})</button>
                  </div>
                  {confirm ? (
                    <div className="row">
                      <button className="btn accent" onClick={sell} disabled={busy}>Oui, vendre {n} carte{n > 1 ? 's' : ''}</button>
                      <button className="btn ghost" onClick={() => setConfirm(false)} disabled={busy}>Annuler</button>
                    </div>
                  ) : (
                    <button className="btn ghost" onClick={() => setConfirm(true)} disabled={busy}>Vendre {n} carte{n > 1 ? 's' : ''} pour {price * n} pièce{price * n > 1 ? 's' : ''}</button>
                  )}
                </>
              )}
            </section>
            <section>
              <h3>Mettre sur le marché</h3>
              <p className="muted">Une carte à la fois, à ton prix ou aux enchères.</p>
              <button className="btn" disabled={busy || !info.firstFree} onClick={() => onListOne(info.firstFree)}>Mettre une carte en vente</button>
            </section>
          </div>
        )}

        {error && <p className="msg error" role="alert">{error}</p>}
        <button className="btn ghost-light" onClick={onClose}>Fermer</button>
      </div>
    </div>
  )
}

function MyCards({ catId, catTypes, rarities, rarityMap, stats, version, onSelect, onStack }) {
  const [rarity, setRarity] = useState(null)
  const [type, setType] = useState('')
  const [sort, setSort] = useState('series')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [cardsTotal, setCardsTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { setType('') }, [catId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .listCollection({ category: catId, type: type ? Number(type) : null, rarity, sort, limit: PAGE, offset: 0 })
      .then((rows) => {
        if (cancelled) return
        setItems(rows)
        setTotal(rows[0] ? Number(rows[0].total) : 0)
        setCardsTotal(rows[0] ? Number(rows[0].cards_total) : 0)
      })
      .catch((e) => !cancelled && setError(explain(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [catId, type, rarity, sort, version])

  const more = useCallback(async () => {
    try {
      const rows = await api.listCollection({ category: catId, type: type ? Number(type) : null, rarity, sort, limit: PAGE, offset: items.length })
      setItems((cur) => [...cur, ...rows])
    } catch (e) {
      setError(explain(e))
    }
  }, [catId, type, rarity, sort, items.length])

  const byId = Object.fromEntries((stats?.by_rarity || []).map((r) => [r.id, r]))

  return (
    <>
      <div className="chips" role="group" aria-label="Filtrer par rareté">
        <button className={`chip ${rarity === null ? 'on' : ''}`} onClick={() => setRarity(null)}>Toutes</button>
        {rarities.map((r) => (
          <button
            key={r.id}
            className={`chip ${rarity === r.id ? 'on' : ''}`}
            style={{ '--dot': r.color, '--dot2': r.color2 }}
            onClick={() => setRarity(rarity === r.id ? null : r.id)}
            aria-pressed={rarity === r.id}
          >
            <i className="dot" />
            {r.name}
            <span className="chip-count">{fmt(byId[r.id]?.owned ?? 0)}/{fmt(byId[r.id]?.total ?? 0)}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <span className="muted">{loading ? 'Chargement…' : `${fmt(cardsTotal)} carte${cardsTotal > 1 ? 's' : ''}`}</span>
        <div className="toolbar-selects">
          <label className="select">
            <span className="sr">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Tous les types</option>
              {catTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="select">
            <span className="sr">Trier</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
      </div>

      {error && <p className="msg error" role="alert">{error}</p>}

      {!loading && items.length === 0 ? (
        <div className="empty">
          <p><strong>Aucune carte ici pour l’instant.</strong></p>
          <p>{rarity || type ? 'Change de filtre ou ouvre de nouveaux boosters.' : 'Ouvre un booster pour commencer cette collection.'}</p>
        </div>
      ) : (
        <ul className="grid">
          {items.map((c) => (
            <li key={c.is_stack ? `stack-${c.card_type}-${c.rarity_id}` : `${c.card_type}-${c.card_series}-${c.card_number}`}>
              <Card
                typeId={c.card_type}
                base={c.card_base}
                series={c.card_series}
                number={c.card_number}
                rarity={rarityMap[c.rarity_id]}
                listed={!c.is_stack && !!c.listing_id}
                inAlbum={!c.is_stack && !!c.in_album}
                count={c.is_stack ? c.stack_qty : 0}
                size="sm"
                onClick={() => (c.is_stack
                  ? onStack({ typeId: c.card_type, base: c.card_base, rarityId: c.rarity_id, series: c.card_series, number: c.card_number })
                  : onSelect({ typeId: c.card_type, base: c.card_base, series: c.card_series, number: c.card_number, rarityId: c.rarity_id, state: 'mine', listingId: c.listing_id, inAlbum: !!c.in_album }))}
              />
            </li>
          ))}
        </ul>
      )}

      {items.length < total && (
        <div className="more"><button className="btn ghost" onClick={more}>Afficher plus</button></div>
      )}
    </>
  )
}

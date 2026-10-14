import { useCallback, useEffect, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { useGame, fmt, fmtPct } from '../game'
import Card from './Card'
import CardModal from './CardModal'
import TypeArt from './TypeArt'

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
        <Album rows={albumRows} catalog={catalog} rarityMap={rarityMap} onRefresh={refresh} />
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
        />
      )}

      {selected && (
        <CardModal sel={selected} rarity={rarityMap[selected.rarityId]} onClose={() => setSelected(null)} onChanged={changed} onRefresh={refresh} goMarket={(v) => { setSelected(null); goMarket(v) }} />
      )}
    </section>
  )
}

// Statistiques de l'album de la catégorie : emplacements remplis sur le total, et par rareté
export function AlbumStats({ rows, rarityMap }) {
  if (!rows) return <div className="collection-head"><p className="fine">Chargement de l’album…</p></div>
  const total = rows.length
  const filled = rows.filter((r) => r.pick_series != null).length
  const fillable = rows.filter((r) => r.pick_series == null && Number(r.owned_count) > 0).length
  const pct = total ? (filled / total) * 100 : 0
  const byRarity = new Map()
  for (const r of rows) {
    const e = byRarity.get(r.rarity_id) ?? { id: r.rarity_id, total: 0, filled: 0 }
    e.total += 1
    if (r.pick_series != null) e.filled += 1
    byRarity.set(r.rarity_id, e)
  }
  const rarityStats = [...byRarity.values()].sort((a, b) => (rarityMap[b.id]?.sort_order ?? 0) - (rarityMap[a.id]?.sort_order ?? 0))
  return (
    <div className="collection-head">
      <p className="collection-count">
        <strong>{fmt(filled)}</strong> emplacement{filled > 1 ? 's' : ''} rempli{filled > 1 ? 's' : ''} sur {fmt(total)}
        <span className="muted"> ({fmtPct(pct)})</span>
      </p>
      <div className="progress" aria-hidden="true"><span style={{ width: `${Math.max(pct, filled ? 1 : 0)}%` }} /></div>
      <p className="fine">
        {fillable > 0
          ? `${fmt(fillable)} autre${fillable > 1 ? 's' : ''} emplacement${fillable > 1 ? 's peuvent' : ' peut'} être rempli${fillable > 1 ? 's' : ''} avec tes cartes.`
          : 'Aucun autre emplacement ne peut être rempli avec tes cartes pour le moment.'}
      </p>
      {rarityStats.length > 0 && (
        <ul className="album-rarity-stats" aria-label="Emplacements remplis par rareté">
          {rarityStats.map((e) => (
            <li key={e.id} style={{ '--r1': rarityMap[e.id]?.color, '--r2': rarityMap[e.id]?.color2 }}>
              <i className="rarity-dot" aria-hidden="true" />
              {rarityMap[e.id]?.name ?? e.id} <strong>{e.filled}/{e.total}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Album : pour chaque carte (type), un emplacement par rareté ; on y met un de ses exemplaires numérotés de cette rareté
export function Album({ rows, catalog, rarityMap, onRefresh }) {
  const [picker, setPicker] = useState(null)
  if (rows === null) return null
  if (rows.length === 0) {
    return <div className="empty"><p><strong>Aucune carte dans cette catégorie pour l’instant.</strong></p></div>
  }
  const groups = []
  for (const r of rows) {
    let g = groups[groups.length - 1]
    if (!g || g.typeId !== r.type_id) { g = { typeId: r.type_id, name: r.type_name, slots: [] }; groups.push(g) }
    g.slots.push(r)
  }
  return (
    <>
      <p className="fine">
        Un emplacement par rareté de chaque carte : clique-en un pour choisir, parmi tes exemplaires numérotés de cette rareté, celui qui y figure.
      </p>
      <div className="album-types">
        {groups.map((g) => {
          const setNo = catalog.checklist(g.typeId)
          const done = g.slots.filter((x) => x.pick_series != null).length
          return (
            <section className="album-type" key={g.typeId}>
              <header className="album-type-head">
                <h3>{g.name}</h3>
                {setNo && <span className="muted">n° {setNo.no}/{setNo.total}{setNo.secret ? ' · secrète' : ''}</span>}
                <span className="fine album-type-count">{done}/{g.slots.length}</span>
              </header>
              <ul className="album-slots">
                {g.slots.map((slot) => {
                  const rarity = rarityMap[slot.rarity_id]
                  const picked = slot.pick_series != null
                  const owned = Number(slot.owned_count)
                  return (
                    <li key={slot.rarity_id}>
                      <button
                        className={`album-slot ${picked ? 'filled' : owned > 0 ? 'fillable' : 'missing'}`}
                        style={{ '--r1': rarity?.color, '--r2': rarity?.color2 }}
                        disabled={!picked && owned === 0}
                        aria-label={`${g.name}, ${rarity?.name} : ${picked ? 'rempli, changer' : owned > 0 ? 'à remplir' : 'aucune carte'}`}
                        onClick={() => setPicker({ typeId: g.typeId, typeName: g.name, rarityId: slot.rarity_id, hasPick: picked })}
                      >
                        <span className="album-card-slot">
                          {picked ? (
                            <Card typeId={g.typeId} series={slot.pick_series} number={slot.pick_number} rarity={rarity} size="sm" />
                          ) : (
                            <span className="album-empty"><TypeArt type={catalog.typeMap[g.typeId]} /></span>
                          )}
                        </span>
                        <span className="album-slot-label">{rarity?.name}</span>
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

function AlbumPicker({ typeId, typeName, rarityId, rarityName, rarityMap, hasPick, onClose, onChanged }) {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api.myTypeCards(typeId, rarityId).then((r) => !cancelled && setCards(r)).catch((e) => !cancelled && setError(explain(e))).finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [typeId, rarityId])

  async function pick(series, number) {
    setBusy(true)
    setError('')
    try {
      await api.setAlbumPick(typeId, series, number)
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
        {!loading && cards.length === 0 ? (
          <p className="muted">Tu n’as aucun exemplaire de cette carte dans cette rareté.</p>
        ) : (
          <ul className="grid">
            {cards.map((c) => (
              <li key={`${c.series}-${c.number}`}>
                <Card typeId={typeId} series={c.series} number={c.number} rarity={rarityMap[c.rarity_id]} size="sm"
                  onClick={() => !busy && pick(c.series, c.number)} />
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          {hasPick && <button className="btn ghost-light" disabled={busy} onClick={clear}>Vider cet emplacement</button>}
          <button className="btn ghost-light" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}

function MyCards({ catId, catTypes, rarities, rarityMap, stats, version, onSelect }) {
  const [rarity, setRarity] = useState(null)
  const [type, setType] = useState('')
  const [sort, setSort] = useState('series')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
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
        <span className="muted">{loading ? 'Chargement…' : `${fmt(total)} carte${total > 1 ? 's' : ''}`}</span>
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
            <li key={`${c.card_type}-${c.card_series}-${c.card_number}`}>
              <Card
                typeId={c.card_type}
                series={c.card_series}
                number={c.card_number}
                rarity={rarityMap[c.rarity_id]}
                listed={!!c.listing_id}
                size="sm"
                onClick={() => onSelect({ typeId: c.card_type, series: c.card_series, number: c.card_number, rarityId: c.rarity_id, state: 'mine', listingId: c.listing_id })}
              />
            </li>
          ))}
        </ul>
      )}

      {items.length < total && (
        <div className="more"><button className="btn ghost" onClick={more}>Afficher plus ({fmt(total - items.length)} restantes)</button></div>
      )}
    </>
  )
}

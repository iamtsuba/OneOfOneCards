import { useCallback, useEffect, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { useGame, fmt, fmtPct } from '../game'
import { slotRarityId } from '../rarity'
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
  const [typeId, setTypeId] = useState(null)
  const [view, setView] = useState('albums')
  const [stats, setStats] = useState(null)
  const [version, setVersion] = useState(0)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')

  const category = catalog.categoryMap[catId]
  const catTypes = types.filter((t) => t.category_id === catId)

  useEffect(() => {
    if (catId == null) return
    api.getStats(catId).then(setStats).catch((e) => setError(explain(e)))
  }, [catId, version])

  const changed = () => { setSelected(null); setVersion((v) => v + 1) }
  const refresh = () => setVersion((v) => v + 1)
  const pickCategory = (id) => { setCatId(id); setTypeId(null) }

  const catStats = stats?.categories?.find((c) => c.id === catId)
  const pct = catStats && catStats.total ? (catStats.owned / catStats.total) * 100 : 0
  const closed = (status?.closed_categories ?? []).includes(catId)
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

      <div className="collection-head">
        <p className="collection-count">
          <strong>{fmt(catStats?.owned ?? 0)}</strong> carte{(catStats?.owned ?? 0) > 1 ? 's' : ''} à toi sur {fmt(catStats?.total ?? 0)}
          <span className="muted"> ({fmtPct(pct)})</span>
        </p>
        <div className="progress" aria-hidden="true"><span style={{ width: `${Math.max(pct, catStats?.owned ? 1 : 0)}%` }} /></div>
        <p className="fine">
          {fmt(catStats?.taken ?? 0)} cartes de cette catégorie déjà tirées par l’ensemble des joueurs.
          {closed ? ' Catégorie terminée.' : ''}
        </p>
      </div>

      <div className="segmented" role="tablist" aria-label="Affichage">
        <button role="tab" aria-selected={view === 'albums'} className={view === 'albums' ? 'on' : ''} onClick={() => setView('albums')}>Albums</button>
        <button role="tab" aria-selected={view === 'cards'} className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>Mes cartes</button>
        <button role="tab" aria-selected={view === 'showcase'} className={view === 'showcase' ? 'on' : ''} onClick={() => setView('showcase')}>Vitrine</button>
      </div>

      {error && <p className="msg error" role="alert">{error}</p>}

      {view === 'albums' && (
        typeId == null ? (
          <TypeTiles types={catTypes} stats={stats} onPick={setTypeId} />
        ) : (
          <Album
            key={typeId}
            type={catalog.typeMap[typeId]}
            seriesCount={category.series_count}
            rarities={rarities}
            rarityMap={rarityMap}
            version={version}
            onBack={() => setTypeId(null)}
            onSelect={setSelected}
          />
        )
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
      {view === 'showcase' && (
        <Showcase key={catId} catId={catId} catalog={catalog} rarityMap={rarityMap} version={version} onRefresh={refresh} onError={setError} />
      )}

      {selected && (
        <CardModal sel={selected} rarity={rarityMap[selected.rarityId]} onClose={() => setSelected(null)} onChanged={changed} onRefresh={refresh} goMarket={(v) => { setSelected(null); goMarket(v) }} />
      )}
    </section>
  )
}

function TypeTiles({ types, stats, onPick }) {
  const byId = Object.fromEntries((stats?.types || []).map((t) => [t.id, t]))
  return (
    <ul className="type-tiles">
      {types.map((t) => {
        const s = byId[t.id]
        const pct = s && s.total ? (s.owned / s.total) * 100 : 0
        return (
          <li key={t.id}>
            <button className="type-tile" onClick={() => onPick(t.id)}>
              <span className="type-tile-art"><TypeArt type={t} /></span>
              <span className="type-tile-name">{t.name}</span>
              <span className="type-tile-count">{fmt(s?.owned ?? 0)} / {fmt(s?.total ?? 0)}</span>
              <span className="progress small" aria-hidden="true"><span style={{ width: `${Math.max(pct, s?.owned ? 2 : 0)}%` }} /></span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// Vitrine : une case par type de la catégorie, avec la carte numérotée choisie par le joueur pour la représenter
function Showcase({ catId, catalog, rarityMap, version, onRefresh, onError }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [picker, setPicker] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.albumView(catId)
      .then((r) => { if (!cancelled) setRows(r) })
      .catch((e) => !cancelled && onError(explain(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [catId, version, onError])

  if (!loading && rows.length === 0) {
    return <div className="empty"><p><strong>Aucun type dans cette catégorie pour l’instant.</strong></p></div>
  }

  return (
    <>
      <p className="fine">Choisis la carte numérotée qui représente chaque type dans ta vitrine : clique une case pour la remplir ou en changer.</p>
      <ul className="showcase-grid">
        {rows.map((r) => (
          <li key={r.type_id}>
            <button className="showcase-slot" onClick={() => setPicker({ typeId: r.type_id, typeName: r.type_name })}>
              {r.pick_series != null ? (
                <Card typeId={r.type_id} series={r.pick_series} number={r.pick_number} rarity={rarityMap[r.rarity_id]} size="sm" />
              ) : (
                <span className="showcase-empty"><TypeArt type={catalog.typeMap[r.type_id]} /></span>
              )}
              <span className="showcase-name">{r.type_name}</span>
              {Number(r.owned_count) === 0 && <span className="showcase-hint">Aucune carte</span>}
            </button>
          </li>
        ))}
      </ul>

      {picker && (
        <AlbumPicker
          typeId={picker.typeId}
          typeName={picker.typeName}
          rarityMap={rarityMap}
          hasPick={!!rows.find((r) => r.type_id === picker.typeId)?.pick_series}
          onClose={() => setPicker(null)}
          onChanged={() => { setPicker(null); onRefresh() }}
        />
      )}
    </>
  )
}

function AlbumPicker({ typeId, typeName, rarityMap, hasPick, onClose, onChanged }) {
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api.myTypeCards(typeId).then((r) => !cancelled && setCards(r)).catch((e) => !cancelled && setError(explain(e))).finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [typeId])

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
      await api.clearAlbumPick(typeId)
      onChanged()
    } catch (e) {
      setError(explain(e))
      setBusy(false)
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={`Choisir la carte ${typeName} de la vitrine`} onClick={onClose}>
      <div className="detail" onClick={(e) => e.stopPropagation()}>
        <h2>{typeName}</h2>
        {error && <p className="msg error" role="alert">{error}</p>}
        {!loading && cards.length === 0 ? (
          <p className="muted">Tu n’as encore aucun exemplaire de ce type.</p>
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
          {hasPick && <button className="btn ghost" disabled={busy} onClick={clear}>Vider cette case</button>}
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

function Album({ type, seriesCount, rarities, rarityMap, version, onBack, onSelect }) {
  const [series, setSeries] = useState(null)
  const [input, setInput] = useState('')
  const [state, setState] = useState({ mine: {}, taken: [], reward: 'none', reward_eligible: false })
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .listCollection({ type: type.id, sort: 'recent', limit: 1, offset: 0 })
      .then((rows) => {
        const s = Math.min(rows[0]?.card_series ?? 10, seriesCount)
        setSeries(s)
        setInput(String(s))
      })
      .catch(() => { setSeries(Math.min(10, seriesCount)); setInput(String(Math.min(10, seriesCount))) })
  }, [type.id, seriesCount])

  useEffect(() => {
    if (series == null) return
    let cancelled = false
    api.typeState(type.id, series).then((s) => !cancelled && setState(s)).catch((e) => setError(explain(e)))
    return () => { cancelled = true }
  }, [type.id, series, version])

  const go = (n) => {
    const v = Math.min(seriesCount, Math.max(1, Math.round(Number(n) || 1)))
    setSeries(v)
    setInput(String(v))
  }

  if (series == null) return <p className="muted">Chargement…</p>

  const taken = new Set(state.taken)
  const owners = state.owners || {}
  const favs = new Set(state.favorites || [])
  const have = Object.keys(state.mine).length
  const free = series - have - taken.size

  return (
    <div>
      <button className="link back" onClick={onBack}>← Tous les types</button>
      <h2 className="album-title"><span className="album-art"><TypeArt type={type} /></span>{type.name}</h2>

      <form className="album-nav" onSubmit={(e) => { e.preventDefault(); go(input) }}>
        <button type="button" className="btn ghost icon" onClick={() => go(series - 1)} disabled={series <= 1} aria-label="Série précédente">‹</button>
        <label className="album-input">
          <span className="sr">Numéro de série</span>
          <span className="muted">Série de</span>
          <input type="number" inputMode="numeric" min="1" max={seriesCount} value={input} onChange={(e) => setInput(e.target.value)} onBlur={() => go(input)} />
        </label>
        <button type="button" className="btn ghost icon" onClick={() => go(series + 1)} disabled={series >= seriesCount} aria-label="Série suivante">›</button>
      </form>

      <p className="collection-count"><strong>{fmt(have)}</strong> sur {fmt(series)} cartes à toi{have === series ? ' : série complète !' : ''}</p>
      <ul className="legend" aria-label="Légende">
        <li><i className="sw mine" />À toi ({fmt(have)})</li>
        <li><i className="sw taken" />Tirée par un autre joueur ({fmt(taken.size)})</li>
        <li><i className="sw free" />Encore dans les boosters ({fmt(free)})</li>
      </ul>

      {state.reward === 'mine' && <p className="msg info" role="status">Série complète : tu as gagné un pack doré !</p>}
      {state.reward === 'other' && <p className="msg warn">Cette série a déjà été complétée par un autre joueur : le pack doré est attribué.</p>}
      {state.reward === 'none' && state.reward_eligible && (
        <p className="msg warn">Complète cette série (les {fmt(series)} cartes) pour gagner un pack doré. Seul le premier joueur qui y parvient le reçoit.</p>
      )}

      {error && <p className="msg error" role="alert">{error}</p>}

      <ul className="grid album-grid">
        {Array.from({ length: series }, (_, i) => i + 1).map((n) => {
          const rid = slotRarityId(n, series, state.range_rarity, rarities)
          const rarity = rarityMap[rid]
          if (n in state.mine) {
            const listingId = state.mine[n] || null
            return (
              <li key={n}>
                <Card typeId={type.id} series={series} number={n} rarity={rarity} tone="mine" listed={!!listingId} size="sm"
                  onClick={() => onSelect({ typeId: type.id, series, number: n, rarityId: rid, state: 'mine', listingId })} />
              </li>
            )
          }
          if (taken.has(n)) {
            const owner = owners[n] || {}
            return (
              <li key={n}>
                <Card typeId={type.id} series={series} number={n} rarity={rarity} tone="taken" size="sm" favorite={favs.has(n)}
                  onClick={() => onSelect({
                    typeId: type.id, series, number: n, rarityId: rid, state: 'taken',
                    ownerId: owner.owner_id, ownerName: owner.owner_name, favorited: favs.has(n),
                  })} />
              </li>
            )
          }
          return (
            <li key={n}>
              <button className={`slot ${favs.has(n) ? 'favorite' : ''}`} aria-label={`Carte ${n}, encore dans les boosters${favs.has(n) ? ', favorite' : ''}`}
                onClick={() => onSelect({ typeId: type.id, series, number: n, rarityId: rid, state: 'free', favorited: favs.has(n) })}>
                {n}
                {favs.has(n) && <span className="slot-favorite" aria-hidden="true">♥</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

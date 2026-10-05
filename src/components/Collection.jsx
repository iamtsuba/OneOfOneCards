import { useCallback, useEffect, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { useGame, fmt, fmtPct } from '../game'
import { rarityId } from '../rarity'
import Card from './Card'
import CardModal from './CardModal'

const SORTS = [
  ['series', 'Par série'],
  ['rarity', 'Par rareté'],
  ['recent', 'Plus récentes'],
]
const PAGE = 60

export default function Collection({ goMarket }) {
  const { rarities, rarityMap, status } = useGame()
  const [view, setView] = useState('album')
  const [stats, setStats] = useState(null)
  const [version, setVersion] = useState(0)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getStats().then(setStats).catch((e) => setError(explain(e)))
  }, [version])

  const changed = () => { setSelected(null); setVersion((v) => v + 1) }
  const pct = stats ? (stats.unique_owned / stats.total_cards) * 100 : 0

  return (
    <section className="page">
      <h1 className="page-title">Collection</h1>

      {stats && (
        <div className="collection-head">
          <p className="collection-count">
            <strong>{fmt(stats.unique_owned)}</strong> carte{stats.unique_owned > 1 ? 's' : ''} à toi sur {fmt(stats.total_cards)}
            <span className="muted"> ({fmtPct(pct)})</span>
          </p>
          <div className="progress" aria-hidden="true"><span style={{ width: `${Math.max(pct, stats.unique_owned ? 0.6 : 0)}%` }} /></div>
          {status && <p className="fine">{fmt(status.cards_taken)} cartes déjà tirées par l’ensemble des joueurs.</p>}
        </div>
      )}

      <div className="segmented" role="tablist" aria-label="Affichage">
        <button role="tab" aria-selected={view === 'album'} className={view === 'album' ? 'on' : ''} onClick={() => setView('album')}>Album par série</button>
        <button role="tab" aria-selected={view === 'cards'} className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>Mes cartes</button>
      </div>

      {error && <p className="msg error" role="alert">{error}</p>}

      {view === 'album' ? (
        <Album rarities={rarities} rarityMap={rarityMap} maxSeries={stats?.max_series ?? 1413} version={version} onSelect={setSelected} />
      ) : (
        <MyCards rarities={rarities} rarityMap={rarityMap} stats={stats} version={version} onSelect={setSelected} />
      )}

      {selected && (
        <CardModal sel={selected} rarity={rarityMap[selected.rarityId]} onClose={() => setSelected(null)} onChanged={changed} goMarket={(v) => { setSelected(null); goMarket(v) }} />
      )}
    </section>
  )
}

function MyCards({ rarities, rarityMap, stats, version, onSelect }) {
  const [rarity, setRarity] = useState(null)
  const [sort, setSort] = useState('series')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .listCollection({ rarity, sort, limit: PAGE, offset: 0 })
      .then((rows) => {
        if (cancelled) return
        setItems(rows)
        setTotal(rows[0] ? Number(rows[0].total) : 0)
      })
      .catch((e) => !cancelled && setError(explain(e)))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [rarity, sort, version])

  const more = useCallback(async () => {
    try {
      const rows = await api.listCollection({ rarity, sort, limit: PAGE, offset: items.length })
      setItems((cur) => [...cur, ...rows])
    } catch (e) {
      setError(explain(e))
    }
  }, [rarity, sort, items.length])

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
        <label className="select">
          <span className="sr">Trier</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      {error && <p className="msg error" role="alert">{error}</p>}

      {!loading && items.length === 0 ? (
        <div className="empty">
          <p><strong>Aucune carte ici pour l’instant.</strong></p>
          <p>{rarity ? 'Change de filtre ou ouvre de nouveaux boosters.' : 'Ouvre ton premier booster pour commencer ta collection.'}</p>
        </div>
      ) : (
        <ul className="grid">
          {items.map((c) => (
            <li key={`${c.card_series}-${c.card_number}`}>
              <Card
                series={c.card_series}
                number={c.card_number}
                rarity={rarityMap[c.rarity_id]}
                listed={!!c.listing_id}
                size="sm"
                onClick={() => onSelect({ series: c.card_series, number: c.card_number, rarityId: c.rarity_id, state: 'mine', listingId: c.listing_id })}
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

function Album({ rarities, rarityMap, maxSeries, version, onSelect }) {
  const [series, setSeries] = useState(null)
  const [input, setInput] = useState('')
  const [state, setState] = useState({ mine: {}, taken: [] })
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .listCollection({ sort: 'recent', limit: 1, offset: 0 })
      .then((rows) => {
        const s = rows[0]?.card_series ?? 10
        setSeries(s)
        setInput(String(s))
      })
      .catch(() => { setSeries(10); setInput('10') })
  }, [])

  useEffect(() => {
    if (series == null) return
    let cancelled = false
    api.seriesState(series).then((s) => !cancelled && setState(s)).catch((e) => setError(explain(e)))
    return () => { cancelled = true }
  }, [series, version])

  const go = (n) => {
    const v = Math.min(maxSeries, Math.max(1, Math.round(Number(n) || 1)))
    setSeries(v)
    setInput(String(v))
  }

  if (series == null) return <p className="muted">Chargement…</p>

  const taken = new Set(state.taken)
  const have = Object.keys(state.mine).length
  const free = series - have - taken.size

  return (
    <div>
      <form className="album-nav" onSubmit={(e) => { e.preventDefault(); go(input) }}>
        <button type="button" className="btn ghost icon" onClick={() => go(series - 1)} disabled={series <= 1} aria-label="Série précédente">‹</button>
        <label className="album-input">
          <span className="sr">Numéro de série</span>
          <span className="muted">Série de</span>
          <input type="number" inputMode="numeric" min="1" max={maxSeries} value={input} onChange={(e) => setInput(e.target.value)} onBlur={() => go(input)} />
        </label>
        <button type="button" className="btn ghost icon" onClick={() => go(series + 1)} disabled={series >= maxSeries} aria-label="Série suivante">›</button>
      </form>

      <p className="collection-count"><strong>{fmt(have)}</strong> sur {fmt(series)} cartes à toi{have === series ? ' : série complète !' : ''}</p>
      <ul className="legend" aria-label="Légende">
        <li><i className="sw mine" />À toi ({fmt(have)})</li>
        <li><i className="sw taken" />Tirée par un autre joueur ({fmt(taken.size)})</li>
        <li><i className="sw free" />Encore dans les boosters ({fmt(free)})</li>
      </ul>

      {error && <p className="msg error" role="alert">{error}</p>}

      <ul className="grid album-grid">
        {Array.from({ length: series }, (_, i) => i + 1).map((n) => {
          const rid = rarityId(n, series, rarities)
          const rarity = rarityMap[rid]
          if (n in state.mine) {
            const listingId = state.mine[n] || null
            return (
              <li key={n}>
                <Card series={series} number={n} rarity={rarity} tone="mine" listed={!!listingId} size="sm"
                  onClick={() => onSelect({ series, number: n, rarityId: rid, state: 'mine', listingId })} />
              </li>
            )
          }
          if (taken.has(n)) {
            return (
              <li key={n}>
                <Card series={series} number={n} rarity={rarity} tone="taken" size="sm"
                  onClick={() => onSelect({ series, number: n, rarityId: rid, state: 'taken' })} />
              </li>
            )
          }
          return (
            <li key={n}>
              <button className="slot" aria-label={`Carte ${n}, encore dans les boosters`}
                onClick={() => onSelect({ series, number: n, rarityId: rid, state: 'free' })}>{n}</button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { useGame, fmt, fmtPct, fmtDate } from '../game'
import { rarityId } from '../rarity'
import Card from './Card'

const SORTS = [
  ['series', 'Par série'],
  ['rarity', 'Par rareté'],
  ['recent', 'Plus récentes'],
  ['quantity', 'Doublons'],
]
const PAGE = 60

export default function Collection() {
  const { rarities, rarityMap } = useGame()
  const [view, setView] = useState('cards')
  const [stats, setStats] = useState(null)
  const [rarity, setRarity] = useState(null)
  const [sort, setSort] = useState('series')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    api.getStats().then(setStats).catch((e) => setError(explain(e)))
  }, [])

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
  }, [rarity, sort])

  const more = useCallback(async () => {
    try {
      const rows = await api.listCollection({ rarity, sort, limit: PAGE, offset: items.length })
      setItems((cur) => [...cur, ...rows])
    } catch (e) {
      setError(explain(e))
    }
  }, [rarity, sort, items.length])

  const byId = Object.fromEntries((stats?.by_rarity || []).map((r) => [r.id, r]))
  const pct = stats ? (stats.unique_owned / stats.total_cards) * 100 : 0

  return (
    <section className="page">
      <h1 className="page-title">Collection</h1>

      {stats && (
        <div className="collection-head">
          <p className="collection-count">
            <strong>{fmt(stats.unique_owned)}</strong> cartes différentes sur {fmt(stats.total_cards)}
            <span className="muted"> ({fmtPct(pct)})</span>
          </p>
          <div className="progress" aria-hidden="true"><span style={{ width: `${Math.max(pct, stats.unique_owned ? 0.6 : 0)}%` }} /></div>
        </div>
      )}

      <div className="segmented" role="tablist" aria-label="Affichage">
        <button role="tab" aria-selected={view === 'cards'} className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>Mes cartes</button>
        <button role="tab" aria-selected={view === 'album'} className={view === 'album' ? 'on' : ''} onClick={() => setView('album')}>Album par série</button>
      </div>

      {error && <p className="msg error" role="alert">{error}</p>}

      {view === 'cards' ? (
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
                    quantity={c.quantity}
                    size="sm"
                    onClick={() => setSelected(c)}
                  />
                </li>
              ))}
            </ul>
          )}

          {items.length < total && (
            <div className="more"><button className="btn ghost" onClick={more}>Afficher plus ({fmt(total - items.length)} restantes)</button></div>
          )}
        </>
      ) : (
        <Album rarities={rarities} rarityMap={rarityMap} maxSeries={stats?.max_series ?? 1413} />
      )}

      {selected && (
        <div className="overlay" role="dialog" aria-modal="true" aria-label="Détail de la carte" onClick={() => setSelected(null)}>
          <div className="detail" onClick={(e) => e.stopPropagation()}>
            <div className="detail-card">
              <Card series={selected.card_series} number={selected.card_number} rarity={rarityMap[selected.rarity_id]} quantity={selected.quantity} size="lg" glow shine />
            </div>
            <p className="reveal-line">
              <strong>{rarityMap[selected.rarity_id]?.name}</strong>, carte {selected.card_number} de la série de {selected.card_series}.
            </p>
            <p className="overlay-hint">
              {selected.quantity > 1 ? `${selected.quantity} exemplaires` : '1 exemplaire'}, dernier obtenu le {fmtDate(selected.last_obtained_at)}.
            </p>
            <button className="btn light" onClick={() => setSelected(null)}>Fermer</button>
          </div>
        </div>
      )}
    </section>
  )
}

function Album({ rarities, rarityMap, maxSeries }) {
  const [series, setSeries] = useState(null)
  const [input, setInput] = useState('')
  const [owned, setOwned] = useState({})
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
    api.seriesOwned(series).then((o) => !cancelled && setOwned(o || {})).catch((e) => setError(explain(e)))
    return () => { cancelled = true }
  }, [series])

  const go = (n) => {
    const v = Math.min(maxSeries, Math.max(1, Math.round(Number(n) || 1)))
    setSeries(v)
    setInput(String(v))
  }

  if (series == null) return <p className="muted">Chargement…</p>

  const have = Object.keys(owned).length
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
      <p className="collection-count"><strong>{fmt(have)}</strong> sur {fmt(series)} cartes{have === series ? ' : série complète !' : ''}</p>
      {error && <p className="msg error" role="alert">{error}</p>}
      <ul className="grid album-grid">
        {Array.from({ length: series }, (_, i) => i + 1).map((n) =>
          owned[n] ? (
            <li key={n}><Card series={series} number={n} rarity={rarityMap[rarityId(n, series, rarities)]} quantity={owned[n]} size="sm" /></li>
          ) : (
            <li key={n}><div className="slot" aria-label={`Carte ${n} manquante`}>{n}</div></li>
          ),
        )}
      </ul>
    </div>
  )
}

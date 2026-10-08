import { useCallback, useEffect, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { useGame, fmt, fmtDate } from '../game'
import TypeArt from './TypeArt'

const TABS = [
  ['categories', 'Catégories'],
  ['types', 'Types'],
  ['config', 'Réglages'],
  ['rarities', 'Raretés'],
  ['uniques', '1/1 gagnées'],
  ['legal', 'Infos légales'],
  ['security', 'Sécurité'],
]

const LEGAL_LABELS = {
  seller_name: 'Nom ou raison sociale du vendeur',
  seller_status: 'Statut (ex. Entrepreneur individuel)',
  seller_address: 'Adresse postale',
  seller_email: 'Email de contact',
  seller_phone: 'Téléphone (facultatif)',
  seller_siret: 'SIRET',
  seller_vat: 'TVA (numéro ou mention)',
  mediator_name: 'Médiateur de la consommation',
  mediator_url: 'Site ou adresse du médiateur',
  consent_cgv_text: 'Texte de la case « conditions de vente »',
  consent_withdrawal_text: 'Texte de la case « renonciation à la rétractation »',
}

// Réduit une image choisie (≤ 256 px) et la renvoie sous forme d'image intégrée (data:image/...)
async function fileToDataUrl(file, max = 256) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('invalid_image'))
      el.src = url
    })
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    let out = canvas.toDataURL('image/webp', 0.85)
    if (out.length > 250000) out = canvas.toDataURL('image/webp', 0.6)
    return out
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function Admin({ onClose }) {
  const { refreshCatalog, refreshStatus } = useGame()
  const [input, setInput] = useState('')
  const [pw, setPw] = useState('')
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('categories')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function login(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      setData(await api.adminData(input))
      setPw(input)
      setInput('')
    } catch (err) {
      setError(explain(err))
    } finally {
      setBusy(false)
    }
  }

  // Exécute une action admin, relit les données puis met à jour l'application
  const run = useCallback(
    async (action, message = 'Enregistré.') => {
      setBusy(true)
      setError('')
      setNotice('')
      try {
        await action(pw)
        setData(await api.adminData(pw))
        await Promise.all([refreshCatalog(), refreshStatus()])
        setNotice(message)
      } catch (e) {
        setError(explain(e))
      } finally {
        setBusy(false)
      }
    },
    [pw, refreshCatalog, refreshStatus],
  )

  const changePassword = async (next) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api.adminChangePassword(pw, next)
      setPw(next)
      setData(await api.adminData(next))
      setNotice('Mot de passe modifié.')
      return true
    } catch (e) {
      setError(explain(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  if (!data) {
    return (
      <div className="legal-overlay" role="dialog" aria-modal="true" aria-label="Console admin" onClick={onClose}>
        <form className="legal-panel consent" onClick={(e) => e.stopPropagation()} onSubmit={login}>
          <h2>Console admin</h2>
          <label>
            Mot de passe
            <input type="password" value={input} onChange={(e) => setInput(e.target.value)} autoComplete="off" autoFocus required />
          </label>
          {error && <p className="msg error" role="alert">{error}</p>}
          <div className="row">
            <button className="btn accent" disabled={busy || !input}>{busy ? 'Vérification…' : 'Entrer'}</button>
            <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="legal-overlay" role="dialog" aria-modal="true" aria-label="Console admin">
      <div className="legal-panel admin">
        <div className="admin-head">
          <h2>Console admin</h2>
          <button className="btn ghost" onClick={onClose}>Fermer</button>
        </div>
        <p className="fine">{fmt(data.players)} joueur{data.players > 1 ? 's' : ''} inscrit{data.players > 1 ? 's' : ''}.</p>

        <div className="chips admin-tabs" role="tablist" aria-label="Sections">
          {TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`chip ${tab === id ? 'on' : ''}`} onClick={() => { setTab(id); setError(''); setNotice('') }}>{label}</button>
          ))}
        </div>

        {error && <p className="msg error" role="alert">{error}</p>}
        {notice && <p className="msg info" role="status">{notice}</p>}

        {tab === 'categories' && <CategoriesTab data={data} run={run} busy={busy} />}
        {tab === 'types' && <TypesTab data={data} run={run} busy={busy} />}
        {tab === 'config' && <ConfigTab data={data} run={run} busy={busy} />}
        {tab === 'rarities' && <RaritiesTab data={data} run={run} busy={busy} />}
        {tab === 'uniques' && <UniqueWinsTab data={data} />}
        {tab === 'legal' && <LegalTab data={data} run={run} busy={busy} />}
        {tab === 'security' && <SecurityTab busy={busy} onChange={changePassword} />}
      </div>
    </div>
  )
}

const Color = ({ label, value, onChange }) => (
  <label className="color-field">
    <span>{label}</span>
    <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
  </label>
)

// ---------- Catégories ----------
function CategoriesTab({ data, run, busy }) {
  const nextPos = Math.max(0, ...data.categories.map((c) => c.position)) + 1
  const rangeRarities = data.rarities.filter((r) => r.kind === 'range').sort((a, b) => a.sort_order - b.sort_order)
  return (
    <div className="admin-list">
      <p className="muted">
        Une seule catégorie est ouvrable à la fois : la première (par position) qui est activée et pas terminée. Quand toutes ses cartes sont tirées,
        la suivante s’ouvre. Le nombre de séries ne peut plus changer une fois des cartes tirées.
      </p>
      {data.categories.map((c) => (
        <CategoryForm key={c.id} cat={c} rangeRarities={rangeRarities} categoryRarities={data.category_rarities ?? []} run={run} busy={busy} />
      ))}
      <h3>Nouvelle catégorie</h3>
      <CategoryForm key={`new-${data.categories.length}`} cat={null} nextPos={nextPos} rangeRarities={rangeRarities} categoryRarities={data.category_rarities ?? []} run={run} busy={busy} />
    </div>
  )
}

// Seuils par défaut au prorata du nombre de séries (référence : les seuils globaux, calibrés pour 500 séries)
function proportionalThresholds(seriesCount, rangeRarities) {
  let prev = 0
  const out = {}
  for (const r of rangeRarities) {
    if (r.max_series == null) { out[r.id] = ''; continue }
    const v = Math.min(Math.max(Math.round((r.max_series / 500) * seriesCount), prev + 1), seriesCount)
    out[r.id] = String(v)
    prev = v
  }
  return out
}

function CategoryForm({ cat, nextPos, rangeRarities, categoryRarities, run, busy }) {
  const [f, setF] = useState({
    name: cat?.name ?? '', position: cat?.position ?? nextPos ?? 1, series_count: cat?.series_count ?? 500,
    color: cat?.color ?? '#ffd9b0', color2: cat?.color2 ?? '#f29a45', text_color: cat?.text_color ?? '#3d1f00', enabled: cat?.enabled ?? true,
  })
  const [thresholds, setThresholds] = useState(() => {
    if (cat) {
      const own = Object.fromEntries(categoryRarities.filter((cr) => cr.category_id === cat.id).map((cr) => [cr.rarity_id, cr.max_series]))
      if (Object.keys(own).length) return Object.fromEntries(rangeRarities.map((r) => [r.id, own[r.id] == null ? '' : String(own[r.id])]))
    }
    return proportionalThresholds(cat?.series_count ?? 500, rangeRarities)
  })
  const [touched, setTouched] = useState(false)
  const setThreshold = (id) => (v) => { setTouched(true); setThresholds((cur) => ({ ...cur, [id]: v })) }
  const set = (k) => (v) => {
    setF((cur) => ({ ...cur, [k]: v }))
    // Nouvelle catégorie : tant que l'admin n'a pas touché aux seuils, on les recalcule au prorata
    if (!cat && k === 'series_count' && !touched) setThresholds(proportionalThresholds(Number(v) || 1, rangeRarities))
  }
  const started = (cat?.taken ?? 0) > 0
  const pct = cat && cat.total ? (cat.taken / cat.total) * 100 : 0
  const rarities = rangeRarities.map((r) => ({ rarity_id: r.id, max_series: thresholds[r.id] === '' ? null : Number(thresholds[r.id]) }))
  return (
    <div className="admin-card" style={{ '--cat1': f.color, '--cat2': f.color2 }}>
      <div className="admin-card-head">
        <i className="cat-dot" />
        <strong>{cat ? cat.name : 'Nouvelle catégorie'}</strong>
        {cat && <span className={`badge ${cat.closed ? 'done' : ''}`}>{cat.closed ? 'Terminée' : cat.enabled ? 'Active' : 'Désactivée'}</span>}
      </div>
      {cat && <p className="fine">{fmt(cat.taken)} cartes tirées sur {fmt(cat.total)} ({pct.toFixed(pct < 1 ? 3 : 1)} %)</p>}
      <div className="admin-grid">
        <label>Nom<input value={f.name} maxLength={40} onChange={(e) => set('name')(e.target.value)} /></label>
        <label>Position<input type="number" value={f.position} onChange={(e) => set('position')(e.target.value)} /></label>
        <label>Séries (1 à N)<input type="number" min="1" max="5000" value={f.series_count} disabled={started} onChange={(e) => set('series_count')(e.target.value)} /></label>
      </div>
      <div className="admin-colors">
        <Color label="Couleur claire" value={f.color} onChange={set('color')} />
        <Color label="Couleur soutenue" value={f.color2} onChange={set('color2')} />
        <Color label="Texte" value={f.text_color} onChange={set('text_color')} />
        <label className="check inline"><input type="checkbox" checked={f.enabled} onChange={(e) => set('enabled')(e.target.checked)} /><span>Activée</span></label>
      </div>

      <p className="fine rarity-thresholds-hint">
        Seuils de rareté de cette catégorie : chaque rareté couvre les séries jusqu’à la taille indiquée (la dernière, sans valeur, couvre le
        reste). Pré-remplis au prorata du nombre de séries ci-dessus, modifiables.
      </p>
      <div className="admin-grid rarity-thresholds">
        {rangeRarities.map((r) => (
          <label key={r.id} style={{ '--cat1': r.color, '--cat2': r.color2 }}>
            <span className="rarity-threshold-label"><i className="cat-dot" />{r.name}</span>
            <input type="number" min="1" max={f.series_count} value={thresholds[r.id]}
              placeholder="toutes les autres" onChange={(e) => setThreshold(r.id)(e.target.value)} />
          </label>
        ))}
      </div>

      <div className="row">
        <button className="btn" disabled={busy || !f.name.trim()} onClick={() => run((pw) => api.adminSaveCategory(pw, { id: cat?.id, ...f, rarities }), cat ? 'Catégorie enregistrée.' : 'Catégorie créée.')}>
          {cat ? 'Enregistrer' : 'Créer'}
        </button>
        {cat && (
          <button className="btn ghost" disabled={busy} onClick={() => run((pw) => api.adminSetCategoryClosed(pw, cat.id, !cat.closed), cat.closed ? 'Catégorie rouverte.' : 'Catégorie terminée : la suivante s’ouvre.')}>
            {cat.closed ? 'Rouvrir' : 'Terminer maintenant'}
          </button>
        )}
        {cat && !started && (
          <button className="btn ghost danger" disabled={busy} onClick={() => window.confirm(`Supprimer « ${cat.name} » et ses types ?`) && run((pw) => api.adminDeleteCategory(pw, cat.id), 'Catégorie supprimée.')}>
            Supprimer
          </button>
        )}
      </div>
    </div>
  )
}

// ---------- Types ----------
function TypesTab({ data, run, busy }) {
  const [catId, setCatId] = useState(data.categories[0]?.id ?? null)
  const types = data.types.filter((t) => t.category_id === catId)
  const nextPos = Math.max(0, ...types.map((t) => t.position)) + 1
  if (!data.categories.length) return <p className="muted">Crée d’abord une catégorie.</p>
  return (
    <div className="admin-list">
      <label>
        Catégorie
        <select value={catId ?? ''} onChange={(e) => setCatId(Number(e.target.value))}>
          {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <p className="muted">
        L’image est un emoji, une adresse https:// ou une image téléversée (réduite à 256 px). Chaque type a sa propre numérotation de 1/1 à N/N.
        Attention aux droits des images que tu utilises.
      </p>
      {types.map((t) => <TypeForm key={t.id} type={t} categoryId={catId} run={run} busy={busy} />)}
      <h3>Nouveau type</h3>
      <TypeForm key={`new-${catId}-${types.length}`} type={null} categoryId={catId} nextPos={nextPos} run={run} busy={busy} />
    </div>
  )
}

function TypeForm({ type, categoryId, nextPos, run, busy }) {
  const [f, setF] = useState({ name: type?.name ?? '', position: type?.position ?? nextPos ?? 1, image: type?.image ?? '' })
  const [localError, setLocalError] = useState('')
  const uploaded = f.image.startsWith('data:')
  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLocalError('')
    try {
      const url = await fileToDataUrl(file)
      setF((cur) => ({ ...cur, image: url }))
    } catch {
      setLocalError('Impossible de lire cette image.')
    }
  }
  return (
    <div className="admin-card">
      <div className="admin-card-head">
        <span className="admin-type-art"><TypeArt type={{ image: f.image }} /></span>
        <strong>{type ? type.name : 'Nouveau type'}</strong>
        {type && type.taken > 0 && <span className="badge">{fmt(type.taken)} tirées</span>}
      </div>
      <div className="admin-grid">
        <label>Nom<input value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label>Position<input type="number" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></label>
      </div>
      <label>
        Image (emoji ou adresse https://)
        {uploaded ? (
          <input value="Image téléversée" readOnly />
        ) : (
          <input value={f.image} placeholder="📼 ou https://…" onChange={(e) => setF({ ...f, image: e.target.value })} />
        )}
      </label>
      <div className="row">
        <label className="btn ghost file-btn">
          Téléverser une image
          <input type="file" accept="image/*" onChange={onFile} hidden />
        </label>
        {f.image && <button type="button" className="btn ghost" onClick={() => setF({ ...f, image: '' })}>Retirer l’image</button>}
      </div>
      {localError && <p className="msg error">{localError}</p>}
      <div className="row">
        <button className="btn" disabled={busy || !f.name.trim()} onClick={() => run((pw) => api.adminSaveType(pw, { id: type?.id, category_id: categoryId, ...f }), type ? 'Type enregistré.' : 'Type créé.')}>
          {type ? 'Enregistrer' : 'Créer'}
        </button>
        {type && type.taken === 0 && (
          <button className="btn ghost danger" disabled={busy} onClick={() => window.confirm(`Supprimer « ${type.name} » ?`) && run((pw) => api.adminDeleteType(pw, type.id), 'Type supprimé.')}>
            Supprimer
          </button>
        )}
      </div>
    </div>
  )
}

// ---------- Réglages ----------
function ConfigTab({ data, run, busy }) {
  return (
    <div className="admin-list">
      <p className="muted">Réglages du jeu et de la boutique. Les modifications s’appliquent tout de suite.</p>
      {data.config.map((row) => <ConfigRow key={row.key} row={row} run={run} busy={busy} />)}
    </div>
  )
}

function ConfigRow({ row, run, busy }) {
  const [v, setV] = useState(String(Number(row.value)))
  const changed = v !== String(Number(row.value))
  return (
    <div className="admin-card slim">
      <div>
        <strong className="config-key">{row.key}</strong>
        <p className="fine">{row.description}</p>
      </div>
      <div className="row nowrap">
        <input type="number" step="any" value={v} onChange={(e) => setV(e.target.value)} />
        <button className="btn" disabled={busy || !changed || v === ''} onClick={() => run((pw) => api.adminSetConfig(pw, row.key, v), 'Réglage enregistré.')}>OK</button>
      </div>
    </div>
  )
}

// ---------- Raretés ----------
function RaritiesTab({ data, run, busy }) {
  return (
    <div className="admin-list">
      <p className="muted">
        Nom, couleurs et seuils. « Taille de série maximale » : une rareté à seuil concerne les séries jusqu’à cette taille (vide = toutes les
        autres). Ce sont les seuils globaux, utilisés comme valeurs de départ pour chaque catégorie ; ajuste ensuite chaque catégorie dans l’onglet
        « Catégories » si elle a besoin de seuils différents.
      </p>
      {data.rarities.map((r) => <RarityForm key={r.id} rarity={r} run={run} busy={busy} />)}
      <h3>Nouvelle rareté</h3>
      <p className="muted">
        Unique, Alpha et Omega sont fixes (1/1, 1/m, m/m) : on ne peut ajouter qu’une rareté « à seuil », entre les raretés existantes. Elle
        s’ajoute aux seuils des catégories qui ont déjà les leurs (modifiable ensuite catégorie par catégorie).
      </p>
      <NewRarityForm key={`new-rarity-${data.rarities.length}`} run={run} busy={busy} />
    </div>
  )
}

function RarityForm({ rarity, run, busy }) {
  const [f, setF] = useState({ name: rarity.name, max_series: rarity.max_series ?? '', color: rarity.color, color2: rarity.color2, text_color: rarity.text_color })
  const set = (k) => (v) => setF((cur) => ({ ...cur, [k]: v }))
  return (
    <div className="admin-card" style={{ '--cat1': f.color, '--cat2': f.color2 }}>
      <div className="admin-card-head"><i className="cat-dot" /><strong>{rarity.name}</strong><span className="badge">{rarity.kind}</span></div>
      <div className="admin-grid">
        <label>Nom<input value={f.name} maxLength={30} onChange={(e) => set('name')(e.target.value)} /></label>
        {rarity.kind === 'range' && (
          <label>Taille de série maximale<input type="number" value={f.max_series} onChange={(e) => set('max_series')(e.target.value)} placeholder="toutes" /></label>
        )}
      </div>
      <div className="admin-colors">
        <Color label="Couleur" value={f.color} onChange={set('color')} />
        <Color label="Couleur 2" value={f.color2} onChange={set('color2')} />
        <Color label="Texte" value={f.text_color} onChange={set('text_color')} />
      </div>
      <div className="row">
        <button className="btn" disabled={busy || !f.name.trim()} onClick={() => run((pw) => api.adminSaveRarity(pw, { id: rarity.id, ...f }), 'Rareté enregistrée.')}>Enregistrer</button>
        {rarity.kind === 'range' && (
          <button className="btn ghost danger" disabled={busy} onClick={() => window.confirm(`Supprimer la rareté « ${rarity.name} » ? Impossible si elle est déjà utilisée.`) && run((pw) => api.adminDeleteRarity(pw, rarity.id), 'Rareté supprimée.')}>
            Supprimer
          </button>
        )}
      </div>
    </div>
  )
}

function NewRarityForm({ run, busy }) {
  const [f, setF] = useState({ id: '', name: '', max_series: '', color: '#a5b4fc', color2: '#4338ca', text_color: '#ffffff' })
  const set = (k) => (v) => setF((cur) => ({ ...cur, [k]: v }))
  const slug = f.id.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
  const valid = /^[a-z][a-z0-9_]{1,19}$/.test(slug) && f.name.trim() && Number(f.max_series) >= 1
  return (
    <div className="admin-card" style={{ '--cat1': f.color, '--cat2': f.color2 }}>
      <div className="admin-card-head"><i className="cat-dot" /><strong>Nouvelle rareté</strong></div>
      <div className="admin-grid">
        <label>Identifiant (fixe)<input value={f.id} maxLength={20} placeholder="ex. legendaire" onChange={(e) => set('id')(e.target.value)} /></label>
        <label>Nom<input value={f.name} maxLength={30} onChange={(e) => set('name')(e.target.value)} /></label>
        <label>Taille de série maximale<input type="number" min="1" value={f.max_series} placeholder="ex. 15" onChange={(e) => set('max_series')(e.target.value)} /></label>
      </div>
      <div className="admin-colors">
        <Color label="Couleur" value={f.color} onChange={set('color')} />
        <Color label="Couleur 2" value={f.color2} onChange={set('color2')} />
        <Color label="Texte" value={f.text_color} onChange={set('text_color')} />
      </div>
      <div className="row">
        <button className="btn" disabled={busy || !valid} onClick={() => run((pw) => api.adminCreateRarity(pw, { ...f, id: slug }), 'Rareté créée.')}>
          Créer
        </button>
      </div>
    </div>
  )
}

// ---------- 1/1 gagnées ----------
function UniqueWinsTab({ data }) {
  const wins = data.unique_wins ?? []
  return (
    <div className="admin-list">
      <p className="muted">Chaque carte Unique (1/1) obtenue, la plus récente en premier (les 500 dernières).</p>
      {wins.length === 0 ? (
        <p className="muted">Aucune 1/1 obtenue pour l’instant.</p>
      ) : (
        wins.map((w) => (
          <div key={w.id} className="admin-card slim">
            <div>
              <strong>{w.email}</strong>
              <p className="fine">{w.username ?? 'pseudo inconnu'} · {w.type_name} · {fmtDate(w.won_at)}</p>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ---------- Infos légales ----------
function LegalTab({ data, run, busy }) {
  return (
    <div className="admin-list">
      <p className="muted">Ces informations apparaissent dans les conditions de vente et les mentions légales. À renseigner avant de vendre pour de vrai.</p>
      {data.legal.map((row) => <LegalRow key={row.key} row={row} run={run} busy={busy} />)}
    </div>
  )
}

function LegalRow({ row, run, busy }) {
  const [v, setV] = useState(row.value ?? '')
  const long = row.key.startsWith('consent_')
  return (
    <div className="admin-card slim stack">
      <label>
        {LEGAL_LABELS[row.key] ?? row.key}
        {long ? <textarea rows={3} value={v} onChange={(e) => setV(e.target.value)} /> : <input value={v} onChange={(e) => setV(e.target.value)} />}
      </label>
      <div className="row">
        <button className="btn" disabled={busy || v === (row.value ?? '')} onClick={() => run((pw) => api.adminSetLegal(pw, row.key, v), 'Enregistré.')}>Enregistrer</button>
      </div>
    </div>
  )
}

// ---------- Sécurité ----------
function SecurityTab({ busy, onChange }) {
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const ok = next.length >= 8 && next === again
  return (
    <div className="admin-list">
      <h3>Changer le mot de passe admin</h3>
      <label>Nouveau mot de passe (8 caractères minimum)<input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></label>
      <label>Confirmer<input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" /></label>
      {next && again && next !== again && <p className="msg error">Les deux mots de passe sont différents.</p>}
      <div className="row">
        <button className="btn" disabled={busy || !ok} onClick={async () => { if (await onChange(next)) { setNext(''); setAgain('') } }}>Modifier</button>
      </div>
      <p className="fine">Le mot de passe n’est jamais stocké en clair : seule son empreinte (bcrypt) est enregistrée. Après 5 erreurs, l’accès est verrouillé 15 minutes.</p>
    </div>
  )
}

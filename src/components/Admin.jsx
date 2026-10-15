import { useCallback, useEffect, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { useGame, fmt, fmtDate } from '../game'
import TypeArt from './TypeArt'
import { parseTypesFile, TEMPLATE_CSV, MAX_ROWS } from '../importTypes'
import { bandsOf, defaultBands, validateTypeRarities } from '../bands'

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
        const res = await action(pw)
        setData(await api.adminData(pw))
        await Promise.all([refreshCatalog(), refreshStatus()])
        setNotice(typeof message === 'function' ? message(res) : message)
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
export function CategoriesTab({ data, run, busy }) {
  const nextPos = Math.max(0, ...data.categories.map((c) => c.position)) + 1
  return (
    <div className="admin-list">
      <p className="muted">
        Une seule catégorie est ouvrable à la fois : la première (par position) qui est activée et pas terminée. Quand toutes ses cartes sont tirées,
        la suivante s’ouvre. Le nombre de séries (par défaut pour chaque type) ne peut plus changer une fois des cartes tirées. Les raretés ne se
        règlent plus par catégorie : elles se règlent par type (onglet « Types »).
      </p>
      {data.categories.map((c) => (
        <CategoryForm key={c.id} cat={c} run={run} busy={busy} />
      ))}
      <h3>Nouvelle catégorie</h3>
      <CategoryForm key={`new-${data.categories.length}`} cat={null} nextPos={nextPos} run={run} busy={busy} />
    </div>
  )
}

function CategoryForm({ cat, nextPos, run, busy }) {
  const [f, setF] = useState({
    name: cat?.name ?? '', position: cat?.position ?? nextPos ?? 1, series_count: cat?.series_count ?? 500,
    color: cat?.color ?? '#ffd9b0', color2: cat?.color2 ?? '#f29a45', text_color: cat?.text_color ?? '#3d1f00', enabled: cat?.enabled ?? true,
  })
  const set = (k) => (v) => setF((cur) => ({ ...cur, [k]: v }))
  const [confirmDelete, setConfirmDelete] = useState('')   // nom retapé pour confirmer la suppression forcée
  const started = (cat?.taken ?? 0) > 0
  const pct = cat && cat.total ? (cat.taken / cat.total) * 100 : 0
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

      <div className="row">
        <button className="btn" disabled={busy || !f.name.trim()} onClick={() => run((pw) => api.adminSaveCategory(pw, { id: cat?.id, ...f }), cat ? 'Catégorie enregistrée.' : 'Catégorie créée.')}>
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

      {cat && started && (
        <div className="danger-zone">
          <p className="fine">
            Zone dangereuse : <strong>{cat.taken}</strong> carte{cat.taken > 1 ? 's' : ''} déjà tirée{cat.taken > 1 ? 's' : ''} dans cette
            catégorie. La supprimer retire aussi ces cartes aux joueurs qui les possèdent, ainsi que ses types, annonces, enchères (les
            enchérisseurs en tête sont remboursés), offres, notifications et favoris liés. Irréversible.
          </p>
          <label>
            Tape « {cat.name} » pour confirmer
            <input value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} placeholder={cat.name} />
          </label>
          <button
            className="btn ghost danger"
            disabled={busy || confirmDelete !== cat.name}
            onClick={() => run((pw) => api.adminForceDeleteCategory(pw, cat.id, confirmDelete), 'Catégorie et tout son contenu supprimés.')}
          >
            Supprimer la catégorie et tout son contenu
          </button>
        </div>
      )}
    </div>
  )
}

// ---------- Types ----------
export function TypesTab({ data, run, busy, initialCollapsed = [] }) {
  const [catId, setCatId] = useState(data.categories[0]?.id ?? null)
  const [collapsed, setCollapsed] = useState(() => new Set(initialCollapsed))   // types réduits (seul leur en-tête reste visible)
  const toggle = (id) => setCollapsed((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })
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
        L’image est un emoji, une adresse https:// ou une image téléversée (réduite à 256 px). Les raretés, le nombre de séries et les numéros visibles
        se règlent <strong>par type</strong> (bloc « Raretés de ce type » de chaque fiche). Attention aux droits des images que tu utilises.
      </p>
      {types.length > 1 && (
        <div className="row">
          <button type="button" className="btn ghost" onClick={() => setCollapsed(new Set(types.map((t) => t.id)))}>Tout réduire</button>
          <button type="button" className="btn ghost" onClick={() => setCollapsed(new Set())}>Tout déplier</button>
        </div>
      )}
      {types.map((t) => (
        <TypeForm key={t.id} type={t} categoryId={catId} data={data} run={run} busy={busy} collapsed={collapsed.has(t.id)} onToggle={() => toggle(t.id)} />
      ))}
      <h3>Nouveau type</h3>
      <TypeForm key={`new-${catId}-${types.length}`} type={null} categoryId={catId} nextPos={nextPos} run={run} busy={busy} />
      <h3>Importer des types</h3>
      <ImportTypes key={`import-${catId}-${types.length}`} categoryId={catId} existing={types.map((t) => t.name)} run={run} busy={busy} />
    </div>
  )
}

function TypeForm({ type, categoryId, nextPos, data, run, busy, collapsed = false, onToggle }) {
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
    <div className={`admin-card${collapsed ? ' collapsed' : ''}`}>
      <div className="admin-card-head">
        {type && onToggle && (
          <button type="button" className="btn ghost icon collapse-btn" aria-expanded={!collapsed}
            aria-label={`${collapsed ? 'Déplier' : 'Réduire'} ${type.name}`} title={collapsed ? 'Déplier' : 'Réduire'} onClick={onToggle}>
            {collapsed ? '▸' : '▾'}
          </button>
        )}
        <span className="admin-type-art"><TypeArt type={{ image: f.image }} /></span>
        <strong>{type ? type.name : 'Nouveau type'}</strong>
        {type && type.taken > 0 && <span className="badge">{fmt(type.taken)} tirées</span>}
        {type?.series_count && <span className="badge">{fmt(type.series_count)} séries</span>}
        {type?.secret && <span className="badge">secret</span>}
      </div>
      {!collapsed && (
      <>
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
      {type && data && <TypeRaritiesEditor key={`${type.id}-${type.series_count}-${type.secret}`} type={type} data={data} run={run} busy={busy} />}
      </>
      )}
    </div>
  )
}

// Raretés d'un type (logique « Topps ») : tranches de séries, numéros visibles, type secret
function TypeRaritiesEditor({ type, data, run, busy }) {
  const rarityList = data.rarities.filter((r) => r.kind === 'range').sort((a, b) => a.sort_order - b.sort_order)
  const nameOf = (id) => data.rarities.find((r) => r.id === id)?.name ?? id
  const category = data.categories.find((c) => c.id === type.category_id)
  const own = (data.type_rarities ?? []).filter((r) => r.type_id === type.id)
  const toRow = (r) => ({ rarity_id: r.rarity_id, max_series: String(r.max_series), numbered_series: String(r.numbered_series) })
  const [custom, setCustom] = useState(own.length > 0)
  const [rows, setRows] = useState(() => own.map(toRow))
  const [secret, setSecret] = useState(!!type.secret)
  const inherited = defaultBands(rarityList, category)

  const customize = () => {
    setRows(inherited.map((b) => ({ rarity_id: b.rarity_id, max_series: String(b.hi), numbered_series: String(b.hi - b.lo + 1) })))
    setCustom(true)
  }
  const setRow = (i, k, v) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const addRow = () => {
    const used = new Set(rows.map((r) => r.rarity_id))
    const free = rarityList.find((r) => !used.has(r.id))
    if (!free) return
    const top = Math.max(0, ...rows.map((r) => Number(r.max_series) || 0))
    setRows((cur) => [...cur, { rarity_id: free.id, max_series: String(Math.min(5000, top + 100)), numbered_series: '0' }])
  }
  const problem = custom ? validateTypeRarities(rows) : ''
  const payload = rows.map((r) => ({ rarity_id: r.rarity_id, max_series: Number(r.max_series), numbered_series: Number(r.numbered_series || 0) }))
  const bands = custom ? (problem ? [] : bandsOf(payload)) : inherited
  const describeNumbers = (b) => {
    const size = b.hi - b.lo + 1
    if (b.numbered >= size) return 'tous les numéros visibles'
    if (b.numbered <= 0) return 'non numérotée (numéro jamais visible)'
    return `numéro visible sur les ${b.numbered} première${b.numbered > 1 ? 's' : ''} série${b.numbered > 1 ? 's' : ''} (séries ${b.lo} à ${b.lo + b.numbered - 1}), masqué ensuite`
  }
  const save = () =>
    run(
      (pw) => api.adminSaveTypeRarities(pw, type.id, custom ? payload : own.length ? [] : null, secret),
      'Raretés du type enregistrées.',
    )

  return (
    <details className="type-rarities">
      <summary>
        Raretés de ce type
        <span className="muted"> — {custom ? 'propres à ce type' : 'seuils par défaut (onglet Raretés)'}</span>
      </summary>
      <label className="check inline">
        <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
        <span>Type secret : caché des joueurs tant qu’ils n’en possèdent aucune carte, numéroté au-delà de la checklist (ex. [51/50])</span>
      </label>

      {custom && (
        <>
          <p className="fine">
            Chaque rareté couvre une tranche de tailles de série, à la suite de la précédente (dans l’ordre des tailles). « Séries numérotées » : nombre
            de séries de la tranche, en partant de la plus petite, dont le numéro n/m est visible sur la carte ; les autres sont numérotées en interne mais
            sans numéro visible. 0 = rareté non numérotée. Le nombre de séries du type est la plus grande taille.
          </p>
          <div className="type-rarity-rows">
            {rows.map((r, i) => (
              <div className="type-rarity-row" key={i}>
                <select value={r.rarity_id} onChange={(e) => setRow(i, 'rarity_id', e.target.value)} aria-label="Rareté">
                  {rarityList.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <label>Taille de série max.<input type="number" min="1" max="5000" value={r.max_series} onChange={(e) => setRow(i, 'max_series', e.target.value)} /></label>
                <label>Séries numérotées<input type="number" min="0" value={r.numbered_series} onChange={(e) => setRow(i, 'numbered_series', e.target.value)} /></label>
                <button type="button" className="btn ghost icon" onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))} aria-label="Retirer cette rareté">×</button>
              </div>
            ))}
          </div>
          <div className="row">
            <button type="button" className="btn ghost" onClick={addRow} disabled={rows.length >= rarityList.length}>Ajouter une rareté</button>
            <button type="button" className="btn ghost" onClick={() => { setCustom(false); setRows([]) }}>Revenir aux seuils par défaut</button>
          </div>
          {problem && <p className="msg error">{problem}</p>}
        </>
      )}

      {!custom && <p className="fine">Ce type utilise les seuils par défaut de l’onglet « Raretés » (numéros toujours visibles). Seuils actuels :</p>}
      {bands.length > 0 && (
        <ul className="type-rarity-bands">
          {bands.map((b) => (
            <li key={b.rarity_id}>
              <strong>{nameOf(b.rarity_id)}</strong> : séries {b.lo} à {b.hi}
              <span className="muted"> — {describeNumbers(b)}</span>
            </li>
          ))}
        </ul>
      )}
      {!custom && <div className="row"><button type="button" className="btn ghost" onClick={customize}>Personnaliser les raretés de ce type</button></div>}
      {type.taken > 0 && custom && <p className="fine">Des cartes de ce type ont déjà été tirées : réduire le nombre de séries sous une carte existante est refusé.</p>}

      <div className="row">
        <button className="btn" disabled={busy || !!problem} onClick={save}>Enregistrer les raretés</button>
      </div>
    </details>
  )
}

// Import d'un fichier CSV/TSV (nom ; position ; image) dans la catégorie choisie : aperçu ligne par ligne, tout ou rien
function ImportTypes({ categoryId, existing, run, busy }) {
  const [parsed, setParsed] = useState(null)
  const [fileName, setFileName] = useState('')
  const [readError, setReadError] = useState('')

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setReadError('')
    try {
      setParsed(parseTypesFile(await file.text(), existing))
      setFileName(file.name)
    } catch {
      setParsed(null)
      setReadError('Impossible de lire ce fichier.')
    }
  }
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'modele-types.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const rows = parsed?.rows ?? []
  const errors = rows.filter((r) => r.error)
  const dupes = rows.filter((r) => r.duplicate)
  const toCreate = rows.filter((r) => !r.error && !r.duplicate)
  const doImport = () =>
    run(
      (pw) => api.adminImportTypes(pw, categoryId, toCreate.map((r) => ({ name: r.name, position: r.position, image: r.image }))),
      (res) => `${res.created} type${res.created > 1 ? 's' : ''} importé${res.created > 1 ? 's' : ''}${res.skipped ? `, ${res.skipped} ignoré${res.skipped > 1 ? 's' : ''} (déjà présent${res.skipped > 1 ? 's' : ''})` : ''}.`,
    )

  return (
    <div className="admin-card">
      <p className="muted">
        Fichier CSV ou texte, une ligne par type : <strong>nom ; position ; image</strong> (position et image facultatives). L’image est un emoji ou une
        adresse https://. Séparateur ; , ou tabulation, en-tête facultatif. {MAX_ROWS} types maximum, tout ou rien : une ligne invalide annule
        l’import. Un nom déjà présent dans la catégorie est ignoré.
      </p>
      <div className="row">
        <label className="btn ghost file-btn">
          Choisir un fichier
          <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={onFile} hidden />
        </label>
        <button type="button" className="btn ghost" onClick={downloadTemplate}>Télécharger un modèle</button>
      </div>
      {readError && <p className="msg error">{readError}</p>}
      {parsed?.fileError && <p className="msg error">{parsed.fileError}</p>}

      {rows.length > 0 && (
        <>
          <p>
            <strong>{fileName}</strong> : {rows.length} ligne{rows.length > 1 ? 's' : ''} — {toCreate.length} à créer
            {dupes.length ? `, ${dupes.length} déjà présente${dupes.length > 1 ? 's' : ''} (ignorée${dupes.length > 1 ? 's' : ''})` : ''}
            {errors.length ? `, ${errors.length} en erreur` : ''}.
          </p>
          {errors.length > 0 && <p className="msg error">Corrige les lignes en erreur dans ton fichier puis recharge-le : l’import est bloqué tant qu’il en reste.</p>}
          <ul className="import-preview">
            {rows.map((r) => (
              <li key={r.line} className={r.error ? 'bad' : r.duplicate ? 'skip' : ''}>
                <span className="admin-type-art">{r.kind === 'invalid' ? '⚠️' : <TypeArt type={{ image: r.image }} />}</span>
                <span className="import-name">{r.name || '(sans nom)'}</span>
                <span className="muted">{r.position ?? 'auto'}</span>
                <span className="fine">
                  ligne {r.line}{r.error ? ` : ${r.error}` : r.duplicate ? ' : déjà présent, ignoré' : ''}
                </span>
              </li>
            ))}
          </ul>
          <div className="row">
            <button className="btn" disabled={busy || errors.length > 0 || toCreate.length === 0} onClick={doImport}>
              {toCreate.length === 0 && !errors.length ? 'Rien de nouveau à importer' : `Importer ${toCreate.length} type${toCreate.length > 1 ? 's' : ''}`}
            </button>
            <button type="button" className="btn ghost" onClick={() => setParsed(null)}>Annuler</button>
          </div>
        </>
      )}
    </div>
  )
}

// ---------- Réglages ----------
export function ConfigTab({ data, run, busy }) {
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
export function RaritiesTab({ data, run, busy }) {
  return (
    <div className="admin-list">
      <p className="muted">
        Nom, couleurs et seuils. « Taille de série maximale » : une rareté à seuil concerne les séries jusqu’à cette taille (vide = toutes les
        autres). Ce sont les seuils par défaut des types qui n’ont pas de raretés propres ; chaque type peut les personnaliser (tranches, numéros
        visibles) dans l’onglet « Types ».
      </p>
      {data.rarities.map((r) => <RarityForm key={r.id} rarity={r} run={run} busy={busy} />)}
      <h3>Nouvelle rareté</h3>
      <p className="muted">
        Unique, Alpha et Omega sont fixes (1/1, 1/m, m/m) ; Alpha et Omega ne concernent que les séries dont le numéro est visible (ailleurs, ces cartes ont la rareté de leur tranche). On ne peut ajouter qu’une rareté « à seuil », entre les raretés existantes. Elle
        devient un seuil par défaut ; pour l’utiliser sur un type qui a déjà ses propres raretés, ajoute-la dans sa fiche (onglet « Types »).
      </p>
      <NewRarityForm key={`new-rarity-${data.rarities.length}`} rarities={data.rarities} run={run} busy={busy} />
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

function NewRarityForm({ rarities, run, busy }) {
  const [f, setF] = useState({ id: '', name: '', max_series: '', before: '', color: '#a5b4fc', color2: '#4338ca', text_color: '#ffffff' })
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
        <label>
          Place dans l’ordre d’affichage
          <select value={f.before} onChange={(e) => set('before')(e.target.value)}>
            <option value="">À la fin (la moins rare)</option>
            {[...rarities].sort((a, b) => a.sort_order - b.sort_order).map((r) => <option key={r.id} value={r.id}>Avant « {r.name} »</option>)}
          </select>
        </label>
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
export function UniqueWinsTab({ data }) {
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
export function LegalTab({ data, run, busy }) {
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
export function SecurityTab({ busy, onChange }) {
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

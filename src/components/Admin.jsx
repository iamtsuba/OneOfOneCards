import { useCallback, useEffect, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { useGame, fmt, fmtDate } from '../game'
import { IS_PREPROD } from '../env'
import { fmtOdds } from './Odds'
import { defaultPositions, pickableRarities, positionsToSlots, resizePositions, shares, slotsToPositions, validateBooster, roleLabel, ROLES, GLOWS, glowOf, NUMBERED, MAX_CARDS } from '../boosterLogic'
import TypeArt from './TypeArt'
import Pack from './Pack'
import Card from './Card'
import { parseTypesFile, makeTemplate, matchPhotos, photoKey, describeRarities, MAX_ROWS } from '../importTypes'
import { CARD_STYLES, cardCount, defaultConfig, validateTypeRarities } from '../bands'

// Écran large (PC) : la console passe en mise en page horizontale (navigation à gauche, listes à gauche et détail à droite)
const WIDE_QUERY = '(min-width: 1100px)'
export function useWide() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(WIDE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(WIDE_QUERY)
    if (!mq) return undefined
    const on = () => setWide(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

const TABS = [
  ['categories', 'Collections'],
  ['types', 'Cartes'],
  ['boosters', 'Boosters'],
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
  const wide = useWide()

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
    <AdminShell
      data={data} tab={tab} onTab={(id) => { setTab(id); setError(''); setNotice('') }} busy={busy} error={error} notice={notice}
      run={run} onChangePassword={changePassword} onClose={onClose} wide={wide}
    />
  )
}

// Coque de la console (sans connexion ni appels réseau : testable seule). wide : mise en page PC.
export function AdminShell({ data, tab, onTab, busy, error, notice, run, onChangePassword, onClose, wide = false }) {
  const fill = wide && (tab === 'types' || tab === 'categories' || tab === 'boosters')   // ces écrans gèrent eux-mêmes le défilement de leurs colonnes
  const count = { categories: data.categories.length, types: data.types.length, boosters: (data.booster_types ?? []).length }
  const players = `${fmt(data.players)} joueur${data.players > 1 ? 's' : ''} inscrit${data.players > 1 ? 's' : ''}.`
  return (
    <div className="legal-overlay" role="dialog" aria-modal="true" aria-label="Console admin">
      <div className={`legal-panel admin${wide ? ' wide' : ''}`}>
        <div className="admin-head">
          <h2>Console admin</h2>
          {wide && <span className="fine admin-players">{players}</span>}
          <button className="btn ghost" onClick={onClose}>Fermer</button>
        </div>
        {!wide && <p className="fine">{players}</p>}

        {wide ? (
          <nav className="admin-nav" role="tablist" aria-label="Sections" aria-orientation="vertical">
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={`admin-nav-item${tab === id ? ' on' : ''}`} onClick={() => onTab(id)}>
                {label}{count[id] != null && <span className="nav-count">{count[id]}</span>}
              </button>
            ))}
          </nav>
        ) : (
          <div className="chips admin-tabs" role="tablist" aria-label="Sections">
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={`chip ${tab === id ? 'on' : ''}`} onClick={() => onTab(id)}>{label}</button>
            ))}
          </div>
        )}

        <div className={`admin-main${fill ? ' fill' : ''}`}>
          {error && <p className="msg error" role="alert">{error}</p>}
          {notice && <p className="msg info" role="status">{notice}</p>}

          {tab === 'categories' && <CategoriesTab data={data} run={run} busy={busy} wide={wide} />}
          {tab === 'types' && <TypesTab data={data} run={run} busy={busy} wide={wide} />}
          {tab === 'boosters' && <BoostersTab data={data} run={run} busy={busy} wide={wide} />}
          {tab === 'config' && <ConfigTab data={data} run={run} busy={busy} />}
          {tab === 'rarities' && <RaritiesTab data={data} run={run} busy={busy} />}
          {tab === 'uniques' && <UniqueWinsTab data={data} />}
          {tab === 'legal' && <LegalTab data={data} run={run} busy={busy} />}
          {tab === 'security' && <SecurityTab busy={busy} onChange={onChangePassword} />}
        </div>
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

// ---------- Collections ----------
export function CategoriesTab({ data, run, busy, wide = false }) {
  if (wide) return <CategoriesWide data={data} run={run} busy={busy} />
  const nextPos = Math.max(0, ...data.categories.map((c) => c.position)) + 1
  return (
    <div className="admin-list">
      <p className="muted">
        Toutes les collections activées et pas terminées sont ouvertes EN MÊME TEMPS : le joueur choisit celle dans laquelle il ouvre ses boosters. Une collection se termine
        toute seule quand toutes ses cartes sont tirées ; désactive-en une pour la préparer sans l’ouvrir. Les raretés et leur nombre de séries ne se règlent plus par collection : elles se règlent par carte (onglet « Cartes »).
      </p>
      {data.categories.map((c) => (
        <CategoryForm key={c.id} cat={c} run={run} busy={busy} typeCount={data.types.filter((t) => t.category_id === c.id).length} />
      ))}
      <h3>Nouvelle collection</h3>
      <CategoryForm key={`new-${data.categories.length}`} cat={null} nextPos={nextPos} run={run} busy={busy} />
    </div>
  )
}

// Collections sur PC : à gauche la liste, à droite la fiche de la collection choisie
function CategoriesWide({ data, run, busy }) {
  const [sel, setSel] = useState(data.categories[0]?.id ?? 'new')
  const cat = typeof sel === 'number' ? data.categories.find((c) => c.id === sel) ?? null : null
  const nextPos = Math.max(0, ...data.categories.map((c) => c.position)) + 1
  return (
    <div className="admin-md cats-wide">
      <aside className="md-list" aria-label="Collections">
        <button type="button" className={`btn ${!cat ? '' : 'ghost'}`} onClick={() => setSel('new')}>+ Nouvelle collection</button>
        <ul className="md-items">
          {data.categories.map((c) => {
            const pct = c.total ? (c.taken / c.total) * 100 : 0
            return (
              <li key={c.id}>
                <button type="button" className={`md-item${c.id === sel ? ' on' : ''}`} aria-current={c.id === sel ? 'true' : undefined} onClick={() => setSel(c.id)}>
                  <i className="cat-dot" style={{ '--cat1': c.color, '--cat2': c.color2 }} />
                  <span className="md-item-text">
                    <strong>{c.name}</strong>
                    <small>n° {c.position} · {c.closed ? 'Terminée' : c.enabled ? 'Active' : 'Désactivée'} · {pct.toFixed(pct < 1 ? 2 : 0)} %</small>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <p className="fine">
          Toutes les collections activées et pas terminées sont ouvertes en même temps : le joueur choisit celle dans laquelle il ouvre ses boosters. Une collection se termine toute seule quand toutes ses cartes sont tirées.
          Les raretés et leur nombre de séries se règlent par carte (écran « Cartes »).
        </p>
      </aside>
      <section className="md-detail">
        {cat
          ? <CategoryForm key={cat.id} cat={cat} run={run} busy={busy} typeCount={data.types.filter((t) => t.category_id === cat.id).length} />
          : <CategoryForm key={`new-${data.categories.length}`} cat={null} nextPos={nextPos} run={run} busy={busy} />}
      </section>
    </div>
  )
}

// Préproduction uniquement : copie la collection (types, images, raretés) vers la production. La fonction serveur n'existe qu'en préproduction.
function CopyToProd({ cat, typeCount, run, busy }) {
  const [prodPw, setProdPw] = useState('')
  const [createMissing, setCreateMissing] = useState(false)
  const s = (n, one = '', many = 's') => (n > 1 ? many : one)
  const copy = () => {
    if (!window.confirm(`Copier « ${cat.name} » (${typeCount} carte${s(typeCount)}) vers la PRODUCTION ?`)) return
    run(
      (pw) => api.adminCopyCategoryToProd(pw, cat.id, prodPw, createMissing),
      (res) => {
        setProdPw('')
        const made = res.created_rarities?.length ? ` Raretés créées en production : ${res.created_rarities.join(', ')}.` : ''
        return `« ${res.name} » copiée en production : ${res.types} carte${s(res.types)}, ${res.rarities} réglage${s(res.rarities)} de raretés.${made} Elle y est désactivée : active-la dans la console de la production.`
      },
    )
  }
  return (
    <section className="copy-prod" aria-label="Copie vers la production">
      <h4>Copier vers la production</h4>
      <p className="fine">
        Crée dans la <strong>production</strong> une copie de cette collection : nom, couleurs, image du booster, ses {typeCount} type{s(typeCount)} (images, secret) et les
        raretés de chaque carte (séries, numérotées, style). Les cartes, les joueurs et les annonces ne sont pas copiés. La copie arrive <strong>désactivée</strong>, à la fin
        de la liste : tu l’actives ensuite dans la console de la production. Refusée si une collection du même nom y existe déjà.
      </p>
      <label>
        Mot de passe administrateur de la production
        <input type="password" autoComplete="off" value={prodPw} onChange={(e) => setProdPw(e.target.value)} />
      </label>
      <label className="check inline">
        <input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
        <span>Créer en production les raretés qui lui manquent (sinon la copie est refusée, avec la liste des raretés manquantes)</span>
      </label>
      <div className="row">
        <button type="button" className="btn" disabled={busy || !prodPw} onClick={copy}>Copier « {cat.name} » vers la production</button>
      </div>
    </section>
  )
}

function CategoryForm({ cat, nextPos, run, busy, typeCount = 0 }) {
  const [f, setF] = useState({
    name: cat?.name ?? '', position: cat?.position ?? nextPos ?? 1, series_count: cat?.series_count ?? 500,
    color: cat?.color ?? '#ffd9b0', color2: cat?.color2 ?? '#f29a45', text_color: cat?.text_color ?? '#3d1f00', enabled: cat?.enabled ?? true,
    image: cat?.image ?? '',
  })
  const set = (k) => (v) => setF((cur) => ({ ...cur, [k]: v }))
  const [confirmDelete, setConfirmDelete] = useState('')   // nom retapé pour confirmer la suppression forcée
  const started = (cat?.taken ?? 0) > 0
  const pct = cat && cat.total ? (cat.taken / cat.total) * 100 : 0
  return (
    <div className="admin-card" style={{ '--cat1': f.color, '--cat2': f.color2 }}>
      <div className="admin-card-head">
        <i className="cat-dot" />
        <strong>{cat ? cat.name : 'Nouvelle collection'}</strong>
        {cat && <span className={`badge ${cat.closed ? 'done' : ''}`}>{cat.closed ? 'Terminée' : cat.enabled ? 'Active' : 'Désactivée'}</span>}
      </div>
      {cat && <p className="fine">{fmt(cat.taken)} cartes tirées sur {fmt(cat.total)} ({pct.toFixed(pct < 1 ? 3 : 1)} %)</p>}
      <div className="cat-cols">
      <div className="cat-fields">
      <div className="admin-grid">
        <label>Nom<input value={f.name} maxLength={40} onChange={(e) => set('name')(e.target.value)} /></label>
        <label>Position<input type="number" value={f.position} onChange={(e) => set('position')(e.target.value)} /></label>
      </div>
      <div className="admin-colors">
        <Color label="Couleur claire" value={f.color} onChange={set('color')} />
        <Color label="Couleur soutenue" value={f.color2} onChange={set('color2')} />
        <Color label="Texte" value={f.text_color} onChange={set('text_color')} />
        <label className="check inline"><input type="checkbox" checked={f.enabled} onChange={(e) => set('enabled')(e.target.checked)} /><span>Activée</span></label>
      </div>
      </div>
      <div className="cat-side">
      <ImageField label="Image du booster (emoji ou adresse https://), au centre ; « 1/1 » si vide" value={f.image} onChange={set('image')} />
      <p className="fine">Aperçu du booster : le nom de la collection en haut, son image au centre.</p>
      <div className="admin-pack-preview"><Pack category={{ name: f.name || 'Collection', color: f.color, color2: f.color2, text_color: f.text_color, image: f.image }} /></div>
      </div>
      </div>

      <div className="row">
        <button className="btn" disabled={busy || !f.name.trim()} onClick={() => run((pw) => api.adminSaveCategory(pw, { id: cat?.id, ...f }), cat ? 'Collection enregistrée.' : 'Collection créée.')}>
          {cat ? 'Enregistrer' : 'Créer'}
        </button>
        {cat && (
          <button className="btn ghost" disabled={busy} onClick={() => run((pw) => api.adminSetCategoryClosed(pw, cat.id, !cat.closed), cat.closed ? 'Collection rouverte.' : 'Collection terminée : elle n’est plus ouverte aux joueurs.')}>
            {cat.closed ? 'Rouvrir' : 'Terminer maintenant'}
          </button>
        )}
        {cat && !started && (
          <button className="btn ghost danger" disabled={busy} onClick={() => window.confirm(`Supprimer « ${cat.name} » et ses cartes ?`) && run((pw) => api.adminDeleteCategory(pw, cat.id), 'Collection supprimée.')}>
            Supprimer
          </button>
        )}
      </div>

      {IS_PREPROD && cat && <CopyToProd cat={cat} typeCount={typeCount} run={run} busy={busy} />}

      {cat && started && (
        <div className="danger-zone">
          <p className="fine">
            Zone dangereuse : <strong>{cat.taken}</strong> carte{cat.taken > 1 ? 's' : ''} déjà tirée{cat.taken > 1 ? 's' : ''} dans cette
            collection. La supprimer retire aussi ces cartes aux joueurs qui les possèdent, ainsi que ses cartes, annonces, enchères (les
            enchérisseurs en tête sont remboursés), offres, notifications et favoris liés. Irréversible.
          </p>
          <label>
            Tape « {cat.name} » pour confirmer
            <input value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} placeholder={cat.name} />
          </label>
          <button
            className="btn ghost danger"
            disabled={busy || confirmDelete !== cat.name}
            onClick={() => run((pw) => api.adminForceDeleteCategory(pw, cat.id, confirmDelete), 'Collection et tout son contenu supprimés.')}
          >
            Supprimer la collection et tout son contenu
          </button>
        </div>
      )}
    </div>
  )
}

// ---------- Types ----------
export function TypesTab({ data, run, busy, initialCollapsed = [], wide = false, initialSelection = null }) {
  const [catId, setCatId] = useState(data.categories[0]?.id ?? null)
  const [collapsed, setCollapsed] = useState(() => new Set(initialCollapsed))   // types réduits (seul leur en-tête reste visible)
  const toggle = (id) => setCollapsed((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const types = data.types.filter((t) => t.category_id === catId)
  const nextPos = Math.max(0, ...types.map((t) => t.position)) + 1
  if (wide) return <TypesWide data={data} run={run} busy={busy} initialSelection={initialSelection} />
  if (!data.categories.length) return <p className="muted">Crée d’abord une collection.</p>
  return (
    <div className="admin-list">
      <label>
        Collection
        <select value={catId ?? ''} onChange={(e) => setCatId(Number(e.target.value))}>
          {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <p className="muted">
        L’image est un emoji, une adresse https:// ou une image téléversée (réduite à 256 px). Les raretés, le nombre de séries et les numéros visibles
        se règlent <strong>par carte</strong> (bloc « Raretés de cette carte » de chaque fiche). Attention aux droits des images que tu utilises.
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
      <h3>Nouvelle carte</h3>
      <TypeForm key={`new-${catId}-${types.length}`} type={null} categoryId={catId} nextPos={nextPos} run={run} busy={busy} />
      <h3>Importer des cartes</h3>
      <ImportPanel key={`import-${catId}-${types.length}`} categoryId={catId} types={types} data={data} run={run} busy={busy} />
    </div>
  )
}

// Champ image : emoji, adresse https:// ou image téléversée (réduite à 256 px)
function ImageField({ label, value, onChange, placeholder = '📼 ou https://…' }) {
  const [localError, setLocalError] = useState('')
  const uploaded = value.startsWith('data:')
  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLocalError('')
    try {
      onChange(await fileToDataUrl(file))
    } catch {
      setLocalError('Impossible de lire cette image.')
    }
  }
  return (
    <>
      <label>
        {label}
        {uploaded ? (
          <input value="Image téléversée" readOnly />
        ) : (
          <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        )}
      </label>
      <div className="row">
        <label className="btn ghost file-btn">
          Téléverser une image
          <input type="file" accept="image/*" onChange={onFile} hidden />
        </label>
        {value && <button type="button" className="btn ghost" onClick={() => onChange('')}>Retirer l’image</button>}
      </div>
      {localError && <p className="msg error">{localError}</p>}
    </>
  )
}

function TypeForm({ type, categoryId, nextPos, data, run, busy, collapsed = false, onToggle }) {
  const [f, setF] = useState({ name: type?.name ?? '', position: type?.position ?? nextPos ?? 1, image: type?.image ?? '' })
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
        <strong>{type ? type.name : 'Nouvelle carte'}</strong>
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
      <ImageField label="Image (emoji ou adresse https://)" value={f.image} onChange={(v) => setF((cur) => ({ ...cur, image: v }))} />
      <div className="row">
        <button className="btn" disabled={busy || !f.name.trim()} onClick={() => run((pw) => api.adminSaveType(pw, { id: type?.id, category_id: categoryId, ...f }), type ? 'Carte enregistrée.' : 'Carte créée.')}>
          {type ? 'Enregistrer' : 'Créer'}
        </button>
        {type && type.taken === 0 && (
          <button className="btn ghost danger" disabled={busy} onClick={() => window.confirm(`Supprimer « ${type.name} » ?`) && run((pw) => api.adminDeleteType(pw, type.id), 'Carte supprimée.')}>
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

// ---------- Raretés d'un type : état partagé par l'éditeur étroit (mobile) et l'éditeur large (PC) ----------
// CHAQUE rareté a ses propres séries, de 1/1 à N/N ; 0 série = la rareté n'existe pas pour cette carte ; numéros visibles ; style de carte ;
// type secret. type peut être null (type en cours de création : categoryId donne alors la collection).
function useRarityEditor(type, data, categoryId) {
  const rarityList = data.rarities.filter((r) => r.kind === 'range').sort((a, b) => a.sort_order - b.sort_order)
  const nameOf = (id) => data.rarities.find((r) => r.id === id)?.name ?? id
  const category = data.categories.find((c) => c.id === (type?.category_id ?? categoryId))
  const own = type ? (data.type_rarities ?? []).filter((r) => r.type_id === type.id) : []
  // Une ligne par rareté (dans l'ordre d'affichage) : celles que le type n'a pas valent 0 série
  const allRows = (existing) => rarityList.map((r) => {
    const o = existing.find((x) => x.rarity_id === r.id)
    return { rarity_id: r.id, max_series: String(o?.max_series ?? 0), numbered_series: String(o?.numbered_series ?? 0), card_style: o?.card_style ?? 'simple' }
  })
  const [custom, setCustom] = useState(own.length > 0)
  const [rows, setRows] = useState(() => allRows(own))
  const [secret, setSecret] = useState(!!type?.secret)
  const defaults = defaultConfig(rarityList, category)

  const customize = () => {
    setRows(allRows(defaults.map((d) => ({ rarity_id: d.rarity_id, max_series: d.max_series, numbered_series: d.max_series, card_style: 'simple' }))))
    setCustom(true)
  }
  const resetToDefaults = () => { setCustom(false); setRows(allRows([])) }
  const setRow = (i, k, v) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const problem = custom ? validateTypeRarities(rows) : ''
  const toNum = (r) => ({ rarity_id: r.rarity_id, max_series: Number(r.max_series), numbered_series: Number(r.numbered_series || 0), card_style: r.card_style || 'simple' })
  const payload = rows.filter((r) => Number(r.max_series) >= 1).map(toNum)
  const shown = custom ? (problem ? [] : rows.map(toNum)) : defaults
  const describe = (r) => {
    const smax = r.max_series
    if (smax < 1) return 'absente de cette carte (0 série)'
    const k = Math.min(r.numbered_series, smax)
    const cards = `cartes de 1/1 à ${fmt(smax)}/${fmt(smax)} (${fmt(cardCount(smax))} cartes)`
    const fa = r.card_style === 'fullart' ? ' — style FullArt' : ''
    if (k >= smax) return `${cards} — tous les numéros visibles${fa}`
    if (k <= 0) return `${cards} — non numérotée (numéro jamais visible)${fa}`
    return `${cards} — numéro visible de 1/1 à ${fmt(k)}/${fmt(k)} (séries 1 à ${fmt(k)}), masqué ensuite${fa}`
  }
  // Aperçu des deux styles avec l'image du type, dans la première rareté qui a des séries
  const sampleRarity = data.rarities.find((x) => x.id === (shown.find((b) => b.max_series >= 1)?.rarity_id ?? 'ultra')) ?? rarityList[0]
  // Ce qu'il faut envoyer au serveur : réglages propres, [] pour revenir aux défauts (si le type en avait), null = ne rien changer
  const toSend = custom ? payload : own.length ? [] : null
  return { rarityList, nameOf, own, custom, rows, secret, setSecret, defaults, customize, resetToDefaults, setRow, problem, payload, shown, describe, sampleRarity, toSend }
}

// Éditeur étroit (mobile) : sous la fiche de chaque type
function TypeRaritiesEditor({ type, data, run, busy }) {
  const ed = useRarityEditor(type, data)
  const { custom, rows, secret, setSecret, setRow, problem, shown, describe, sampleRarity, nameOf } = ed
  const save = () => run((pw) => api.adminSaveTypeRarities(pw, type.id, ed.toSend, secret), 'Raretés de la carte enregistrées.')

  return (
    <details className="type-rarities">
      <summary>
        Raretés de cette carte
        <span className="muted"> — {custom ? 'propres à cette carte' : 'réglages par défaut (onglet Raretés)'}</span>
      </summary>
      <label className="check inline">
        <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
        <span>Carte secrète : apparaît dans l’album comme une carte mystère tant qu’aucune carte n’est possédée, numéroté au-delà de la checklist (ex. 4/3)</span>
      </label>

      {custom && (
        <>
          <p className="fine">
            Chaque rareté a ses propres séries, de 1/1 à N/N (N = « séries max. »). Exemple : Ultra Rare, 50 séries, 5 numérotées → cartes de 1/1 à
            50/50, et seules les séries 1 à 5 (1/1 à 5/5) ont leur numéro visible ; les autres sont numérotées en interne mais le numéro est masqué sur
            la carte. 0 série numérotée = rareté non numérotée. <strong>0 série max. = la rareté n’existe pas pour cette carte</strong> (une carte peut n’exister
            que dans une seule rareté). Les raretés sont indépendantes : une même série peut exister dans plusieurs raretés (ce sont des cartes différentes).
            <strong> Style de carte</strong> : Simple (image dans un cadre) ou FullArt (l’image couvre toute la carte), au choix pour chaque rareté.
          </p>
          <div className="type-rarity-rows">
            {rows.map((r, i) => (
              <div className="type-rarity-row" key={r.rarity_id}>
                <strong className="type-rarity-name">{nameOf(r.rarity_id)}</strong>
                <label>Séries max.<input type="number" min="0" max="5000" value={r.max_series} onChange={(e) => setRow(i, 'max_series', e.target.value)} /></label>
                <label>Séries numérotées<input type="number" min="0" value={r.numbered_series} onChange={(e) => setRow(i, 'numbered_series', e.target.value)} /></label>
                <label>Style de carte
                  <select value={r.card_style} onChange={(e) => setRow(i, 'card_style', e.target.value)}>
                    {CARD_STYLES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              </div>
            ))}
          </div>
          <div className="row">
            <button type="button" className="btn ghost" onClick={ed.resetToDefaults}>Revenir aux réglages par défaut</button>
          </div>
          {problem && <p className="msg error">{problem}</p>}
        </>
      )}

      {!custom && <p className="fine">Cette carte utilise les réglages par défaut de l’onglet « Raretés » (numéros toujours visibles). Réglages actuels :</p>}
      {shown.length > 0 && (
        <ul className="type-rarity-bands">
          {shown.map((b) => (
            <li key={b.rarity_id}>
              <strong>{nameOf(b.rarity_id)}</strong> : {describe(b)}
            </li>
          ))}
        </ul>
      )}
      {!custom && <div className="row"><button type="button" className="btn ghost" onClick={ed.customize}>Personnaliser les raretés de cette carte</button></div>}
      {!custom && <p className="fine">Style de carte : Simple pour toutes les raretés. Personnalise les raretés pour choisir FullArt rareté par rareté.</p>}
      {sampleRarity && (
        <div className="style-previews" aria-label="Aperçu des deux styles de carte">
          {CARD_STYLES.map((s) => (
            <figure key={s.id}>
              <Card typeId={type.id} type={type} styleName={s.id} rarity={sampleRarity} series={50} number={3} size="md" />
              <figcaption>{s.name}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {type.taken > 0 && custom && <p className="fine">Des exemplaires de cette carte ont déjà été tirés : retirer une rareté (0 série) ou réduire ses séries sous une carte existante est refusé.</p>}

      <div className="row">
        <button className="btn" disabled={busy || !!problem} onClick={save}>Enregistrer les raretés</button>
      </div>
    </details>
  )
}

// ---------- Vue PC : les raretés d'un type en tableau (une ligne par rareté) avec l'aperçu des deux styles ----------
function RaritiesTable({ ed, previewType }) {
  const { custom, rows, defaults, nameOf, problem } = ed
  const [focusId, setFocusId] = useState(null)
  const lines = custom
    ? rows.map((r, i) => ({ i, id: r.rarity_id, max: Number(r.max_series) || 0, num: Number(r.numbered_series) || 0, style: r.card_style, raw: r }))
    : ed.rarityList.map((rr) => {
        const d = defaults.find((x) => x.rarity_id === rr.id)
        return { i: -1, id: rr.id, max: d?.max_series ?? 0, num: d?.max_series ?? 0, style: 'simple', raw: null }
      })
  const rarityObj = (id) => ed.rarityList.find((x) => x.id === id)
  const firstPresent = lines.find((l) => l.max >= 1)
  const focus = lines.find((l) => l.id === focusId && l.max >= 1) ?? firstPresent
  const visible = (l) => (l.max < 1 ? '—' : l.num >= l.max ? 'tous' : l.num <= 0 ? 'aucun' : `1/1 → ${fmt(l.num)}/${fmt(l.num)}`)
  return (
    <div className="rar-body">
      <table className="rar-table">
        <thead>
          <tr><th>Rareté</th><th>Séries</th><th>Numérotées</th><th>Style</th><th>Cartes</th><th>N° visibles</th></tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const r = rarityObj(l.id)
            return (
              <tr key={l.id} className={`${l.max < 1 ? 'absent' : ''}${focus?.id === l.id ? ' focus' : ''}`} onClick={() => setFocusId(l.id)}>
                <th scope="row">
                  <i className="rar-dot" style={{ background: `linear-gradient(135deg, ${r?.color}, ${r?.color2})` }} />
                  {nameOf(l.id)}
                </th>
                <td>
                  {custom
                    ? <input type="number" min="0" max="5000" value={l.raw.max_series} aria-label={`Séries max. ${nameOf(l.id)}`} onFocus={() => setFocusId(l.id)} onChange={(e) => ed.setRow(l.i, 'max_series', e.target.value)} />
                    : <span>{l.max >= 1 ? fmt(l.max) : '—'}</span>}
                </td>
                <td>
                  {custom
                    ? <input type="number" min="0" value={l.raw.numbered_series} aria-label={`Séries numérotées ${nameOf(l.id)}`} onFocus={() => setFocusId(l.id)} onChange={(e) => ed.setRow(l.i, 'numbered_series', e.target.value)} />
                    : <span>{l.max >= 1 ? fmt(l.num) : '—'}</span>}
                </td>
                <td>
                  {custom
                    ? (
                      <select value={l.raw.card_style} aria-label={`Style de carte ${nameOf(l.id)}`} onFocus={() => setFocusId(l.id)} onChange={(e) => ed.setRow(l.i, 'card_style', e.target.value)}>
                        {CARD_STYLES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    )
                    : <span>Simple</span>}
                </td>
                <td className="num">{l.max >= 1 ? fmt(cardCount(l.max)) : '—'}</td>
                <td>{visible(l)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {problem && <p className="msg error rar-problem">{problem}</p>}
      {focus && (
        <aside className="rar-preview" aria-label="Aperçu des deux styles de carte">
          <p className="fine">Aperçu : {nameOf(focus.id)}</p>
          <div className="style-previews">
            {CARD_STYLES.map((s) => (
              <figure key={s.id} className={focus.style === s.id ? 'current' : ''}>
                <Card typeId={previewType.id} type={previewType} styleName={s.id} rarity={rarityObj(focus.id)} series={50} number={3} size="md" />
                <figcaption>{s.name}{focus.style === s.id ? ' ✓' : ''}</figcaption>
              </figure>
            ))}
          </div>
        </aside>
      )}
    </div>
  )
}

// Appliquer les raretés de cette carte à d'autres types de la collection (réglage identique pour beaucoup de types)
function CopyRarities({ ed, others, run, busy }) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(() => new Set())
  const toggle = (id) => setPicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n })
  if (!others.length) return null
  const targets = others.filter((t) => picked.has(t.id))
  const apply = () =>
    run(
      async (pw) => {
        const failed = []
        let done = 0
        for (const t of targets) {
          try { await api.adminSaveTypeRarities(pw, t.id, ed.custom ? ed.payload : [], null); done += 1 }
          catch (e) { failed.push(`${t.name} (${explain(e)})`) }
        }
        return { done, failed }
      },
      (res) => `Raretés appliquées à ${res.done} carte${res.done > 1 ? 's' : ''}${res.failed.length ? `. Refusé pour : ${res.failed.join(' ; ')}` : '.'}`,
    )
  return (
    <details className="rar-copy" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Appliquer ces raretés à d’autres cartes…</summary>
      <p className="fine">
        Copie {ed.custom ? 'les raretés ci-dessus (séries, numérotées, style)' : 'le retour aux réglages par défaut'} vers les cartes cochées. Le statut « secret » n’est pas copié.
        Une carte dont des exemplaires ne rentreraient plus dans ces réglages est refusée (les autres sont traitées).
      </p>
      <div className="rar-copy-list">
        {others.map((t) => (
          <label key={t.id} className="check inline"><input type="checkbox" checked={picked.has(t.id)} onChange={() => toggle(t.id)} /><span>{t.name}</span></label>
        ))}
      </div>
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => setPicked(new Set(others.map((t) => t.id)))}>Tout cocher</button>
        <button type="button" className="btn ghost" onClick={() => setPicked(new Set())}>Tout décocher</button>
        <button type="button" className="btn" disabled={busy || targets.length === 0 || !!ed.problem} onClick={apply}>Appliquer à {targets.length} carte{targets.length > 1 ? 's' : ''}</button>
      </div>
    </details>
  )
}

// Éditeur de type pour PC : le détail du type en haut, ses raretés dessous, un seul bouton « Enregistrer la carte »
function TypeEditorWide({ type, categoryId, nextPos, data, run, busy, others, onSaved }) {
  const [f, setF] = useState({ name: type?.name ?? '', position: type?.position ?? nextPos ?? 1, image: type?.image ?? '' })
  const ed = useRarityEditor(type, data, categoryId)
  const previewType = { id: type?.id ?? 0, name: f.name || 'Nouvelle carte', image: f.image }
  const valid = f.name.trim() && !ed.problem
  const save = () =>
    run(async (pw) => {
      const res = await api.adminSaveType(pw, { id: type?.id, category_id: categoryId, ...f })
      const id = type?.id ?? res?.id
      // Raretés et statut secret : seulement s'il y a quelque chose à envoyer (réglages propres, retour aux défauts, secret)
      if (id && (ed.toSend !== null || ed.secret !== !!type?.secret)) await api.adminSaveTypeRarities(pw, id, ed.toSend, ed.secret)
      onSaved?.(id)
      return res
    }, type ? 'Carte enregistrée.' : 'Carte créée.')
  return (
    <div className="ted">
      <section className="ted-card ted-detail" aria-label="Détail de la carte">
        <header className="ted-head">
          <span className="admin-type-art big"><TypeArt type={{ image: f.image }} /></span>
          <div className="ted-title">
            <h3>{type ? type.name : 'Nouvelle carte'}</h3>
            <p className="fine">
              {type && type.taken > 0 && <span className="badge">{fmt(type.taken)} tirées</span>}
              {type?.series_count && <span className="badge">{fmt(type.series_count)} séries</span>}
              {ed.secret && <span className="badge">secret</span>}
            </p>
          </div>
          <div className="ted-actions">
            <button className="btn" disabled={busy || !valid} onClick={save}>{type ? 'Enregistrer la carte' : 'Créer la carte'}</button>
            {type && type.taken === 0 && (
              <button className="btn ghost danger" disabled={busy} onClick={() => window.confirm(`Supprimer « ${type.name} » ?`) && run((pw) => api.adminDeleteType(pw, type.id), 'Carte supprimée.')}>
                Supprimer
              </button>
            )}
          </div>
        </header>
        <div className="ted-fields">
          <label>Nom<input value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label>Position<input type="number" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} /></label>
          <label className="check inline ted-secret">
            <input type="checkbox" checked={ed.secret} onChange={(e) => ed.setSecret(e.target.checked)} />
            <span>Carte secrète : carte mystère dans l’album tant qu’aucune carte n’est possédée (numéro au-delà de la checklist, ex. 4/3)</span>
          </label>
          <div className="ted-image"><ImageField label="Image (emoji ou adresse https://)" value={f.image} onChange={(v) => setF((cur) => ({ ...cur, image: v }))} /></div>
        </div>
      </section>

      <section className="ted-card ted-rarities" aria-label="Raretés de la carte">
        <header className="rar-head">
          <h3>Raretés</h3>
          <span className="muted">{ed.custom ? 'propres à cette carte' : 'réglages par défaut (onglet Raretés)'}</span>
          <div className="ted-actions">
            {ed.custom
              ? <button type="button" className="btn ghost" onClick={ed.resetToDefaults}>Revenir aux réglages par défaut</button>
              : <button type="button" className="btn ghost" onClick={ed.customize}>Personnaliser les raretés de cette carte</button>}
          </div>
        </header>
        <p className="fine">
          Chaque rareté a ses propres séries (1/1 à N/N). <strong>0 série = la rareté n’existe pas pour cette carte.</strong> « Numérotées » = les premières séries au numéro visible.
          {type?.taken > 0 && ed.custom ? ' Des cartes ont déjà été tirées : retirer une rareté ou réduire ses séries sous une carte existante est refusé.' : ''}
          {!ed.custom && ' Réglages par défaut : personnalise-les pour choisir les raretés et le style (FullArt…).'}
        </p>
        <RaritiesTable ed={ed} previewType={previewType} />
        <CopyRarities ed={ed} others={others} run={run} busy={busy} />
      </section>
    </div>
  )
}

// Types sur PC : à gauche la liste de tous les types, à droite le détail du type en haut et ses raretés dessous
function TypesWide({ data, run, busy, initialSelection = null }) {
  const [catId, setCatId] = useState(data.types.find((t) => t.id === initialSelection)?.category_id ?? data.categories[0]?.id ?? null)
  const [sel, setSel] = useState(initialSelection)   // identifiant d'un type, 'new' ou 'import'
  const [query, setQuery] = useState('')
  const types = data.types.filter((t) => t.category_id === catId).slice().sort((a, b) => a.position - b.position || a.id - b.id)
  const q = query.trim().toLowerCase()
  const shown = q ? types.filter((t) => t.name.toLowerCase().includes(q)) : types
  const type = typeof sel === 'number' ? types.find((t) => t.id === sel) ?? null : null
  const nextPos = Math.max(0, ...types.map((t) => t.position)) + 1
  const pickCat = (id) => { setCatId(id); setSel(null); setQuery('') }
  if (!data.categories.length) return <p className="muted">Crée d’abord une collection.</p>
  const mode = sel === 'new' ? 'new' : sel === 'import' ? 'import' : type ? 'edit' : 'none'
  return (
    <div className="admin-md types-wide">
      <aside className="md-list" aria-label="Types">
        <label>
          Collection
          <select value={catId ?? ''} onChange={(e) => pickCat(Number(e.target.value))}>
            {data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <input type="search" className="md-search" placeholder={`Rechercher parmi ${types.length} carte${types.length > 1 ? 's' : ''}…`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher un type" />
        <div className="row nowrap">
          <button type="button" className={`btn ${mode === 'new' ? '' : 'ghost'}`} onClick={() => setSel('new')}>+ Nouveau</button>
          <button type="button" className={`btn ${mode === 'import' ? '' : 'ghost'}`} onClick={() => setSel('import')}>Importer</button>
        </div>
        <ul className="md-items">
          {shown.map((t) => (
            <li key={t.id}>
              <button type="button" className={`md-item${t.id === sel ? ' on' : ''}`} aria-current={t.id === sel ? 'true' : undefined} onClick={() => setSel(t.id)}>
                <span className="admin-type-art"><TypeArt type={{ image: t.image }} /></span>
                <span className="md-item-text">
                  <strong>{t.name}</strong>
                  <small>n° {t.position}{t.secret ? ' · secret' : ''}{t.taken > 0 ? ` · ${fmt(t.taken)} tirées` : ''}</small>
                </span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="muted md-empty">{types.length ? 'Aucune carte ne correspond.' : 'Aucune carte dans cette collection.'}</li>}
        </ul>
      </aside>
      <section className="md-detail">
        {mode === 'new' && <TypeEditorWide key={`new-${catId}-${types.length}`} type={null} categoryId={catId} nextPos={nextPos} data={data} run={run} busy={busy} others={[]} onSaved={(id) => id && setSel(id)} />}
        {mode === 'edit' && (
          <TypeEditorWide
            key={`${type.id}-${type.series_count}-${type.secret}-${(data.type_rarities ?? []).filter((r) => r.type_id === type.id).map((r) => `${r.rarity_id}${r.max_series}${r.numbered_series}${r.card_style}`).join('')}`}
            type={type} categoryId={catId} data={data} run={run} busy={busy} others={types.filter((t) => t.id !== type.id)} />
        )}
        {mode === 'import' && <ImportPanel key={`import-${catId}-${types.length}`} categoryId={catId} types={types} data={data} run={run} busy={busy} />}
        {mode === 'none' && <p className="muted md-empty">Choisis une carte dans la liste, crée-en une nouvelle, ou importe-en plusieurs d’un coup (fichier CSV et photos).</p>}
      </section>
    </div>
  )
}

// ---------- Import en masse : fichier de types (nom, position, image, secret, raretés) et/ou photos ----------
function ImportPanel({ categoryId, types, data, run, busy }) {
  const rarityList = data.rarities.filter((r) => r.kind === 'range').sort((a, b) => a.sort_order - b.sort_order)
  const [parsed, setParsed] = useState(null)
  const [fileName, setFileName] = useState('')
  const [readError, setReadError] = useState('')
  const [photos, setPhotos] = useState([])        // [{name, url, error}] : photos déjà réduites (256 px)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [createMissing, setCreateMissing] = useState(false)

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setReadError('')
    try {
      setParsed(parseTypesFile(await file.text(), types.map((t) => t.name), rarityList))
      setFileName(file.name)
    } catch {
      setParsed(null)
      setReadError('Impossible de lire ce fichier.')
    }
  }
  const onPhotos = async (e) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    if (!files.length) return
    setPhotoBusy(true)
    const out = []
    for (const f of files.slice(0, 300)) {
      try { out.push({ name: f.name, url: await fileToDataUrl(f) }) } catch { out.push({ name: f.name, url: '', error: 'image illisible' }) }
    }
    setPhotos((cur) => [...cur, ...out])
    setPhotoBusy(false)
  }
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([makeTemplate(rarityList)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'modele-types.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const rows = parsed?.rows ?? []
  const okPhotos = photos.filter((p) => !p.error)
  const matches = matchPhotos(okPhotos, rows, types)
  const photoByLine = new Map()
  const updates = []                              // photos de types déjà présents : leur photo est mise à jour
  const orphans = []                              // photos qui ne correspondent à aucun type
  const dupPhotos = []
  matches.forEach((m, i) => {
    if (m.duplicate) dupPhotos.push(okPhotos[i])
    else if (m.target?.kind === 'row') photoByLine.set(m.target.line, okPhotos[i].url)
    else if (m.target?.kind === 'existing') updates.push({ type: types.find((t) => t.id === m.target.id), url: okPhotos[i].url, file: okPhotos[i].name })
    else orphans.push(okPhotos[i])
  })
  // Option : un type par photo sans correspondance (nom = nom du fichier)
  const known = new Set([...rows.map((r) => photoKey(r.name)), ...types.map((t) => photoKey(t.name))])
  const created = []
  if (createMissing) {
    for (const p of orphans) {
      const key = photoKey(p.name)
      if (!key || known.has(key)) continue
      known.add(key)
      const nice = p.name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()
      created.push({ line: `photo:${p.name}`, name: nice.charAt(0).toUpperCase() + nice.slice(1), position: null, image: p.url, kind: 'photo', secret: false, rarities: null, error: '', duplicate: false, fromPhoto: true })
    }
  }
  const allRows = [...rows, ...created]
  const errors = rows.filter((r) => r.error)
  const dupes = rows.filter((r) => r.duplicate)
  const toCreate = allRows.filter((r) => !r.error && !r.duplicate)
  const nothing = toCreate.length === 0 && updates.length === 0
  const loaded = allRows.length > 0 || photos.length > 0
  const canImport = (allRows.length > 0 || updates.length > 0)
  const doImport = () =>
    run(
      async (pw) => {
        let made = 0
        let skipped = 0
        if (toCreate.length) {
          const res = await api.adminImportTypes(pw, categoryId, toCreate.map((r) => ({
            name: r.name, position: r.position, image: photoByLine.get(r.line) ?? r.image, secret: r.secret, ...(r.rarities ? { rarities: r.rarities } : {}),
          })))
          made = res.created
          skipped = res.skipped
        }
        let updated = 0
        for (const u of updates) {
          await api.adminSaveType(pw, { id: u.type.id, category_id: categoryId, name: u.type.name, position: u.type.position, image: u.url })
          updated += 1
        }
        return { made, skipped, updated }
      },
      (res) => [
        `${res.made} carte${res.made > 1 ? 's' : ''} importée${res.made > 1 ? 's' : ''}`,
        res.skipped ? `${res.skipped} ignoré${res.skipped > 1 ? 's' : ''} (déjà présent${res.skipped > 1 ? 's' : ''})` : '',
        res.updated ? `${res.updated} photo${res.updated > 1 ? 's' : ''} mise${res.updated > 1 ? 's' : ''} à jour` : '',
      ].filter(Boolean).join(', ') + '.',
    )

  return (
    <div className="import-panel">
      <header className="ted-head">
        <h3>Importer des cartes</h3>
        {canImport && (
          <div className="ted-actions">
            <button className="btn" disabled={busy || photoBusy || errors.length > 0 || nothing} onClick={doImport}>
              {nothing && !errors.length ? 'Rien de nouveau à importer' : `Importer ${toCreate.length} carte${toCreate.length > 1 ? 's' : ''}${updates.length ? ` et mettre à jour ${updates.length} photo${updates.length > 1 ? 's' : ''}` : ''}`}
            </button>
            <button type="button" className="btn ghost" onClick={() => { setParsed(null); setPhotos([]); setFileName(''); setCreateMissing(false) }}>Annuler</button>
          </div>
        )}
      </header>
      <details className="import-help" open={!loaded}>
        <summary>Format du fichier de cartes et des photos</summary>
        <p className="muted">
          <strong>1. Fichier de cartes</strong> (CSV ou texte, une ligne par carte) : <strong>nom ; position ; image ; secret ; raretés</strong>. Seul le nom est obligatoire. Image : un emoji ou une
          adresse https://. Secret : oui / non. Raretés : <code>Ultra Rare:50:5:fullart|Super Rare:100:1|Commune:500:0</code> (rareté : séries : numérotées : style, séparées par « | ;
          séries à 0 = la rareté n’existe pas pour cette carte ; numérotées et style facultatifs). {MAX_ROWS} cartes maximum, tout ou rien : une ligne invalide annule l’import. Un nom déjà présent dans
          la collection est ignoré.
        </p>
        <p className="muted">
          <strong>2. Photos</strong> (plusieurs fichiers image d’un coup, facultatif) : chaque photo est rapprochée d’une carte par <strong>le nom du fichier</strong> (« chat-va.png » → carte « Chat va »,
          accents et majuscules ignorés). Elle remplace l’image du fichier de cartes, ou met à jour la photo d’une carte déjà présente. Les photos sont réduites à 256 px.
        </p>
      </details>
      <div className="row">
        <label className="btn ghost file-btn">
          1. Choisir le fichier de cartes
          <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={onFile} hidden />
        </label>
        <button type="button" className="btn ghost" onClick={downloadTemplate}>Télécharger un modèle complet</button>
        <label className="btn ghost file-btn">
          2. Ajouter des photos
          <input type="file" accept="image/*" multiple onChange={onPhotos} hidden />
        </label>
        {photos.length > 0 && <button type="button" className="btn ghost" onClick={() => setPhotos([])}>Retirer les {photos.length} photos</button>}
      </div>
      {readError && <p className="msg error">{readError}</p>}
      {parsed?.fileError && <p className="msg error">{parsed.fileError}</p>}
      {photoBusy && <p className="muted">Lecture des photos…</p>}

      {photos.length > 0 && (
        <div className="import-photos">
          <p>
            <strong>{photos.length} photo{photos.length > 1 ? 's' : ''}</strong> : {photoByLine.size} rapprochée{photoByLine.size > 1 ? 's' : ''} d’une ligne du fichier, {updates.length} pour une carte déjà présente,
            {' '}{orphans.length} sans correspondance{dupPhotos.length ? `, ${dupPhotos.length} en double` : ''}{photos.length > okPhotos.length ? `, ${photos.length - okPhotos.length} illisible${photos.length - okPhotos.length > 1 ? 's' : ''}` : ''}.
          </p>
          {orphans.length > 0 && (
            <label className="check inline">
              <input type="checkbox" checked={createMissing} onChange={(e) => setCreateMissing(e.target.checked)} />
              <span>Créer une carte pour chaque photo sans correspondance ({orphans.length}) : {orphans.slice(0, 4).map((p) => p.name).join(', ')}{orphans.length > 4 ? '…' : ''}</span>
            </label>
          )}
          {updates.length > 0 && <p className="fine">Photos mises à jour : {updates.map((u) => u.type.name).join(', ')}.</p>}
        </div>
      )}

      {allRows.length > 0 && (
        <>
          <p>
            <strong>{fileName || 'Photos'}</strong> : {allRows.length} ligne{allRows.length > 1 ? 's' : ''} — {toCreate.length} à créer
            {dupes.length ? `, ${dupes.length} déjà présente${dupes.length > 1 ? 's' : ''} (ignorée${dupes.length > 1 ? 's' : ''})` : ''}
            {errors.length ? `, ${errors.length} en erreur` : ''}.
          </p>
          {errors.length > 0 && (
            <div className="msg error" role="alert">
              <p>Corrige les lignes en erreur dans ton fichier puis recharge-le : l’import est bloqué tant qu’il en reste.</p>
              <ul className="import-errors">
                {errors.slice(0, 5).map((r) => <li key={r.line}>Ligne {r.line}{r.name ? ` (${r.name})` : ''} : {r.error}</li>)}
                {errors.length > 5 && <li>… et {errors.length - 5} autre{errors.length - 5 > 1 ? 's' : ''}.</li>}
              </ul>
            </div>
          )}
          <div className="import-scroll">
            <table className="import-table">
              <thead><tr><th>Image</th><th>Nom</th><th>Position</th><th>Secret</th><th>Raretés</th><th>État</th></tr></thead>
              <tbody>
                {allRows.map((r) => {
                  const pic = photoByLine.get(r.line)
                  return (
                    <tr key={r.line} className={r.error ? 'bad' : r.duplicate ? 'skip' : ''}>
                      <td><div className="import-img"><span className="admin-type-art">{r.kind === 'invalid' ? '⚠️' : <TypeArt type={{ image: pic ?? r.image }} />}</span>{pic && <span className="badge">photo</span>}</div></td>
                      <td className="import-name">{r.name || '(sans nom)'}</td>
                      <td>{r.position ?? 'auto'}</td>
                      <td>{r.secret ? 'oui' : ''}</td>
                      <td className="fine">{r.rarities ? describeRarities(r.rarities, rarityList) : 'réglages par défaut'}</td>
                      <td className="fine">{r.error ? `ligne ${r.line} : ${r.error}` : r.duplicate ? 'déjà présent, ignoré' : r.fromPhoto ? 'créé depuis la photo' : 'à créer'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ---------- Réglages ----------
export function ConfigTab({ data, run, busy }) {
  return (
    <div className="admin-list cols-2">
      <p className="muted">Réglages du jeu et de la boutique. Les modifications s’appliquent tout de suite.</p>
      {(data.text_config ?? []).map((row) => <TextConfigRow key={row.key} row={row} run={run} busy={busy} />)}
      {data.config.filter((row) => row.key !== 'card_reward_booster').map((row) => <ConfigRow key={row.key} row={row} run={run} busy={busy} />)}
    </div>
  )
}

// Réglage texte (ex. nom de l'abonnement) : 1 à 60 caractères
function TextConfigRow({ row, run, busy }) {
  const [v, setV] = useState(row.value)
  const changed = v.trim() !== row.value
  return (
    <div className="admin-card slim">
      <div>
        <strong className="config-key">{row.key}</strong>
        <p className="fine">{row.description}</p>
      </div>
      <div className="row nowrap">
        <input type="text" value={v} maxLength={60} onChange={(e) => setV(e.target.value)} aria-label={row.description || row.key} />
        <button className="btn" disabled={busy || !changed || v.trim() === ''} onClick={() => run((pw) => api.adminSetTextConfig(pw, row.key, v.trim()), 'Réglage enregistré.')}>OK</button>
      </div>
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
// ---------- Boosters paramétrables : liste, éditeur carte par carte, dons ----------
function BoosterListItem({ b, on, onClick }) {
  const sale = b.is_standard ? 'Standard : se recharge tout seul' : b.role ? roleLabel(b.role) : b.price_coins != null ? `${fmt(b.price_coins)} pièce${b.price_coins > 1 ? 's' : ''}` : 'hors vente'
  return (
    <button type="button" className={`md-item${on ? ' on' : ''}`} aria-current={on ? 'true' : undefined} onClick={onClick}>
      <i className="cat-dot" style={{ '--cat1': b.color, '--cat2': b.color }} />
      <span className="md-item-text">
        <strong>{b.name}</strong>
        <small>n° {b.position} · {b.cards} carte{b.cards > 1 ? 's' : ''} · {sale}{!b.enabled ? ' · désactivé' : ''}{b.holders > 0 ? ` · ${fmt(b.holders)} en stock` : ''}</small>
      </span>
    </button>
  )
}

export function BoosterEditor({ booster, rarities, run, busy, onCreated, onDeleted, onDuplicate }) {
  const isNew = !booster?.id
  const std = !!booster?.is_standard
  const names = { ...Object.fromEntries(rarities.map((r) => [r.id, r.name])), [NUMBERED.id]: NUMBERED.name }
  const kinds = Object.fromEntries(rarities.map((r) => [r.id, r.kind]))
  const [f, setF] = useState(() => ({
    role: booster?.role ?? '',
    glow: glowOf(booster?.glow),
    name: booster?.name ?? '', cards: booster?.cards ?? 5, color: booster?.color ?? '#e8452e',
    price: booster?.price_coins == null ? '' : String(booster.price_coins), enabled: booster?.enabled ?? true,
    position: booster?.position == null ? '' : String(booster.position),   // ordre d'affichage sur la page Boosters (vide = à la suite)
  }))
  const [pos, setPos] = useState(() => (booster?.slots ? slotsToPositions(booster.slots, booster.cards) : defaultPositions(rarities, booster?.cards ?? 5)))
  const [grant, setGrant] = useState({ qty: '1', who: '' })
  const choices = pickableRarities(rarities, f.role)
  const noSale = std || f.role === 'subscriber' || f.role === 'card_reward'   // jamais en vente
  const badOrder = f.position !== '' && !(Number.isInteger(Number(f.position)) && Number(f.position) >= 1 && Number(f.position) <= 9999)
  const problem = validateBooster({ name: f.name, cards: f.cards, price: noSale ? '' : f.price, positions: pos, role: f.role }, names, kinds) || (badOrder ? 'L’ordre d’affichage doit être un nombre entier entre 1 et 9999 (ou vide).' : '')

  const setEntry = (i, j, patch) => setPos(pos.map((entries, k) => (k === i ? entries.map((e, m) => (m === j ? { ...e, ...patch } : e)) : entries)))
  const removeEntry = (i, j) => setPos(pos.map((entries, k) => (k === i ? entries.filter((_, m) => m !== j) : entries)))
  const addEntry = (i, id) => setPos(pos.map((entries, k) => (k === i ? [...entries, { rarity_id: id, weight: 1 }] : entries)))
  const setCards = (n) => { setF({ ...f, cards: n }); setPos(resizePositions(pos, n)) }

  const save = () => run(
    (pw) => api.adminSaveBoosterType(pw, booster?.id ?? null, { name: f.name.trim(), cards: f.cards, color: f.color, price: noSale || f.price === '' ? null : Number(f.price), enabled: std || f.role === 'card_reward' ? true : f.enabled, slots: positionsToSlots(pos), role: std ? null : f.role || null, glow: f.glow, position: f.position === '' ? null : Number(f.position) }),
    (res) => { if (isNew && res?.id != null) onCreated(res.id); return 'Booster enregistré.' },
  )
  const remove = () => {
    if (!window.confirm(`Supprimer le booster « ${booster.name} » ?`)) return
    run((pw) => api.adminDeleteBoosterType(pw, booster.id), () => { onDeleted(); return 'Booster supprimé.' })
  }
  const offer = () => {
    const n = Number(grant.qty)
    const who = grant.who.trim()
    if (!window.confirm(who ? `Offrir ${n} « ${booster.name} » à ${who} ?` : `Offrir ${n} « ${booster.name} » à TOUS les joueurs ?`)) return
    run((pw) => api.adminGrantBoosters(pw, booster.id, n, who || null), (res) => `${n} booster${n > 1 ? 's' : ''} offert${n > 1 ? 's' : ''} à ${res.players} joueur${res.players > 1 ? 's' : ''}.`)
  }

  return (
    <div className="admin-card booster-editor">
      <h3>{isNew ? 'Nouveau booster' : booster.name}{std && <span className="muted"> · se recharge tout seul</span>}</h3>
      <div className="booster-fields">
        <label>Nom<input value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label>Halo de lumière
          <span className="glow-field">
            <select value={f.glow} onChange={(e) => setF({ ...f, glow: e.target.value })}>
              {GLOWS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
            <i className={`glow-swatch glow-${f.glow}`} aria-hidden="true" />
          </span>
        </label>
        <label>Ordre d’affichage
          <input type="number" inputMode="numeric" min="1" max="9999" step="1" value={f.position} placeholder="à la suite" onChange={(e) => setF({ ...f, position: e.target.value })} />
          <small className="fine">1 = en premier sur la page Boosters, puis 2, 3… À égalité, le plus ancien passe d’abord.</small>
        </label>
        {!std && (
          <label>Rôle
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
        )}
        <label>Nombre de cartes
          <select value={f.cards} onChange={(e) => setCards(Number(e.target.value))}>
            {Array.from({ length: MAX_CARDS }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>Couleur<input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></label>
        <label>Prix en pièces
          <input type="number" min="0" step="1" inputMode="numeric" value={noSale ? '' : f.price} placeholder={noSale ? 'jamais en vente' : 'vide = hors vente'} disabled={noSale} onChange={(e) => setF({ ...f, price: e.target.value })} />
        </label>
        <label className="check inline">
          <input type="checkbox" checked={std || f.role === 'card_reward' ? true : f.enabled} disabled={std || f.role === 'card_reward'} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />
          <span>Actif{std || f.role === 'card_reward' ? ' (toujours)' : ''}</span>
        </label>
      </div>
      {std && <p className="fine">Le Standard est le booster qui se recharge tout seul (stock gratuit). Les autres s’achètent avec des pièces ou s’offrent.</p>}
      {!std && f.role && <p className="fine">{ROLES.find((r) => r.id === f.role)?.help} Un seul booster par rôle : en choisir ce rôle le retire à l’ancien.</p>}

      <div className="booster-cards">
        {pos.map((entries, i) => {
          const pct = shares(entries)
          const free = choices.filter((r) => !entries.some((e) => e.rarity_id === r.id))
          return (
            <fieldset key={i} className="booster-card">
              <legend>Carte {i + 1}</legend>
              {entries.map((e, j) => (
                <div key={e.rarity_id} className="booster-row">
                  <select aria-label={`Rareté de la carte ${i + 1}`} value={e.rarity_id} onChange={(ev) => setEntry(i, j, { rarity_id: ev.target.value })}>
                    {choices.filter((r) => r.id === e.rarity_id || !entries.some((x) => x.rarity_id === r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <input type="number" min="0" step="any" inputMode="decimal" aria-label={`Poids de ${names[e.rarity_id] ?? e.rarity_id}, carte ${i + 1}`} value={e.weight} onChange={(ev) => setEntry(i, j, { weight: ev.target.value })} />
                  <span className="booster-pct" aria-label="chance">{fmtOdds(pct[j])}</span>
                  <button type="button" className="btn ghost small" aria-label={`Retirer ${names[e.rarity_id] ?? e.rarity_id} de la carte ${i + 1}`} disabled={entries.length <= 1} onClick={() => removeEntry(i, j)}>×</button>
                </div>
              ))}
              {free.length > 0 && (
                <select className="booster-add" aria-label={`Ajouter une rareté à la carte ${i + 1}`} value="" onChange={(ev) => ev.target.value && addEntry(i, ev.target.value)}>
                  <option value="">+ Ajouter une rareté</option>
                  {free.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
            </fieldset>
          )
        })}
      </div>
      <p className="fine">Un poids de 80 et un de 20 donnent 80 % et 20 %. « Unique » : les cartes 1/1. Un booster ne contient jamais deux cartes identiques dans une même rareté.</p>
      {problem && <p className="msg error" role="alert">{problem}</p>}
      <div className="row">
        <button type="button" className="btn" disabled={busy || !!problem} onClick={save}>{isNew ? 'Créer le booster' : 'Enregistrer'}</button>
        {!isNew && <button type="button" className="btn ghost" disabled={busy} onClick={() => onDuplicate({ ...f, slots: positionsToSlots(pos) })}>Dupliquer</button>}
        {!isNew && !std && booster.role !== 'card_reward' && <button type="button" className="btn ghost danger" disabled={busy} onClick={remove}>Supprimer</button>}
      </div>

      {!isNew && !std && booster.role !== 'subscriber' && booster.role !== 'card_reward' && (
        <fieldset className="booster-grant">
          <legend>Offrir des boosters</legend>
          <div className="booster-fields">
            <label>Quantité<input type="number" min="1" max="1000" value={grant.qty} onChange={(e) => setGrant({ ...grant, qty: e.target.value })} /></label>
            <label>Pseudo (vide = tous les joueurs)<input value={grant.who} maxLength={30} autoComplete="off" onChange={(e) => setGrant({ ...grant, who: e.target.value })} /></label>
          </div>
          <div className="row">
            <button type="button" className="btn ghost" disabled={busy || !(Number(grant.qty) >= 1)} onClick={offer}>Offrir</button>
          </div>
        </fieldset>
      )}
    </div>
  )
}

// Booster offert quand une carte est complétée dans l'album : il est lié à la collection de la carte et ne s'ouvre que dans cette collection.
// 0 = l'ancien booster Gold (à ouvrir depuis la page Boosters).
export function RewardBoosterPicker({ data, run, busy }) {
  const row = (data.config ?? []).find((r) => r.key === 'card_reward_booster')
  if (!row) return null
  const options = (data.booster_types ?? []).filter((b) => !b.is_standard && b.enabled && (!b.role || b.role === 'subscription_gift'))
  const value = Number(row.value) || 0
  return (
    <div className="reward-picker">
      <label>
        <strong>Booster offert quand une carte est complétée</strong>
        <select value={value} disabled={busy} onChange={(e) => run((pw) => api.adminSetConfig(pw, 'card_reward_booster', Number(e.target.value)), 'Booster de récompense enregistré.')}>
          <option value={0}>Ancien booster Gold (à ouvrir)</option>
          {options.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <p className="fine">Quand un joueur remplit tous les emplacements d’une carte dans son album, il reçoit ce booster. Il est lié à la collection de la carte et ne s’ouvre que dans cette collection.</p>
    </div>
  )
}

export function BoostersTab({ data, run, busy, wide = false }) {
  const list = data.booster_types ?? []
  const [sel, setSel] = useState(list.find((b) => b.is_standard)?.id ?? list[0]?.id ?? 'new')
  const [draft, setDraft] = useState(null)   // copie d'un booster en cours de création
  const booster = typeof sel === 'number' ? list.find((b) => b.id === sel) ?? null : null
  const isStd = list.find((b) => b.is_standard)?.id
  const open = (id) => { setDraft(null); setSel(id) }
  const items = (
    <>
      <button type="button" className={`btn ${sel === 'new' ? '' : 'ghost'}`} onClick={() => open('new')}>+ Nouveau booster</button>
      <ul className="md-items">
        {list.map((b) => <li key={b.id}><BoosterListItem b={b} on={b.id === sel} onClick={() => open(b.id)} /></li>)}
      </ul>
    </>
  )
  const editor = (
    <BoosterEditor
      key={`${sel}-${draft ? 'copie' : booster ? booster.id : 'new'}-${list.length}`}
      booster={draft ? { name: `Copie de ${draft.name}`, cards: draft.cards, color: draft.color, price_coins: null, enabled: true, slots: draft.slots } : booster}
      rarities={data.rarities} run={run} busy={busy}
      onCreated={(id) => open(id)} onDeleted={() => open(isStd ?? 'new')} onDuplicate={(d) => { setDraft(d); setSel('new') }}
    />
  )
  if (wide) {
    return (
      <div className="admin-md boosters-wide">
        <aside className="md-list" aria-label="Boosters">
          {items}
          <p className="fine">Chaque booster définit, carte par carte, la répartition des raretés. Le Standard se recharge tout seul ; les autres s’achètent en pièces ou s’offrent.</p>
          <RewardBoosterPicker data={data} run={run} busy={busy} />
        </aside>
        <section className="md-detail">{editor}</section>
      </div>
    )
  }
  return (
    <div className="admin-list">
      <p className="muted">Chaque booster définit, carte par carte, la répartition des raretés. Le Standard se recharge tout seul ; les autres s’achètent en pièces ou s’offrent.</p>
      <RewardBoosterPicker data={data} run={run} busy={busy} />
      <div className="booster-list">{items}</div>
      {editor}
    </div>
  )
}

export function RaritiesTab({ data, run, busy }) {
  return (
    <div className="admin-list cols-2">
      <p className="muted">
        Nom, couleurs et seuils. « Taille de série maximale » : une rareté à seuil concerne les séries jusqu’à cette taille (vide = toutes les
        autres). Ce sont les seuils par défaut des cartes qui n’ont pas de raretés propres ; chaque carte peut les personnaliser (tranches, numéros
        visibles) dans l’onglet « Cartes ».
      </p>
      {data.rarities.map((r) => <RarityForm key={r.id} rarity={r} run={run} busy={busy} />)}
      <h3>Nouvelle rareté</h3>
      <p className="muted">
        Unique, Alpha et Omega sont fixes (1/1, 1/m, m/m) ; Alpha et Omega ne concernent que les séries dont le numéro est visible (ailleurs, ces cartes ont la rareté de leur tranche). On ne peut ajouter qu’une rareté « à seuil », entre les raretés existantes. Elle
        devient un seuil par défaut ; pour l’utiliser sur une carte qui a déjà ses propres raretés, ajoute-la dans sa fiche (onglet « Cartes »).
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
    <div className="admin-list cols-2">
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
    <div className="admin-list cols-2">
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
    <div className="admin-list narrow">
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

import { useEffect, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import LegalSheet from './Legal'

import { payable, payAmount, vatDetail } from '../price'
const dateFr = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })

// Pass Pro (achat unique, avantages à vie), page Profil : l'offre (avantages, prix) ou l'état de membre.
// sub = status.subscription ; baseMinutes = délai de recharge normal (celui d'un non membre) ; gift = le booster « cadeau Pro » dans le stock du joueur
// pending = retour de paiement : le pass est en cours d'activation (plus de bouton d'achat)
export function ProPanel({ sub, baseMinutes, vat = 0, onBuy, gift = null, pending = false, busy = false, error = '' }) {
  if (!sub || (!sub.enabled && !sub.active && !pending)) return null
  if (pending && !sub.active) {
    return (
      <section className="subscription pending" aria-label={`Pass ${sub.name}`} aria-busy="true">
        <strong className="sub-title">Activation de {sub.name}…</strong>
        <p className="muted">Ton paiement est validé : tes avantages arrivent dans quelques secondes.</p>
      </section>
    )
  }
  const faster = baseMinutes && sub.regen_minutes < baseMinutes
  // Les avantages du pass, un par ligne avec une pastille : {key, icon, title, text}
  const core = [
    { key: 'regen', icon: '⏱', title: `Boosters toutes les ${sub.regen_minutes} minutes`, text: faster && !sub.active ? `au lieu de ${baseMinutes} minutes` : null },
    sub.discount_percent > 0 ? { key: 'discount', icon: '🏷', title: `−${sub.discount_percent} % sur tous les boosters`, text: 'Dans « Autres boosters », le prix est barré puis réduit' } : null,
    { key: 'doubles', icon: '💰', title: 'Bouton Vente rapide par rareté', text: 'Vends tous tes doubles d’une rareté d’un coup (Collection, Mes cartes)' },
  ].filter(Boolean)
  const perks = sub.active ? core : [
    ...core,
    sub.booster_name ? { key: 'booster', icon: '⭐', title: `Le booster ${sub.booster_name} remplace le Standard`, text: 'de meilleures cartes' } : null,
    sub.gift_name && sub.gift_quantity > 0 ? { key: 'gift', icon: '🎁', title: `${sub.gift_quantity} booster ${sub.gift_name} offert`, text: 'à l’achat' } : null,
  ].filter(Boolean)
  const perkList = (
    <ul className="sub-perks">
      {perks.map((p) => (
        <li key={p.key}>
          <span className="perk-ico" aria-hidden="true">{p.icon}</span>
          <span className="perk-text"><strong>{p.title}</strong>{p.text && <small>{p.text}</small>}</span>
        </li>
      ))}
    </ul>
  )
  return (
    <section className={`subscription${sub.active ? ' on' : ''}`} aria-label={`Pass ${sub.name}`}>
      {sub.active ? (
        <>
          <strong className="sub-title">Membre {sub.name} à vie</strong>
          {sub.since && <p className="muted">Depuis le {dateFr(sub.since)}. Aucun renouvellement : c’est à toi pour toujours.</p>}
          {perkList}
          <div className="sub-gifts">
            {sub.booster_name && (
              <div className="sub-gift" style={{ '--c': sub.booster_color || '#7c3aed' }}>
                <i className="cat-dot" aria-hidden="true" />
                <span><small>Ton booster</small><strong>{sub.booster_name}</strong><small>à la place du Standard</small></span>
              </div>
            )}
            {sub.gift_name && sub.gift_quantity > 0 && (
              <div className="sub-gift" style={{ '--c': gift?.color || '#f59e0b' }}>
                <i className="cat-dot" aria-hidden="true" />
                <span><small>Ton cadeau Pro</small><strong>{sub.gift_name}</strong><small>{gift?.quantity > 0 ? `${gift.quantity} à ouvrir (page Boosters, « Autres boosters »)` : 'déjà ouvert'}</small></span>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <strong className="sub-title">{sub.name}</strong>
          <p className="sub-price">
            <strong>{payable(sub.price_cents, vat)}</strong> une seule fois, avantages à vie, sans abonnement
            {vatDetail(sub.price_cents, vat) && <small className="vat-line">{vatDetail(sub.price_cents, vat)}</small>}
          </p>
          {perkList}
          <button type="button" className="btn accent" onClick={onBuy} disabled={busy}>Devenir {sub.name} à vie</button>
        </>
      )}
      {error && <p className="msg error" role="alert">{error}</p>}
    </section>
  )
}

// Formulaire de consentement : conditions de vente et exécution immédiate (contenu numérique), comme pour un pack de boosters
export function ProForm({ texts, name, price, pay, vatLine, busy, error, onConfirm, onCancel, onOpenTerms }) {
  const [cgv, setCgv] = useState(false)
  const [withdrawal, setWithdrawal] = useState(false)
  const ready = !!texts && cgv && withdrawal && !busy
  return (
    <div className="legal-overlay" role="dialog" aria-modal="true" aria-label={`Devenir ${name} à vie`}>
      <div className="legal-panel consent">
        <h2>Devenir {name} à vie</h2>
        <p><strong>{price}</strong>, payé une seule fois. Pas d’abonnement, pas de renouvellement : les avantages sont à toi pour toujours et s’activent dès le paiement.</p>
        {vatLine && <p className="vat-line vat-line-block">{vatLine}</p>}

        <label className="check">
          <input type="checkbox" checked={cgv} onChange={(e) => setCgv(e.target.checked)} />
          <span>
            {texts?.cgv ?? 'Chargement…'}{' '}
            <button type="button" className="link" onClick={onOpenTerms}>Lire les conditions de vente</button>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={withdrawal} onChange={(e) => setWithdrawal(e.target.checked)} />
          <span>{texts?.withdrawal ?? 'Chargement…'}</span>
        </label>

        {error && <p className="msg error" role="alert">{error}</p>}
        <div className="row">
          <button className="btn accent" onClick={onConfirm} disabled={!ready}>{busy ? 'Redirection…' : `Payer ${pay ?? price}`}</button>
          <button className="btn ghost" onClick={onCancel} disabled={busy}>Annuler</button>
        </div>
        <p className="fine">Paiement sécurisé par Stripe.</p>
      </div>
    </div>
  )
}

export function ProConsent({ status, onClose }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [terms, setTerms] = useState(false)
  useEffect(() => { api.getLegal().then(setData).catch((e) => setError(explain(e))) }, [])

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      // Les deux cases sont cochées : la fonction serveur enregistre la preuve puis crée le paiement unique
      window.location.href = await api.startSubscription({ cgv: true, withdrawal: true, version: status.cgv_version })
    } catch (e) {
      setError(explain(e))
      setBusy(false)
    }
  }
  const texts = data && { cgv: data.legal.consent_cgv_text, withdrawal: data.legal.consent_withdrawal_text }
  const sub = status.subscription
  return (
    <>
      <ProForm texts={texts} name={sub.name} price={payable(sub.price_cents, status.vat_percent)} pay={payAmount(sub.price_cents, status.vat_percent)} vatLine={vatDetail(sub.price_cents, status.vat_percent)} busy={busy} error={error} onConfirm={confirm} onCancel={onClose} onOpenTerms={() => setTerms(true)} />
      {terms && <LegalSheet onClose={() => setTerms(false)} />}
    </>
  )
}

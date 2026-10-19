import { useEffect, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import LegalSheet from './Legal'

const euro = (cents) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100)
const dateFr = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })

// Carte de l'abonnement sur la page Boosters : l'offre (avantages, prix) ou l'état de l'abonné (renouvellement, gestion)
// sub = status.subscription ; baseMinutes = délai de recharge normal (celui d'un non abonné)
// pending = retour de paiement : l'abonnement est en cours d'activation (plus de bouton d'abonnement) ; gift = le booster cadeau dans le stock du joueur
export function SubscriptionPanel({ sub, baseMinutes, onSubscribe, onManage, onOpenGift, gift = null, pending = false, busy = false, error = '' }) {
  if (!sub || (!sub.enabled && !sub.active && !pending)) return null
  if (pending && !sub.active) {
    return (
      <section className="subscription pending" aria-label={`Abonnement ${sub.name}`} aria-busy="true">
        <strong className="sub-title">Activation de {sub.name}…</strong>
        <p className="muted">Ton paiement est validé : tes avantages arrivent dans quelques secondes.</p>
      </section>
    )
  }
  const faster = baseMinutes && sub.regen_minutes < baseMinutes
  const perks = [
    `Recharge de tes boosters toutes les ${sub.regen_minutes} minutes${faster && !sub.active ? ` au lieu de ${baseMinutes}` : ''}`,
    sub.booster_name ? `Le booster ${sub.booster_name} (de meilleures cartes) remplace le booster Standard` : null,
    sub.gift_name && sub.gift_quantity > 0 ? `${sub.gift_quantity} booster ${sub.gift_name} offert chaque mois` : null,
  ].filter(Boolean)
  return (
    <section className={`subscription${sub.active ? ' on' : ''}`} aria-label={`Abonnement ${sub.name}`}>
      {sub.active ? (
        <>
          <strong className="sub-title">Abonné {sub.name}</strong>
          {sub.period_end && <p className="muted">{sub.cancel_at_period_end ? `Ton abonnement se termine le ${dateFr(sub.period_end)}.` : `Prochain renouvellement le ${dateFr(sub.period_end)}.`}</p>}
          <ul className="sub-perks"><li>{perks[0]}</li></ul>
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
                <span><small>Ton cadeau du mois</small><strong>{sub.gift_name}</strong><small>{gift?.quantity > 0 ? `${gift.quantity} à ouvrir` : 'aucun en stock pour l’instant'}</small></span>
                {gift?.quantity > 0 && <button type="button" className="btn small" onClick={() => onOpenGift?.(gift)} disabled={busy}>Ouvrir</button>}
              </div>
            )}
          </div>
          <button type="button" className="btn ghost" onClick={onManage} disabled={busy}>{busy ? 'Ouverture…' : 'Gérer mon abonnement'}</button>
        </>
      ) : (
        <>
          <strong className="sub-title">{sub.name}</strong>
          <p className="sub-price"><strong>{euro(sub.price_cents)}</strong> par mois, résiliable à tout moment</p>
          <ul className="sub-perks">{perks.map((p) => <li key={p}>{p}</li>)}</ul>
          <button type="button" className="btn accent" onClick={onSubscribe} disabled={busy}>S’abonner à {sub.name}</button>
        </>
      )}
      {error && <p className="msg error" role="alert">{error}</p>}
    </section>
  )
}

// Formulaire de consentement de l'abonnement : trois cases (conditions de vente, exécution immédiate, renouvellement automatique)
export function SubscribeForm({ texts, name, price, busy, error, onConfirm, onCancel, onOpenTerms }) {
  const [cgv, setCgv] = useState(false)
  const [withdrawal, setWithdrawal] = useState(false)
  const [recurring, setRecurring] = useState(false)
  const ready = !!texts && cgv && withdrawal && recurring && !busy
  return (
    <div className="legal-overlay" role="dialog" aria-modal="true" aria-label={`S’abonner à ${name}`}>
      <div className="legal-panel consent">
        <h2>S’abonner à {name}</h2>
        <p><strong>{price}</strong> par mois, prélevé aujourd’hui puis chaque mois. Les avantages s’activent dès le paiement.</p>

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
        <label className="check">
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
          <span>Je comprends que l’abonnement {name} ({price} par mois) est renouvelé automatiquement chaque mois jusqu’à sa résiliation, que je peux faire à tout moment depuis « Gérer mon abonnement ».</span>
        </label>

        {error && <p className="msg error" role="alert">{error}</p>}
        <div className="row">
          <button className="btn accent" onClick={onConfirm} disabled={!ready}>{busy ? 'Redirection…' : `S’abonner · ${price} / mois`}</button>
          <button className="btn ghost" onClick={onCancel} disabled={busy}>Annuler</button>
        </div>
        <p className="fine">Paiement sécurisé par Stripe.</p>
      </div>
    </div>
  )
}

export function SubscribeConsent({ status, onClose }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [terms, setTerms] = useState(false)
  useEffect(() => { api.getLegal().then(setData).catch((e) => setError(explain(e))) }, [])

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      // Les trois cases sont cochées : la fonction serveur enregistre la preuve puis crée le paiement mensuel
      window.location.href = await api.startSubscription({ cgv: true, withdrawal: true, recurring: true, version: status.cgv_version })
    } catch (e) {
      setError(explain(e))
      setBusy(false)
    }
  }
  const texts = data && { cgv: data.legal.consent_cgv_text, withdrawal: data.legal.consent_withdrawal_text }
  const sub = status.subscription
  return (
    <>
      <SubscribeForm texts={texts} name={sub.name} price={euro(sub.price_cents)} busy={busy} error={error} onConfirm={confirm} onCancel={onClose} onOpenTerms={() => setTerms(true)} />
      {terms && <LegalSheet onClose={() => setTerms(false)} />}
    </>
  )
}

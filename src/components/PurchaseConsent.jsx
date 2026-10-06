import { useEffect, useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import LegalSheet from './Legal'

const euro = (cents) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100)

// Formulaire de consentement : le paiement n'est possible qu'une fois les deux cases cochées
export function ConsentForm({ texts, packBoosters, price, busy, error, onConfirm, onCancel, onOpenTerms }) {
  const [cgv, setCgv] = useState(false)
  const [withdrawal, setWithdrawal] = useState(false)
  const ready = !!texts && cgv && withdrawal && !busy
  return (
    <div className="legal-overlay" role="dialog" aria-modal="true" aria-label="Avant de payer">
      <div className="legal-panel consent">
        <h2>Avant de payer</h2>
        <p>
          <strong>{packBoosters} boosters</strong> pour <strong>{price}</strong>. Contenu numérique ajouté à ton compte dès le paiement.
        </p>

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
          <button className="btn accent" onClick={onConfirm} disabled={!ready}>{busy ? 'Redirection…' : `Payer ${price}`}</button>
          <button className="btn ghost" onClick={onCancel} disabled={busy}>Annuler</button>
        </div>
        <p className="fine">Paiement sécurisé par Stripe.</p>
      </div>
    </div>
  )
}

export default function PurchaseConsent({ status, onClose }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [terms, setTerms] = useState(false)

  useEffect(() => {
    api.getLegal().then(setData).catch((e) => setError(explain(e)))
  }, [])

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      // Les deux cases sont cochées : la fonction serveur enregistre la preuve puis crée le paiement
      window.location.href = await api.startCheckout({ cgv: true, withdrawal: true, version: status.cgv_version })
    } catch (e) {
      setError(explain(e))
      setBusy(false)
    }
  }

  const texts = data && { cgv: data.legal.consent_cgv_text, withdrawal: data.legal.consent_withdrawal_text }
  return (
    <>
      <ConsentForm
        texts={texts}
        packBoosters={status.pack_boosters}
        price={euro(status.pack_price_cents)}
        busy={busy}
        error={error}
        onConfirm={confirm}
        onCancel={onClose}
        onOpenTerms={() => setTerms(true)}
      />
      {terms && <LegalSheet onClose={() => setTerms(false)} />}
    </>
  )
}

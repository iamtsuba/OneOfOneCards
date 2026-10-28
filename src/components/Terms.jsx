import { useState } from 'react'
import * as api from '../api'
import { explain } from '../api'
import { useGame } from '../game'
import { supabase } from '../supabase'
import LegalSheet from './Legal'

// Fenêtre obligatoire : une nouvelle version des conditions d'utilisation (ou la première pour un joueur existant) doit être acceptée pour continuer à jouer
export function CguGate() {
  const { status, setStatus } = useGame()
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)

  async function accept() {
    setBusy(true); setError('')
    try {
      const res = await api.acceptTerms(status.cgu_version)
      if (res?.status) setStatus(res.status)
    } catch (e) {
      setError(explain(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="legal-overlay" role="dialog" aria-modal="true" aria-label="Conditions générales d’utilisation">
      <div className="legal-panel consent">
        <h2>Conditions générales d’utilisation</h2>
        <p>Pour continuer à jouer, lis et accepte les conditions générales d’utilisation (version {status?.cgu_version ?? 1}).</p>
        <p><button type="button" className="link" onClick={() => setReading(true)}>Lire les conditions générales d’utilisation</button></p>
        <label className="check">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>J’ai lu et j’accepte les conditions générales d’utilisation.</span>
        </label>
        {error && <p className="msg error" role="alert">{error}</p>}
        <div className="row">
          <button type="button" className="btn accent" disabled={!checked || busy} onClick={accept}>{busy ? 'Un instant…' : 'Continuer'}</button>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => supabase.auth.signOut()}>Me déconnecter</button>
        </div>
        {reading && <LegalSheet initial="cgu" onClose={() => setReading(false)} />}
      </div>
    </div>
  )
}

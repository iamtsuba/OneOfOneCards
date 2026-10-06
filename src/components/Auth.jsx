import { useState } from 'react'
import { supabase } from '../supabase'
import { explain } from '../api'
import Brand from './Brand'
import LegalSheet from './Legal'

export default function Auth() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [terms, setTerms] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { username: username.trim() },
            emailRedirectTo: window.location.origin + window.location.pathname,
          },
        })
        if (error) throw error
        if (!data.session) {
          setInfo('Compte créé. Clique sur le lien de confirmation reçu par email, puis connecte-toi.')
          setMode('login')
          setPassword('')
        }
      }
    } catch (err) {
      setError(explain(err))
    } finally {
      setBusy(false)
    }
  }

  const signup = mode === 'signup'
  return (
    <main className="auth">
      <div className="auth-card">
        <Brand size="lg" />
        <p className="auth-lead">
          Ouvre des boosters de cartes numérotées de 1/1 à 1413/1413. Plus la série est petite, plus la carte est rare.
        </p>

        <div className="segmented" role="tablist" aria-label="Mode de connexion">
          <button role="tab" aria-selected={!signup} className={!signup ? 'on' : ''} onClick={() => { setMode('login'); setError('') }} type="button">Se connecter</button>
          <button role="tab" aria-selected={signup} className={signup ? 'on' : ''} onClick={() => { setMode('signup'); setError(''); setInfo('') }} type="button">Créer un compte</button>
        </div>

        <form onSubmit={submit} className="form">
          {signup && (
            <label>
              Pseudo
              <input value={username} onChange={(e) => setUsername(e.target.value)} minLength={2} maxLength={24} autoComplete="nickname" required />
            </label>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
          </label>
          <label>
            Mot de passe
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} autoComplete={signup ? 'new-password' : 'current-password'} required />
          </label>
          {error && <p className="msg error" role="alert">{error}</p>}
          {info && <p className="msg info" role="status">{info}</p>}
          <button className="btn accent" disabled={busy}>
            {busy ? 'Un instant…' : signup ? 'Créer mon compte' : 'Se connecter'}
          </button>
        </form>
        {signup && <p className="fine">Tu reçois 10 boosters à l’arrivée, puis 10 de plus toutes les 10 minutes.</p>}
        <p className="fine"><button type="button" className="link" onClick={() => setTerms(true)}>Conditions de vente et mentions légales</button></p>
        {terms && <LegalSheet onClose={() => setTerms(false)} />}
      </div>
    </main>
  )
}

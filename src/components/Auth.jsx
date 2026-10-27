import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { explain, usernameAvailable, friendInvitePreview } from '../api'
import { loadPendingInvite } from '../invite'
import { loginEmail, pseudoProblem, pseudoToEmail } from '../pseudo'
import Brand from './Brand'
import LegalSheet from './Legal'
import Landing from './Landing'

export default function Auth() {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')   // pseudo (à la connexion : pseudo, ou email pour un ancien compte)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [terms, setTerms] = useState(false)
  const [inviter, setInviter] = useState('')   // pseudo de l'ami dont on a ouvert le lien d'invitation

  // Lien d'invitation ouvert avant de se connecter : on dit qui invite, l'amitié se fera toute seule une fois connecté
  useEffect(() => {
    const code = loadPendingInvite(window.localStorage)
    if (!code) return
    friendInvitePreview(code).then((name) => { if (typeof name === 'string' && name) setInviter(name) }).catch(() => {})
  }, [])

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')
    try {
      if (mode === 'login') {
        // Pseudo + mot de passe (ou, pour un ancien compte, son email) : aucun email n'est jamais envoyé
        const email = loginEmail(username)
        if (!email) throw new Error('Invalid login credentials')   // ni un pseudo valide ni un email : même message que pour un mauvais mot de passe
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const pseudo = username.trim()
        const problem = pseudoProblem(pseudo)
        if (problem) { setError(problem); return }
        if (password.length < 6) { setError('Le mot de passe doit contenir au moins 6 caractères.'); return }
        if (password !== confirm) { setError('Les deux mots de passe ne sont pas identiques.'); return }
        // Le pseudo est unique et définitif : on s'assure qu'il est libre avant de créer le compte
        if ((await usernameAvailable(pseudo)) !== true) throw new Error('username_taken')   // seule une réponse « vrai » autorise l'inscription
        const { data, error } = await supabase.auth.signUp({ email: pseudoToEmail(pseudo), password, options: { data: { username: pseudo } } })
        if (error) throw error
        if (!data.session) {   // le projet doit confirmer les comptes automatiquement : sinon on n'est pas connecté tout de suite
          setInfo('Compte créé : connecte-toi avec ton pseudo et ton mot de passe.')
          setMode('login')
          setPassword('')
          setConfirm('')
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
    <>
    <main className="auth">
      <div className="auth-card">
        <Brand size="lg" />
        <p className="auth-lead">
          Ouvre des boosters de cartes numérotées, chacune en un seul exemplaire, et complète ton album.
        </p>
        {inviter && <p className="msg info invite-banner" role="status">Tu as été invité par <strong>{inviter}</strong> : connecte-toi ou crée ton compte, et vous deviendrez amis automatiquement.</p>}

        <div className="segmented" role="tablist" aria-label="Mode de connexion">
          <button role="tab" aria-selected={!signup} className={!signup ? 'on' : ''} onClick={() => { setMode('login'); setError(''); setConfirm('') }} type="button">Se connecter</button>
          <button role="tab" aria-selected={signup} className={signup ? 'on' : ''} onClick={() => { setMode('signup'); setError(''); setInfo('') }} type="button">Créer un compte</button>
        </div>

        <form onSubmit={submit} className="form">
          <label>
            Pseudo
            <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={signup ? 24 : 120} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
            {signup ? (
              <small className="field-hint">Unique et définitif : tu ne pourras pas le changer. Lettres sans accent, chiffres et _ - . (2 à 24 caractères).</small>
            ) : (
              <small className="field-hint">Ancien compte avec un email ? Saisis ton email à la place du pseudo.</small>
            )}
          </label>
          <label>
            Mot de passe
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} autoComplete={signup ? 'new-password' : 'current-password'} required />
          </label>
          {signup && (
            <label>
              Confirme le mot de passe
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} autoComplete="new-password" required />
              <small className="field-hint">Pas d’email : un mot de passe oublié ne peut pas être récupéré. Note-le bien.</small>
            </label>
          )}
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
    <Landing />
    </>
  )
}

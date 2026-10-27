// Connexion par PSEUDO + mot de passe, sans email. Le service d'authentification exige une adresse : on en fabrique une, propre au pseudo, qui ne reçoit jamais de courrier
// (le compte est confirmé tout de suite, aucun email n'est envoyé). Le pseudo est unique (casse ignorée) et définitif : l'adresse qui en découle ne change donc jamais.
// Les anciens comptes gardent leur vraie adresse : à la connexion, un identifiant contenant « @ » est traité comme un email.
export const PSEUDO_DOMAIN = 'pseudo.1o1cards.cc'

// 2 à 24 caractères : lettres sans accent, chiffres, « _ », « - » et « . » (le point ni au début, ni à la fin, ni doublé : l'adresse resterait invalide)
const PSEUDO_CHARS = /^[A-Za-z0-9_.-]+$/

export function pseudoProblem(raw) {
  const p = String(raw ?? '').trim()
  if (p.length < 2 || p.length > 24) return 'Le pseudo fait entre 2 et 24 caractères.'
  if (!PSEUDO_CHARS.test(p) || p.startsWith('.') || p.endsWith('.') || p.includes('..')) {
    return 'Le pseudo ne peut contenir que des lettres sans accent, des chiffres et _ - . (le point ni au début, ni à la fin, ni doublé).'
  }
  return ''
}
export const isValidPseudo = (raw) => pseudoProblem(raw) === ''

// L'adresse technique d'un pseudo (casse ignorée : « Tom » et « tom » sont le même compte)
export const pseudoToEmail = (raw) => `${String(raw ?? '').trim().toLowerCase()}@${PSEUDO_DOMAIN}`
export const isPseudoEmail = (email) => typeof email === 'string' && email.trim().toLowerCase().endsWith(`@${PSEUDO_DOMAIN}`)

// Adresse à utiliser pour se connecter d'après ce que le joueur a saisi : son pseudo, ou (ancien compte) son email ; null = ni l'un ni l'autre
export function loginEmail(input) {
  const v = String(input ?? '').trim()
  if (v.includes('@')) return v
  return isValidPseudo(v) ? pseudoToEmail(v) : null
}

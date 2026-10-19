// Lien d'invitation d'ami : https://<site>/?ami=<code>. Ouvrir le lien (une fois connecté) rend ami avec son propriétaire, sans demande à accepter.
// Logique pure (testée sans navigateur dans tests/invite.test.mjs). Le code est gardé dans le navigateur le temps de créer un compte ou de se connecter.

export const INVITE_PARAM = 'ami'
export const PENDING_KEY = 'o1o_pending_invite'
export const isInviteCode = (c) => typeof c === 'string' && /^[0-9a-f]{20}$/.test(c)

export const inviteLink = (origin, code) => `${String(origin).replace(/\/+$/, '')}/?${INVITE_PARAM}=${code}`

// Lit ?ami=… dans une chaîne de recherche d'adresse. valid = code bien formé ; search = la recherche SANS le paramètre (pour nettoyer la barre d'adresse)
export function readInvite(search) {
  const params = new URLSearchParams(search ?? '')
  if (!params.has(INVITE_PARAM)) return { present: false, code: null, search: search ?? '' }
  const raw = params.get(INVITE_PARAM)
  params.delete(INVITE_PARAM)
  const qs = params.toString()
  return { present: true, code: isInviteCode(raw) ? raw : null, search: qs ? `?${qs}` : '' }
}

// Stockage du navigateur : toutes les opérations sont protégées (navigation privée, stockage bloqué…)
export function savePendingInvite(storage, code) { try { if (isInviteCode(code)) storage.setItem(PENDING_KEY, code) } catch { /* stockage indisponible */ } }
export function loadPendingInvite(storage) { try { const c = storage.getItem(PENDING_KEY); return isInviteCode(c) ? c : null } catch { return null } }
export function clearPendingInvite(storage) { try { storage.removeItem(PENDING_KEY) } catch { /* stockage indisponible */ } }

// À l'arrivée sur le site : retient le code du lien et nettoie la barre d'adresse. Renvoie le code retenu (ou null).
export function captureInviteFromUrl(win) {
  const r = readInvite(win.location.search)
  if (!r.present) return null
  if (r.code) savePendingInvite(win.localStorage, r.code)
  try { win.history.replaceState({}, '', win.location.pathname + r.search + win.location.hash) } catch { /* adresse non modifiable */ }
  return r.code
}

// Une fois connecté : accepte l'invitation en attente. Le code est effacé dès que le serveur a répondu (accepté ou refusé pour de bon) ;
// il est gardé si la réponse n'est pas arrivée (réseau coupé), pour réessayer plus tard.
// Renvoie { kind: 'none' | 'joined' | 'already' | 'error', friend?, error? }
export async function runPendingInvite(storage, accept) {
  const code = loadPendingInvite(storage)
  if (!code) return { kind: 'none' }
  try {
    const res = await accept(code)
    clearPendingInvite(storage)
    return { kind: res?.already ? 'already' : 'joined', friend: res?.friend ?? '' }
  } catch (e) {
    const m = String(e?.message ?? e ?? '')
    if (/invalid_invite|cannot_friend_self|inviter_full|too_many_friends/.test(m)) clearPendingInvite(storage)
    return { kind: 'error', error: e }
  }
}

export function inviteMessage(r, explain) {
  if (r.kind === 'joined') return `Tu es maintenant ami avec ${r.friend} !`
  if (r.kind === 'already') return `Tu es déjà ami avec ${r.friend}.`
  if (r.kind === 'error') return explain(r.error)
  return ''
}

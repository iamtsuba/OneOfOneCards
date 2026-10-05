import { supabase } from './supabase'

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data
}

export const getStatus = () => rpc('opennumber_status')
export const openBooster = () => rpc('opennumber_open_booster')
export const getStats = () => rpc('opennumber_my_stats')
export const seriesOwned = (series) => rpc('opennumber_series_owned', { p_series: series })
export const setUsername = (name) => rpc('opennumber_set_username', { p_username: name })
export const listCollection = ({ rarity = null, sort = 'series', limit = 60, offset = 0 } = {}) =>
  rpc('opennumber_list_collection', { p_rarity: rarity, p_sort: sort, p_limit: limit, p_offset: offset })

export async function getRarities() {
  const { data, error } = await supabase.from('opennumber_rarities').select('*').order('sort_order')
  if (error) throw error
  return data
}

// Messages d'erreur lisibles
export function explain(e) {
  const m = e?.message || String(e)
  if (m.includes('no_boosters')) return 'Tu n’as plus de booster pour le moment.'
  if (m.includes('invalid_username')) return 'Le pseudo doit contenir entre 2 et 24 caractères.'
  if (/Could not find the function|schema cache|does not exist|relation .* not/i.test(m))
    return 'La base de données n’est pas encore initialisée : exécute supabase/schema.sql dans le SQL Editor de Supabase.'
  if (/Invalid login credentials/i.test(m)) return 'Email ou mot de passe incorrect.'
  if (/already registered|already been registered/i.test(m)) return 'Un compte existe déjà avec cet email.'
  if (/Email not confirmed/i.test(m)) return 'Confirme ton adresse email avant de te connecter.'
  if (/at least \d+ characters/i.test(m)) return 'Le mot de passe doit contenir au moins 6 caractères.'
  if (/rate limit|too many/i.test(m)) return 'Trop de tentatives : réessaie dans quelques minutes.'
  if (/valid email|invalid email/i.test(m)) return 'Adresse email invalide.'
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Connexion impossible : vérifie ton réseau.'
  return m
}

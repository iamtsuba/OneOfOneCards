// Réglages de l'environnement, fixés à la compilation (fichiers .env.prod / .env.preprod) :
//   npm run build:prod    -> tables o1ocards_*      (production)
//   npm run build:preprod -> tables pp_o1ocards_*   (préproduction)
// Les deux environnements partagent la même base Supabase : seul le préfixe des tables et des fonctions change.
const env = import.meta.env

export const APP_NAME = '1/1 Cards'
export const APP_ENV = env.VITE_APP_ENV || 'prod'
export const IS_PREPROD = APP_ENV === 'preprod'
export const PREFIX = env.VITE_TABLE_PREFIX || 'o1ocards_'
export const CHECKOUT_FUNCTION = env.VITE_CHECKOUT_FUNCTION || 'o1ocards-checkout'
export const AUTH_STORAGE_KEY = env.VITE_AUTH_STORAGE_KEY || 'o1ocards-auth'

// Génère le SQL de chaque environnement à partir du modèle supabase/schema.template.sql
// (et des migrations supabase/migrations/*.template.sql) en remplaçant {{P}} par le préfixe de l'environnement.
//   node scripts/build-schema.mjs            écrit supabase/generated/
//   node scripts/build-schema.mjs --check    échoue si supabase/generated/ n'est pas à jour
import fs from 'node:fs'
import path from 'node:path'

export const ENVS = { prod: 'o1ocards_', preprod: 'pp_o1ocards_' }
// Valeurs par défaut propres à chaque environnement (graines de la base, jamais écrasées si la ligne existe déjà) :
// la boutique est visible d'emblée en préproduction pour pouvoir tester les achats, masquée en production tant que Stripe n'est pas prêt.
const VARS = { prod: { SHOP_ENABLED: '0' }, preprod: { SHOP_ENABLED: '1' } }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const sqlDir = path.join(root, 'supabase')
const outDir = path.join(sqlDir, 'generated')
const check = process.argv.includes('--check')

const banner = (env, prefix, source) =>
  `-- GÉNÉRÉ par scripts/build-schema.mjs à partir de ${source} : ne pas modifier à la main.\n` +
  `-- Environnement : ${env} | préfixe des tables et des fonctions : ${prefix}\n\n`

function render(template, env, prefix, source) {
  let body = template.replaceAll('{{P}}', prefix)
  for (const [k, v] of Object.entries(VARS[env])) body = body.replaceAll(`{{${k}}}`, v)
  const out = banner(env, prefix, source) + body
  if (out.includes('{{')) throw new Error(`Variable non remplacée dans ${source}`)
  // PostgreSQL tronque silencieusement les noms au-delà de 63 caractères : on refuse plutôt que de risquer des collisions
  for (const m of out.matchAll(new RegExp(`${prefix}[a-z0-9_]+`, 'g'))) {
    if (m[0].length > 63) throw new Error(`Identifiant trop long (${m[0].length}) : ${m[0]}`)
  }
  return out
}

const jobs = []
for (const [env, prefix] of Object.entries(ENVS)) {
  jobs.push([path.join(outDir, `schema.${env}.sql`), render(fs.readFileSync(path.join(sqlDir, 'schema.template.sql'), 'utf8'), env, prefix, 'supabase/schema.template.sql')])
  const migDir = path.join(sqlDir, 'migrations')
  if (fs.existsSync(migDir)) {
    for (const f of fs.readdirSync(migDir).filter((n) => n.endsWith('.template.sql')).sort()) {
      const base = f.replace('.template.sql', '')
      jobs.push([path.join(outDir, 'migrations', `${base}.${env}.sql`), render(fs.readFileSync(path.join(migDir, f), 'utf8'), env, prefix, `supabase/migrations/${f}`)])
    }
  }
}

let stale = 0
for (const [file, content] of jobs) {
  if (check) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) { console.error('PÉRIMÉ :', path.relative(root, file)); stale++ }
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
    console.log('écrit', path.relative(root, file), `(${content.split('\n').length} lignes)`)
  }
}
if (check) { if (stale) { console.error(`${stale} fichier(s) à régénérer : npm run build:schema`); process.exit(1) } console.log('SQL généré à jour') }

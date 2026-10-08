// Génère les fonctions Edge Supabase de chaque environnement à partir des modèles de supabase/functions/_templates/.
//   prod    : o1ocards-checkout, o1ocards-stripe-webhook         (secrets STRIPE_SECRET_KEY, SITE_URL, STRIPE_WEBHOOK_SECRET)
//   préprod : pp-o1ocards-checkout, pp-o1ocards-stripe-webhook   (secrets PP_STRIPE_SECRET_KEY, PP_SITE_URL, PP_STRIPE_WEBHOOK_SECRET)
//   node scripts/build-functions.mjs           écrit les fonctions et met à jour supabase/config.toml
//   node scripts/build-functions.mjs --check   échoue si elles ne sont pas à jour
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const fnDir = path.join(root, 'supabase', 'functions')
const check = process.argv.includes('--check')

const ENVS = {
  prod: {
    prefix: 'o1ocards_', sp: '', dir: 'o1ocards',
    keyHint: 'sk_test_... puis sk_live_...', siteHint: 'ex. https://1o1cards.cc/', fallbackNote: '',
  },
  preprod: {
    prefix: 'pp_o1ocards_', sp: 'PP_', dir: 'pp-o1ocards',
    keyHint: 'TOUJOURS une clé sk_test_ : les clés sk_live_ sont refusées en préproduction',
    siteHint: 'ex. https://pp.1o1cards.cc/',
    fallbackNote: '\n//   (les réglages facultatifs retombent sur ceux de la production s\'ils ne sont pas définis ; jamais les clés Stripe)',
  },
}
const TEMPLATES = { checkout: 'checkout.template.ts', 'stripe-webhook': 'webhook.template.ts' }

const render = (tpl, env, c) =>
  tpl.replaceAll('__ENV__', env).replaceAll('__PREFIX__', c.prefix).replaceAll('__KEYHINT__', c.keyHint)
    .replaceAll('__SITEHINT__', c.siteHint).replaceAll('__FALLBACKNOTE__', c.fallbackNote).replaceAll('__SP__', c.sp)

const jobs = []
const names = []
for (const [env, c] of Object.entries(ENVS)) {
  for (const [kind, file] of Object.entries(TEMPLATES)) {
    const name = `${c.dir}-${kind}`
    const out = render(fs.readFileSync(path.join(fnDir, '_templates', file), 'utf8'), env, c)
    if (/__[A-Z]+__/.test(out)) throw new Error(`Variable non remplacée dans ${name}`)
    jobs.push([path.join(fnDir, name, 'index.ts'), out])
    names.push(name)
  }
}
const toml =
  '# Le jeton du joueur est vérifié dans le code de chaque fonction ; le webhook est vérifié par la signature Stripe.\n' +
  '# Fichier généré par scripts/build-functions.mjs.\n' +
  'project_id = "uhsodmpqoporeiebhvwt"\n\n' +
  names.map((n) => `[functions.${n}]\nverify_jwt = false\n`).join('\n')
jobs.push([path.join(root, 'supabase', 'config.toml'), toml])

let stale = 0
for (const [file, content] of jobs) {
  if (check) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) { console.error('PÉRIMÉ :', path.relative(root, file)); stale++ }
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content)
    console.log('écrit', path.relative(root, file))
  }
}
if (!check) {
  // supprime les anciennes fonctions « opennumber-* »
  for (const old of ['opennumber-checkout', 'opennumber-stripe-webhook']) fs.rmSync(path.join(fnDir, old), { recursive: true, force: true })
}
if (check) { if (stale) { console.error(`${stale} fichier(s) à régénérer : npm run build:functions`); process.exit(1) } console.log('Fonctions Edge à jour') }

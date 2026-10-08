// À lancer après `vite build` : ajoute au site compilé les en-têtes HTTP (_headers) et version.json.
//   node scripts/post-build.mjs <prod|preprod>
// Sur Cloudflare Pages, le commit et la branche viennent des variables CF_PAGES_COMMIT_SHA et CF_PAGES_BRANCH.
//
// Garde-fou : un build de PRODUCTION est refusé s'il est lancé depuis une autre branche que main. Cloudflare compile aussi les
// autres branches en « prévisualisation » : sans ce garde-fou, du code non livré pourrait se retrouver publié sur une
// adresse publique en écrivant dans les tables de production. (ALLOW_PROD_BUILD_FROM_ANY_BRANCH=1 le désactive, pour un test local.)
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const env = process.argv[2]
if (!['prod', 'preprod'].includes(env)) { console.error('Usage : node scripts/post-build.mjs <prod|preprod>'); process.exit(2) }

const git = (...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' } }
const onCloudflare = !!process.env.CF_PAGES
const branch = process.env.CF_PAGES_BRANCH || git('rev-parse', '--abbrev-ref', 'HEAD') || 'inconnue'
const commit = process.env.CF_PAGES_COMMIT_SHA || git('rev-parse', 'HEAD') || 'inconnu'

if (env === 'prod' && onCloudflare && branch !== 'main' && process.env.ALLOW_PROD_BUILD_FROM_ANY_BRANCH !== '1') {
  console.error(`Build de PRODUCTION refusé : la branche « ${branch} » n'est pas main.`)
  console.error('Désactive les déploiements de prévisualisation du projet de production dans Cloudflare (Branch control).')
  process.exit(1)
}

const dir = path.join(root, 'dist', env)
if (!fs.existsSync(path.join(dir, 'index.html'))) { console.error(`dist/${env}/index.html introuvable : lance d'abord vite build.`); process.exit(1) }

const version = { app: '1/1 Cards', env, commit, branch, host: onCloudflare ? 'cloudflare-pages' : 'local', builtAt: new Date().toISOString() }
fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify(version, null, 2) + '\n')

const security = [
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  X-Frame-Options: DENY',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
  ...(env === 'preprod' ? ['  X-Robots-Tag: noindex, nofollow'] : []),
]
const headers = [
  '# Généré par scripts/post-build.mjs',
  '/*', ...security, '',
  '/assets/*', '  Cache-Control: public, max-age=31536000, immutable', '',
  '/', '  Cache-Control: no-cache', '',
  '/index.html', '  Cache-Control: no-cache', '',
  '/version.json', '  Cache-Control: no-store', '',
].join('\n')
fs.writeFileSync(path.join(dir, '_headers'), headers)
console.log(`dist/${env} prêt : version.json (${commit.slice(0, 7)}, ${branch}) et _headers${env === 'preprod' ? ' (noindex)' : ''}`)

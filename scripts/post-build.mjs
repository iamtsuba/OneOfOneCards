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
  '/version.json', '  Cache-Control: no-store', '  X-Robots-Tag: noindex', '',
].join('\n')
fs.writeFileSync(path.join(dir, '_headers'), headers)

// ---------- Référencement ----------
// Adresse du site : VITE_SITE_URL du fichier .env.<env> (repli sur les adresses connues si le fichier manque)
let siteUrl = env === 'prod' ? 'https://1o1cards.cc' : 'https://pp.1o1cards.cc'
try {
  const m = fs.readFileSync(path.join(root, `.env.${env}`), 'utf8').match(/^\s*VITE_SITE_URL\s*=\s*(\S+)\s*$/m)
  if (m) siteUrl = m[1]
} catch { /* pas de fichier : repli */ }
siteUrl = siteUrl.replace(/\/+$/, '')

if (env === 'prod') {
  // Production : tout est exploré, le plan du site est indiqué
  fs.writeFileSync(path.join(dir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`)
  fs.writeFileSync(path.join(dir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`)
} else {
  // Préproduction : rien ne doit être exploré (en plus de l'en-tête X-Robots-Tag et de la balise noindex), et aucun plan de site
  fs.writeFileSync(path.join(dir, 'robots.txt'), 'User-agent: *\nDisallow: /\n')
}

// Page d'accueil pré-rendue : du vrai texte dans le HTML, lisible sans JavaScript. Un échec ne bloque pas la mise en ligne.
let prerendered = ''
try {
  const { prerender } = await import('./prerender.mjs')
  const n = await prerender({ root, env, dir })
  prerendered = `, page d'accueil pré-rendue (${(n / 1024).toFixed(1)} Ko)`
} catch (e) {
  prerendered = `, pré-rendu IGNORÉ (${e.message})`
  console.warn(`ATTENTION : pré-rendu de la page d'accueil ignoré : ${e.message}`)
}
console.log(`dist/${env} prêt : version.json (${commit.slice(0, 7)}, ${branch}), _headers${env === 'preprod' ? ' (noindex)' : ''}, robots.txt${env === 'prod' ? ', sitemap.xml' : ''}${prerendered}`)

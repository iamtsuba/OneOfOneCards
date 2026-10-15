// Contrôle le référencement des sites COMPILÉS (dist/prod et dist/preprod) : balises, page d'accueil pré-rendue, images, robots.txt,
// plan du site, en-têtes. La production doit être explorable ; la préproduction ne doit JAMAIS l'être.
//   npm run build:all && node tests/seo.test.mjs
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
let bad = 0
const ok = (name, cond, extra = '') => { console.log(cond ? 'OK  ' : 'FAIL', name, cond ? '' : extra); if (!cond) bad++ }

const CASES = [
  { mode: 'prod', site: 'https://1o1cards.cc', robots: 'index,follow', open: true },
  { mode: 'preprod', site: 'https://pp.1o1cards.cc', robots: 'noindex,nofollow', open: false },
]
const attr = (html, tag, key, val, get) => {
  const re = new RegExp(`<${tag}[^>]*\\b${key}="${val}"[^>]*>`, 'i')
  const m = html.match(re)
  return m ? (m[0].match(new RegExp(`\\b${get}="([^"]*)"`)) || [])[1] : undefined
}
const pngSize = (file) => { const b = fs.readFileSync(file); return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20) }

for (const c of CASES) {
  const dir = path.join(root, 'dist', c.mode)
  const tag = `[dist/${c.mode}]`
  if (!fs.existsSync(path.join(dir, 'index.html'))) { console.log(`(${tag} absent : lance npm run build:${c.mode})`); continue }
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8')
  const rootHtml = (html.match(/<div id="root">([\s\S]*?)<\/div>\s*<noscript>/) || [])[1] ?? ''

  // --- balises de base
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] ?? ''
  const desc = attr(html, 'meta', 'name', 'description', 'content') ?? ''
  ok(`${tag} langue française, titre et description renseignés`, /<html lang="fr"/.test(html) && title.length > 10 && desc.length > 10)
  ok(`${tag} titre court (≤ 65 caractères) et description entre 70 et 160 caractères`, title.length <= 65 && desc.length >= 70 && desc.length <= 160, `titre ${title.length}, description ${desc.length}`)
  ok(`${tag} aucun jeton %VITE_…% resté dans le HTML`, !/%VITE_[A-Z_]+%/.test(html))
  ok(`${tag} balise robots : ${c.robots}`, attr(html, 'meta', 'name', 'robots', 'content') === c.robots)
  ok(`${tag} adresse canonique ${c.site}/ et og:url identiques`, attr(html, 'link', 'rel', 'canonical', 'href') === `${c.site}/` && attr(html, 'meta', 'property', 'og:url', 'content') === `${c.site}/`)

  // --- partage
  ok(`${tag} aperçu de partage : og:title, og:description, og:image absolue, twitter:card grande image`,
    !!attr(html, 'meta', 'property', 'og:title', 'content') && !!attr(html, 'meta', 'property', 'og:description', 'content')
    && attr(html, 'meta', 'property', 'og:image', 'content') === `${c.site}/og-image.png` && attr(html, 'meta', 'name', 'twitter:card', 'content') === 'summary_large_image'
    && attr(html, 'meta', 'property', 'og:locale', 'content') === 'fr_FR')
  ok(`${tag} og-image.png : un PNG de 1200x630 de moins de 300 Ko`, fs.existsSync(path.join(dir, 'og-image.png')) && pngSize(path.join(dir, 'og-image.png')) === '1200x630' && fs.statSync(path.join(dir, 'og-image.png')).size < 300 * 1024)

  // --- icônes (des fichiers : Google n'affiche pas les icônes en data:)
  const iconFiles = ['favicon.svg', 'favicon-96.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']
  ok(`${tag} icônes présentes en fichiers et aucune icône « data: »`, iconFiles.every((f) => fs.existsSync(path.join(dir, f))) && !/rel="icon"[^>]*href="data:/.test(html))
  ok(`${tag} tailles des icônes : 96, 180, 192, 512`, ['favicon-96.png:96x96', 'apple-touch-icon.png:180x180', 'icon-192.png:192x192', 'icon-512.png:512x512'].every((s) => { const [f, z] = s.split(':'); return pngSize(path.join(dir, f)) === z }))
  let manifest = null
  try { manifest = JSON.parse(read('site.webmanifest')) } catch { /* ci-dessous */ }
  ok(`${tag} site.webmanifest valide, avec ses icônes`, !!manifest && manifest.name === '1/1 Cards' && manifest.icons.every((i) => fs.existsSync(path.join(dir, i.src.replace(/^\//, '')))))

  // --- données structurées
  let ld = null
  try { ld = JSON.parse((html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1]) } catch { /* ci-dessous */ }
  const types = (ld?.['@graph'] ?? []).map((n) => n['@type'])
  ok(`${tag} données structurées valides : WebSite et WebApplication, en français, sur ${c.site}`,
    !!ld && types.includes('WebSite') && types.includes('WebApplication') && ld['@graph'].every((n) => n.url === `${c.site}/` && n.inLanguage === 'fr-FR'))

  // --- page d'accueil pré-rendue : du vrai contenu SANS JavaScript
  const h1 = rootHtml.match(/<h1[ >]/g) || []
  const h2 = rootHtml.match(/<h2[ >]/g) || []
  ok(`${tag} page d'accueil pré-rendue : exactement un <h1> et au moins 4 <h2>`, h1.length === 1 && h2.length >= 4, `h1=${h1.length} h2=${h2.length}`)
  ok(`${tag} pas de <h3> avant le premier <h2> (hiérarchie des titres)`, rootHtml.indexOf('<h3') === -1 || rootHtml.indexOf('<h3') > rootHtml.indexOf('<h2'))
  const text = rootHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  ok(`${tag} le texte pré-rendu parle du jeu (boosters, cartes numérotées, album, marché, enchères) et fait plus de 1 500 caractères`,
    ['boosters', 'cartes numérotées', 'album', 'marché', 'enchères'].every((w) => text.includes(w)) && text.length > 1500, `longueur ${text.length}`)
  ok(`${tag} le formulaire de connexion est aussi pré-rendu (aucun saut d'affichage au chargement)`, /<form/.test(rootHtml) && /Se connecter/.test(rootHtml))
  ok(`${tag} pas de promesse chiffrée susceptible de changer dans le texte (nombre de boosters, prix)`, !/\b\d+\s*(boosters?|pièces?|€|euros?)/i.test(text.replace(/\d+\/\d+/g, '')))

  // --- robots.txt, plan du site, en-têtes
  const robotsTxt = read('robots.txt')
  const headers = read('_headers')
  // Blocs du fichier _headers (sans les lignes de commentaire), repérés par leur chemin
  const blocks = headers.split(/\n\s*\n/).map((b) => b.split('\n').filter((l) => l.trim() && !l.startsWith('#')).join('\n'))
  const block = (name) => blocks.find((b) => b.startsWith(name + '\n')) ?? ''
  ok(`${tag} _headers : les blocs « /* » et « /version.json » sont bien trouvés (le test n'est pas vide)`, block('/*').includes('X-Content-Type-Options') && block('/version.json').includes('Cache-Control'))
  if (c.open) {
    ok(`${tag} robots.txt : tout est exploré et le plan du site est déclaré`, /^User-agent: \*$/m.test(robotsTxt) && /^Allow: \/$/m.test(robotsTxt) && !/^Disallow: \/\s*$/m.test(robotsTxt) && robotsTxt.includes(`Sitemap: ${c.site}/sitemap.xml`))
    const sm = fs.existsSync(path.join(dir, 'sitemap.xml')) ? read('sitemap.xml') : ''
    ok(`${tag} sitemap.xml : XML bien formé avec l'accueil et sa date`, /^<\?xml/.test(sm) && sm.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"') && sm.includes(`<loc>${c.site}/</loc>`) && /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(sm) && (sm.match(/<url>/g) || []).length === (sm.match(/<\/url>/g) || []).length)
    ok(`${tag} en-têtes : le site n'est pas en noindex, mais version.json l'est`, !block('/*').includes('X-Robots-Tag') && block('/version.json').includes('X-Robots-Tag: noindex'))
    ok(`${tag} aucune trace de la préproduction (pp.1o1cards.cc, « préprod ») dans l'accueil, robots.txt et plan du site`, !/pp\.1o1cards\.cc|préprod/i.test(html + robotsTxt + sm))
    ok(`${tag} le titre ne mentionne pas la préproduction`, !/préprod/i.test(title))
  } else {
    ok(`${tag} robots.txt : tout est interdit`, /^User-agent: \*$/m.test(robotsTxt) && /^Disallow: \/\s*$/m.test(robotsTxt) && !/^Allow: \//m.test(robotsTxt) && !/Sitemap:/i.test(robotsTxt))
    ok(`${tag} aucun sitemap.xml`, !fs.existsSync(path.join(dir, 'sitemap.xml')))
    ok(`${tag} en-têtes : noindex, nofollow sur tout le site`, block('/*').includes('X-Robots-Tag: noindex, nofollow'))
    ok(`${tag} le titre indique la préproduction`, /préprod/i.test(title))
    ok(`${tag} la préproduction ne désigne JAMAIS l'adresse de production (canonique, partage, données structurées)`, !/https:\/\/1o1cards\.cc/.test(html))
  }
}

console.log(bad ? `\n${bad} ÉCHEC(S)` : '\nRéférencement : tous les contrôles sont passés.')
process.exit(bad ? 1 : 0)

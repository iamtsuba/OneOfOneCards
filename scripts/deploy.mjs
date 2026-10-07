// Publie le site d'un environnement sur la branche gh-pages (GitHub Pages) sans toucher à l'autre :
//   prod    -> racine du site              (https://1o1cards.cc/)
//   preprod -> dossier /preprod/           (https://1o1cards.cc/preprod/)
// Le fichier CNAME (domaine personnalisé) et le dossier de l'autre environnement sont conservés.
//
//   node scripts/deploy.mjs <prod|preprod> [--yes] [--dry-run] [--no-build] [--remote URL] [--branch gh-pages] [--cname 1o1cards.cc]
//
// Accès : variable GITHUB_TOKEN (jeton avec droit « Contents : read and write » sur le dépôt) et, si besoin, GITHUB_REPO
// (défaut iamtsuba/OneOfOneCards). --remote remplace les deux (utile pour tester avec un dépôt local).
// La production exige --yes : c'est un garde-fou contre un déploiement accidentel.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, execSync } from 'node:child_process'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const args = process.argv.slice(2)
const env = args[0]
const flag = (n) => args.includes(`--${n}`)
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d }

if (!['prod', 'preprod'].includes(env)) { console.error('Usage : node scripts/deploy.mjs <prod|preprod> [--yes] [--dry-run] [--no-build]'); process.exit(2) }
if (env === 'prod' && !flag('yes') && !flag('dry-run')) { console.error('Déploiement en PRODUCTION : relance avec --yes pour confirmer.'); process.exit(2) }

const branch = opt('branch', 'gh-pages')
const repo = process.env.GITHUB_REPO || 'iamtsuba/OneOfOneCards'
const token = process.env.GITHUB_TOKEN || ''
let remote = opt('remote', process.env.DEPLOY_REMOTE || '')
if (!remote) {
  if (!token) { console.error('GITHUB_TOKEN manquant (ou passe --remote).'); process.exit(2) }
  remote = `https://x-access-token:${token}@github.com/${repo}.git`
}
const mask = (s) => (token ? String(s).replaceAll(token, '***') : String(s))
const git = (cwd, ...a) => {
  try {
    return execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (e) {
    throw new Error(mask(`git ${a[0]} a échoué : ${(e.stderr || e.message).toString().trim()}`))
  }
}

// 1. Compilation
const dist = path.join(root, 'dist', env)
if (!flag('no-build')) execSync(`npm run build:${env}`, { cwd: root, stdio: 'inherit' })
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error(`dist/${env}/index.html introuvable : compile d'abord (npm run build:${env}).`); process.exit(1) }

// 2. Étiquette de version (permet de savoir quel code est en ligne)
let commit = 'inconnu', dirty = false, srcBranch = ''
try {
  commit = git(root, 'rev-parse', 'HEAD'); srcBranch = git(root, 'rev-parse', '--abbrev-ref', 'HEAD')
  dirty = git(root, 'status', '--porcelain', '--', '.', ':!dist').length > 0
} catch { /* hors dépôt git */ }
const version = { app: '1/1 Cards', env, commit, branch: srcBranch, dirty, builtAt: new Date().toISOString() }
fs.writeFileSync(path.join(dist, 'version.json'), JSON.stringify(version, null, 2) + '\n')
if (env === 'prod' && dirty && !flag('dry-run')) { console.error('Modifications non commitées : commite avant de déployer en production.'); process.exit(1) }

// 3. Récupère la branche publiée (ou en crée une vide)
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'o1o-deploy-'))
try {
  let exists = true
  try { git(os.tmpdir(), 'clone', '--quiet', '--branch', branch, '--single-branch', '--depth', '1', remote, work) } catch (e) {
    exists = false
    fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work)
    git(work, 'init', '--quiet'); git(work, 'checkout', '--quiet', '--orphan', branch); git(work, 'remote', 'add', 'origin', remote)
  }
  git(work, 'config', 'user.name', process.env.GIT_AUTHOR_NAME || '1/1 Cards deploy')
  git(work, 'config', 'user.email', process.env.GIT_AUTHOR_EMAIL || 'noreply@users.noreply.github.com')

  const entries = (d) => fs.readdirSync(d).filter((n) => n !== '.git')
  const copyDir = (from, to) => { fs.mkdirSync(to, { recursive: true }); fs.cpSync(from, to, { recursive: true }) }

  if (env === 'prod') {
    // remplace la racine, en gardant le domaine (CNAME) et la préproduction
    for (const n of entries(work)) if (!['CNAME', 'preprod'].includes(n)) fs.rmSync(path.join(work, n), { recursive: true, force: true })
    copyDir(dist, work)
  } else {
    fs.rmSync(path.join(work, 'preprod'), { recursive: true, force: true })
    copyDir(dist, path.join(work, 'preprod'))
  }
  if (!fs.existsSync(path.join(work, '.nojekyll'))) fs.writeFileSync(path.join(work, '.nojekyll'), '')
  const cname = opt('cname', '')
  if (cname && !fs.existsSync(path.join(work, 'CNAME'))) fs.writeFileSync(path.join(work, 'CNAME'), cname + '\n')

  // 4. Commit et publication
  git(work, 'add', '-A')
  const changed = git(work, 'status', '--porcelain').split('\n').filter(Boolean).length
  const domain = fs.existsSync(path.join(work, 'CNAME')) ? fs.readFileSync(path.join(work, 'CNAME'), 'utf8').trim() : ''
  const [owner, name] = repo.split('/')
  const base = domain ? `https://${domain}/` : `https://${owner}.github.io/${name}/`
  const url = env === 'prod' ? base : `${base}preprod/`
  if (!changed) { console.log(`Rien à déployer : ${env} est déjà à jour (${url}).`); process.exit(0) }
  git(work, 'commit', '--quiet', '-m', `Déploiement ${env} ${commit.slice(0, 7)}${dirty ? ' (modifs locales)' : ''} ${version.builtAt}`)
  if (flag('dry-run')) { console.log(`[simulation] ${changed} fichier(s) seraient publiés pour ${env} :`); console.log(git(work, 'show', '--stat', '--format=', 'HEAD').split('\n').slice(-6).join('\n')); process.exit(0) }
  git(work, 'push', '--quiet', 'origin', `HEAD:${branch}`)
  console.log(`Déployé : ${env} (commit ${commit.slice(0, 7)}, ${changed} fichier(s) modifiés${exists ? '' : ', branche créée'})\n  ${url}\n  ${url}version.json`)
} finally {
  fs.rmSync(work, { recursive: true, force: true })
}

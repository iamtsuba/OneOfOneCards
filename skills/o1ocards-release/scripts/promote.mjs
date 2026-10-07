#!/usr/bin/env node
// Livraison de la préproduction vers la production pour 1/1 Cards.
//
//   node promote.mjs status                       versions en ligne (prod et préprod) et avance de preprod sur main
//   node promote.mjs plan  [--out DIR]            ce qui va être livré, vérifications, fichiers SQL/fonctions à présenter
//   node promote.mjs apply --yes [--merge]        fusionne preprod dans main, crée une étiquette, déploie la production
//   node promote.mjs rollback <étiquette> --yes   redéploie le site de production d'une version précédente
//
// Options : --repo owner/nom (défaut iamtsuba/OneOfOnePack)  --remote URL (remplace --repo/GITHUB_TOKEN, pour tester)
//           --dir DOSSIER (copie de travail réutilisable)  --skip-install  --reuse-modules DOSSIER  --skip-tests
// Accès : variable GITHUB_TOKEN (jeton « Contents : read and write » sur le dépôt). Le jeton n'est jamais affiché.
// Ce script ne touche JAMAIS à la base de données : le SQL est préparé pour que l'utilisateur l'exécute lui-même.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const [cmd = 'help', ...rest] = process.argv.slice(2)
const flag = (n) => rest.includes(`--${n}`)
const opt = (n, d) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : d }

const repo = opt('repo', process.env.GITHUB_REPO || 'iamtsuba/OneOfOnePack')
const token = process.env.GITHUB_TOKEN || ''
let remote = opt('remote', process.env.DEPLOY_REMOTE || '')
if (!remote) {
  if (!token && cmd !== 'help') { console.error('GITHUB_TOKEN manquant : demande un jeton à l\'utilisateur (Contents : read and write sur le dépôt), ou passe --remote.'); process.exit(2) }
  remote = `https://x-access-token:${token}@github.com/${repo}.git`
}
const mask = (s) => { s = String(s); if (token) s = s.replaceAll(token, '***'); return s.replace(/x-access-token:[^@]+@/g, 'x-access-token:***@') }

function run(command, args, { cwd, inherit = false, allowFail = false } = {}) {
  const r = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0', DEPLOY_REMOTE: remote }, stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0 && !allowFail) throw new Error(mask(`${command} ${args.slice(0, 3).join(' ')} a échoué : ${(r.stderr || r.stdout || '').toString().trim().slice(-600)}`))
  return { ok: r.status === 0, out: (r.stdout || '').toString().trim(), err: (r.stderr || '').toString().trim() }
}
const git = (cwd, ...a) => run('git', a, { cwd }).out
const gitTry = (cwd, ...a) => run('git', a, { cwd, allowFail: true })

// ---------- copie de travail ----------
function prepare() {
  let dir = opt('dir', '')
  if (dir && fs.existsSync(path.join(dir, '.git'))) {
    git(dir, 'remote', 'set-url', 'origin', remote)
  } else {
    dir = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'o1o-release-'))
    if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error(`${dir} existe et n'est pas un dépôt git`)
    run('git', ['clone', '--quiet', remote, dir])
  }
  git(dir, 'config', 'user.name', process.env.GIT_AUTHOR_NAME || '1/1 Cards release')
  git(dir, 'config', 'user.email', process.env.GIT_AUTHOR_EMAIL || 'noreply@users.noreply.github.com')
  git(dir, 'fetch', '--quiet', '--tags', '--force', 'origin', '+refs/heads/*:refs/remotes/origin/*')
  for (const b of ['main', 'preprod']) {
    if (!gitTry(dir, 'rev-parse', '--verify', `origin/${b}`).ok) throw new Error(`La branche ${b} n'existe pas sur le dépôt.`)
  }
  return dir
}
function install(dir) {
  const nm = path.join(dir, 'node_modules')
  if (fs.existsSync(nm)) return
  const reuse = opt('reuse-modules', '')
  if (reuse) { fs.symlinkSync(path.resolve(reuse), nm, 'dir'); return }
  if (flag('skip-install')) return
  console.log('Installation des dépendances (npm ci)…')
  run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir })
}
const short = (dir, ref) => git(dir, 'rev-parse', '--short', ref)

function deployed(dir, envName) {
  gitTry(dir, 'fetch', '--quiet', 'origin', '+refs/heads/gh-pages:refs/remotes/origin/gh-pages')
  const file = envName === 'prod' ? 'version.json' : 'preprod/version.json'
  const r = gitTry(dir, 'show', `origin/gh-pages:${file}`)
  if (!r.ok) return null
  try { return JSON.parse(r.out) } catch { return null }
}
const describeDeployed = (v, headSha) => (!v ? 'aucune version en ligne' : `commit ${String(v.commit).slice(0, 7)} (${v.branch || '?'}), compilé le ${v.builtAt}${headSha && v.commit !== headSha ? ' : DIFFÉRENT de la tête de branche' : ' : à jour'}`)

// ---------- status ----------
function status() {
  const dir = prepare()
  const main = git(dir, 'rev-parse', 'origin/main'), pre = git(dir, 'rev-parse', 'origin/preprod')
  const ahead = git(dir, 'rev-list', '--count', 'origin/main..origin/preprod'), behind = git(dir, 'rev-list', '--count', 'origin/preprod..origin/main')
  console.log(`Branche main (production) : ${main.slice(0, 7)}\nBranche preprod           : ${pre.slice(0, 7)}  (${ahead} commit(s) d'avance, ${behind} de retard sur main)`)
  console.log(`Site de production en ligne  : ${describeDeployed(deployed(dir, 'prod'), main)}`)
  console.log(`Site de préproduction en ligne : ${describeDeployed(deployed(dir, 'preprod'), pre)}`)
  const tags = git(dir, 'tag', '--list', 'release-*', '--sort=-creatordate').split('\n').filter(Boolean).slice(0, 5)
  console.log(`Dernières livraisons : ${tags.length ? tags.join(', ') : 'aucune'}`)
  return dir
}

// ---------- plan ----------
const DESTRUCTIVE = [
  [/\bdrop\s+table\b/i, 'suppression de table'],
  [/\bdrop\s+schema\b/i, 'suppression de schéma'],
  [/\balter\s+table\b[^;]*\bdrop\s+column\b/i, 'suppression de colonne'],
  [/\balter\s+table\b[^;]*\brename\b/i, 'renommage'],
  [/\btruncate\b/i, 'vidage de table'],
  [/\bdelete\s+from\b/i, 'suppression de lignes'],
  [/\bdrop\s+function\s+(?!if\s+exists)/i, 'suppression de fonction'],
  [/\bdrop\s+(policy|trigger|index)\s+(?!if\s+exists)/i, 'suppression de règle, déclencheur ou index'],
]
const hasDeno = (dir) => [process.env.DENO, path.join(dir, 'node_modules/.bin/deno')].some((p) => p && fs.existsSync(p)) || run('deno', ['--version'], { allowFail: true }).ok
const hasPg = () => fs.existsSync('/usr/lib/postgresql') || run('initdb', ['--version'], { allowFail: true }).ok

function plan() {
  const dir = prepare()
  const out = path.resolve(opt('out', 'release-out'))
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true })
  const main = 'origin/main', pre = 'origin/preprod'
  const commits = git(dir, 'log', '--no-merges', '--format=%h %s', `${main}..${pre}`).split('\n').filter(Boolean)
  const report = []
  const P = (s = '') => report.push(s)
  const result = { commits: commits.length, ok: true, warnings: [], checks: [], migrations: [], functions: [], destructive: [] }

  P('# Plan de livraison : préproduction → production\n')
  if (!commits.length) { P('Rien à livrer : `preprod` n\'a aucun commit d\'avance sur `main`.'); finish(); return }
  const ff = gitTry(dir, 'merge-base', '--is-ancestor', main, pre).ok
  P(`## Ce qui sera livré (${commits.length} commit(s))\n`); commits.slice(0, 40).forEach((c) => P(`- ${c}`)); if (commits.length > 40) P(`- … et ${commits.length - 40} autres`)
  if (!ff) { result.warnings.push('`main` contient des commits absents de `preprod` (correctif direct en production ?) : la livraison nécessitera une fusion (`apply --merge`) ; vérifie les conflits.'); }

  // fichiers modifiés par catégorie
  const files = git(dir, 'diff', '--name-only', main, pre).split('\n').filter(Boolean)
  const cat = (re) => files.filter((f) => re.test(f))
  P('\n## Fichiers modifiés\n')
  P(`- Application : ${cat(/^(src\/|index\.html|\.env\.|vite\.config|public\/)/).length} fichier(s)`)
  P(`- SQL : ${cat(/^supabase\/(schema|generated|migrations)/).length} fichier(s)`)
  P(`- Fonctions Edge : ${cat(/^supabase\/functions\//).length} fichier(s)`)
  P(`- Scripts, tests et documentation : ${cat(/^(scripts|tests|docs|README)/).length} fichier(s)`)

  // état du site de préproduction en ligne
  const preHead = git(dir, 'rev-parse', pre)
  const live = deployed(dir, 'preprod')
  P('\n## La préproduction en ligne correspond-elle au code livré ?\n')
  if (!live) result.warnings.push('Aucune version de préproduction en ligne : déploie-la (`npm run deploy:preprod`) et teste avant de livrer.')
  else if (live.commit !== preHead) result.warnings.push(`La préproduction en ligne (commit ${String(live.commit).slice(0, 7)}) n'est pas la tête de la branche preprod (${preHead.slice(0, 7)}) : redéploie-la et teste avant de livrer.`)
  P(`- ${describeDeployed(live, preHead)}`)

  // vérifications sur le code de preprod
  P('\n## Vérifications automatiques (sur le code de preprod)\n')
  git(dir, 'checkout', '--quiet', '-B', 'release-plan', pre)
  install(dir)
  const check = (name, command, args, { optional = false, skipIf = '' } = {}) => {
    if (skipIf) { result.checks.push({ name, status: 'ignoré', note: skipIf }); P(`- ${name} : ignoré (${skipIf})`); return }
    const r = run(command, args, { cwd: dir, allowFail: true })
    const status = r.ok ? 'ok' : optional ? 'avertissement' : 'échec'
    result.checks.push({ name, status })
    P(`- ${name} : ${r.ok ? 'OK' : optional ? 'AVERTISSEMENT' : 'ÉCHEC'}`)
    if (!r.ok) { P('  ```\n  ' + mask((r.err || r.out).split('\n').slice(-6).join('\n  ')) + '\n  ```'); if (!optional) result.ok = false }
  }
  const has = (f) => fs.existsSync(path.join(dir, f))
  check('SQL généré à jour', 'node', ['scripts/build-schema.mjs', '--check'], { skipIf: has('scripts/build-schema.mjs') ? '' : 'script absent' })
  check('Fonctions Edge générées à jour', 'node', ['scripts/build-functions.mjs', '--check'], { skipIf: has('scripts/build-functions.mjs') ? '' : 'script absent' })
  check('Compilation de la production', 'npm', ['run', 'build:prod'])
  const skipTests = flag('skip-tests')
  check('Tests du front', 'node', ['tests/front.test.mjs'], { skipIf: skipTests ? '--skip-tests' : has('tests/front.test.mjs') ? '' : 'test absent' })
  check('Tests des fonctions Edge', 'node', ['tests/functions.test.mjs'], { skipIf: skipTests ? '--skip-tests' : !has('tests/functions.test.mjs') ? 'test absent' : hasDeno(dir) ? '' : 'Deno absent (npm i --no-save deno)' })
  check('Tests SQL (prod et préprod, isolation)', 'bash', ['tests/run-sql.sh'], { skipIf: skipTests ? '--skip-tests' : !has('tests/run-sql.sh') ? 'test absent' : hasPg() ? '' : 'PostgreSQL absent (apt-get install -y postgresql)' })

  // SQL à exécuter en production
  P('\n## Base de données de production\n')
  P('Le SQL doit être exécuté **par l\'utilisateur** dans le SQL Editor de Supabase, **avant** la livraison du site.\n')
  const gen = 'supabase/generated/schema.prod.sql'
  const onMain = gitTry(dir, 'cat-file', '-e', `${main}:${gen}`).ok
  const migChanges = git(dir, 'diff', '--name-status', '--no-renames', main, pre, '--', 'supabase/migrations').split('\n').filter(Boolean).map((l) => l.split('\t'))
  const pendingMig = []
  for (const [st, f] of migChanges) {
    if (st === 'D') continue
    const base = path.basename(f)
    const src = base.endsWith('.template.sql') ? `supabase/generated/migrations/${base.replace('.template.sql', '.prod.sql')}` : f
    pendingMig.push({ status: st, source: f, run: src })
  }
  pendingMig.sort((a, b) => a.run.localeCompare(b.run))
  const lineStat = onMain ? git(dir, 'diff', '--shortstat', main, pre, '--', gen) : 'fichier nouveau (toute la structure)'
  if (pendingMig.length) {
    P('**Étape 1 — migrations à exécuter une seule fois, dans cet ordre :**\n')
    pendingMig.forEach((m, i) => { P(`${i + 1}. \`${m.run}\` (${m.status === 'A' ? 'nouvelle' : 'modifiée'})`); fs.copyFileSync(path.join(dir, m.run), path.join(out, path.basename(m.run))); result.migrations.push(m.run) })
  } else P('Aucune nouvelle migration.')
  P(`\n**Étape ${pendingMig.length ? 2 : 1} — schéma de production** : \`${gen}\` (${lineStat || 'inchangé'}). Relançable sans risque.`)
  fs.copyFileSync(path.join(dir, gen), path.join(out, 'schema.prod.sql'))

  // relecture des instructions sensibles
  const added = []
  for (const f of [gen, ...pendingMig.map((m) => m.run)]) {
    const d = onMain || f !== gen ? git(dir, 'diff', '--unified=0', main, pre, '--', f) : fs.readFileSync(path.join(dir, f), 'utf8').split('\n').map((l) => '+' + l).join('\n')
    d.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++') && !l.trimStart().slice(1).trimStart().startsWith('--')).forEach((l) => added.push([f, l.slice(1).trim()]))
  }
  const seen = new Set()
  for (const [f, l] of added) for (const [re, why] of DESTRUCTIVE) if (re.test(l) && !seen.has(l)) { seen.add(l); result.destructive.push({ file: path.basename(f), why, line: l.slice(0, 140) }) }
  if (result.destructive.length) {
    P('\n**À relire avant d\'exécuter** (instructions qui suppriment, vident ou renomment : normales pour une migration, dangereuses sinon) :\n')
    result.destructive.slice(0, 15).forEach((d) => P(`- ${d.why} — \`${d.line}\` (${d.file})`))
    if (result.destructive.length > 15) P(`- … ${result.destructive.length - 15} autre(s) dans les fichiers`)
  }
  P('\n> Avant toute migration qui supprime ou renomme des données : vérifier qu\'une sauvegarde de la base existe (Supabase > Database > Backups).')

  // fonctions Edge
  const fnChanges = git(dir, 'diff', '--name-status', '--no-renames', main, pre, '--', 'supabase/functions').split('\n').filter(Boolean).map((l) => l.split('\t'))
  const prodFns = {}
  for (const [st, f] of fnChanges) {
    const m = f.match(/^supabase\/functions\/((?:o1ocards|opennumber)-[a-z-]+)\/index\.ts$/)
    if (m) prodFns[m[1]] = st
  }
  P('\n## Fonctions Edge de production\n')
  const redeploy = Object.entries(prodFns).filter(([, st]) => st !== 'D').map(([n]) => n)
  if (redeploy.length) {
    P('À (re)déployer dans Supabase avec **Verify JWT désactivé** (code présenté en fichiers) :\n')
    for (const n of redeploy) { P(`- \`${n}\` (${prodFns[n] === 'A' ? 'nouvelle' : 'modifiée'})`); fs.copyFileSync(path.join(dir, `supabase/functions/${n}/index.ts`), path.join(out, `${n}.ts`)); result.functions.push(n) }
  } else P('Aucune fonction de production modifiée.')
  const removed = Object.entries(prodFns).filter(([, st]) => st === 'D').map(([n]) => n)
  if (removed.length) P(`\nFonctions supprimées du code (à supprimer dans Supabase une fois la livraison validée) : ${removed.map((n) => `\`${n}\``).join(', ')}`)

  finish()

  function finish() {
    P('\n## Avertissements\n')
    if (result.warnings.length) result.warnings.forEach((w) => P(`- ${w}`)); else P('Aucun.')
    P(`\n## Verdict\n\n${result.ok && !result.warnings.length ? '**Prêt à livrer** (après exécution du SQL et déploiement des fonctions listés ci-dessus).' : result.ok ? '**Livrable avec réserves** : lis les avertissements.' : '**NE PAS LIVRER** : au moins une vérification a échoué.'}`)
    const md = report.join('\n')
    fs.writeFileSync(path.join(out, 'plan.md'), md + '\n'); fs.writeFileSync(path.join(out, 'plan.json'), JSON.stringify(result, null, 2) + '\n')
    console.log(md); console.log(`\n(fichiers à présenter dans ${out})`)
    process.exitCode = result.ok ? 0 : 1
  }
}

// ---------- apply ----------
function apply() {
  if (!flag('yes')) { console.error('Livraison en PRODUCTION : relance avec --yes après confirmation explicite de l\'utilisateur.'); process.exit(2) }
  const dir = prepare()
  const commits = git(dir, 'log', '--no-merges', '--format=%h %s', 'origin/main..origin/preprod').split('\n').filter(Boolean)
  if (!commits.length) { console.log('Rien à livrer : preprod n\'a aucun commit d\'avance sur main.'); return }
  git(dir, 'checkout', '--quiet', '-B', 'main', 'origin/main')
  const ff = gitTry(dir, 'merge-base', '--is-ancestor', 'origin/main', 'origin/preprod').ok
  if (ff) git(dir, 'merge', '--ff-only', '--quiet', 'origin/preprod')
  else if (flag('merge')) git(dir, 'merge', '--no-ff', '--quiet', '-m', 'Livraison de la préproduction en production', 'origin/preprod')
  else { console.error('main a des commits absents de preprod : fusion impossible sans --merge. Vérifie ce qu\'il contient (git log preprod..main) avant de continuer.'); process.exit(1) }
  install(dir)
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-').slice(0, 13)
  const tag = `release-${stamp}`
  git(dir, 'tag', '-a', tag, '-m', `Livraison ${tag}\n\n${commits.slice(0, 30).join('\n')}`)
  git(dir, 'push', '--quiet', 'origin', 'main'); git(dir, 'push', '--quiet', 'origin', tag)
  console.log(`main mis à jour (${short(dir, 'HEAD')}), étiquette ${tag} poussée. Déploiement du site de production…`)
  run('node', ['scripts/deploy.mjs', 'prod', '--yes'], { cwd: dir, inherit: true })
  const v = deployed(dir, 'prod'), head = git(dir, 'rev-parse', 'HEAD')
  console.log(`\nVérification : ${describeDeployed(v, head)}`)
  console.log(`\nLivraison terminée : ${tag}\nÀ faire maintenant : parcourir la liste de contrôle de la production (connexion, ouverture d'un booster, collection, marché, boutique).\nRetour arrière du site : node promote.mjs rollback ${tag} --yes   (voir le SKILL.md pour la base de données)`)
  if (!v || v.commit !== head) process.exitCode = 1
}

// ---------- rollback ----------
function rollback() {
  const tag = rest.find((a) => !a.startsWith('--'))
  if (!tag) { console.error('Usage : promote.mjs rollback <étiquette> --yes   (étiquettes : promote.mjs status)'); process.exit(2) }
  if (!flag('yes')) { console.error('Retour arrière en PRODUCTION : relance avec --yes après confirmation explicite de l\'utilisateur.'); process.exit(2) }
  const dir = prepare()
  if (!gitTry(dir, 'rev-parse', '--verify', `refs/tags/${tag}`).ok) { console.error(`Étiquette ${tag} introuvable.`); process.exit(1) }
  git(dir, 'checkout', '--quiet', '--detach', `refs/tags/${tag}`)
  install(dir)
  run('node', ['scripts/deploy.mjs', 'prod', '--yes'], { cwd: dir, inherit: true })
  console.log(`\nSite de production remis dans l'état de ${tag}. La branche main n'a pas changé : crée un commit de retour (git revert) si la version précédente doit y rester.\nLa base de données n'est PAS modifiée : une migration déjà exécutée ne s'annule pas avec cette commande.`)
}

try {
  if (cmd === 'status') status()
  else if (cmd === 'plan') plan()
  else if (cmd === 'apply') apply()
  else if (cmd === 'rollback') rollback()
  else { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 15).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')) }
} catch (e) {
  console.error(mask(e.message)); process.exit(1)
}

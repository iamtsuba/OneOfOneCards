#!/usr/bin/env node
// Livraison de la préproduction vers la production pour 1/1 Cards.
//
//   node promote.mjs status                       avance de preprod sur main et état des déploiements Cloudflare
//   node promote.mjs plan  [--out DIR]            ce qui va être livré, vérifications, fichiers SQL/fonctions à présenter
//   node promote.mjs apply --yes [--merge]        fusionne preprod dans main, crée une étiquette, pousse : Cloudflare publie la production
//   node promote.mjs rollback <étiquette> --yes   remet main (donc le site) dans l'état d'une livraison précédente
//
// Le site est hébergé sur Cloudflare Pages, relié au dépôt : un push sur main publie https://1o1cards.cc/, un push sur preprod publie
// https://pp.1o1cards.cc/. Ce script ne déploie donc rien lui-même : il fusionne, étiquette, pousse, puis suit le déploiement.
//
// Options : --repo owner/nom (défaut iamtsuba/OneOfOneCards)  --remote URL (remplace --repo/GITHUB_TOKEN, pour tester)
//           --dir DOSSIER (copie de travail réutilisable)  --skip-install  --reuse-modules DOSSIER  --skip-tests  --wait SECONDES (suivi du déploiement, défaut 420)
// Accès : variable GITHUB_TOKEN (jeton « Contents : read and write » sur le dépôt). Le jeton n'est jamais affiché.
// Ce script ne touche JAMAIS à la base de données : le SQL est préparé pour que l'utilisateur l'exécute lui-même.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const [cmd = 'help', ...rest] = process.argv.slice(2)
const flag = (n) => rest.includes(`--${n}`)
const opt = (n, d) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : d }

const repo = opt('repo', process.env.GITHUB_REPO || 'iamtsuba/OneOfOneCards')
const SITES = { prod: 'https://1o1cards.cc/', preprod: 'https://pp.1o1cards.cc/' }
const token = process.env.GITHUB_TOKEN || ''
let remote = opt('remote', process.env.PROMOTE_REMOTE || '')
if (!remote) {
  if (!token && cmd !== 'help') { console.error('GITHUB_TOKEN manquant : demande un jeton à l\'utilisateur (Contents : read and write sur le dépôt), ou passe --remote.'); process.exit(2) }
  remote = `https://x-access-token:${token}@github.com/${repo}.git`
}
const mask = (s) => { s = String(s); if (token) s = s.replaceAll(token, '***'); return s.replace(/x-access-token:[^@]+@/g, 'x-access-token:***@') }

function run(command, args, { cwd, inherit = false, allowFail = false } = {}) {
  const r = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
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

// Suivi du déploiement Cloudflare Pages : l'intégration GitHub de Cloudflare publie des « déploiements » et des états sur chaque commit.
// Meilleur effort : si GitHub n'en expose aucun (ou en test avec --remote), on renvoie « indisponible » et on demande de contrôler version.json.
const normalize = (state) => {
  const x = String(state || '').toLowerCase()
  if (['success', 'neutral', 'skipped'].includes(x)) return 'ok'
  if (['failure', 'error', 'cancelled', 'timed_out', 'action_required', 'inactive'].includes(x)) return 'échec'
  if (['pending', 'in_progress', 'queued', 'waiting', 'requested'].includes(x)) return 'en cours'
  return 'inconnu'
}
async function ciInfo(sha) {
  if (!token || remote.startsWith('file:')) return { available: false, items: [] }
  const api = async (p) => {
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}/${p}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'o1ocards-release' } })
      return r.ok ? await r.json() : null
    } catch { return null }
  }
  const items = []
  const isCf = (...v) => v.some((x) => /cloudflare|pages\.dev|o1ocards/i.test(String(x || '')))
  for (const c of (await api(`commits/${sha}/check-runs?per_page=50`))?.check_runs ?? [])
    if (isCf(c.name, c.details_url, c.app?.slug, c.app?.name)) items.push({ name: c.name, state: normalize(c.status === 'completed' ? c.conclusion : c.status), url: c.details_url || c.html_url })
  for (const st of (await api(`commits/${sha}/status`))?.statuses ?? [])
    if (isCf(st.context, st.target_url)) items.push({ name: st.context, state: normalize(st.state), url: st.target_url })
  for (const d of (await api(`deployments?sha=${sha}&per_page=10`)) ?? []) {
    if (!isCf(d.creator?.login, d.environment, d.description)) continue
    const last = ((await api(`deployments/${d.id}/statuses?per_page=1`)) ?? [])[0]
    items.push({ name: `Déploiement ${d.environment}`, state: normalize(last?.state), url: last?.environment_url || last?.target_url || '' })
  }
  return { available: true, items }
}
const describeCi = (info) => (!info.available ? 'suivi indisponible depuis ici' : !info.items.length ? 'aucun déploiement Cloudflare trouvé pour ce commit' : info.items.map((i) => `${i.name} : ${i.state}${i.url ? ` (${i.url})` : ''}`).join(' ; '))
async function waitDeploy(sha, seconds) {
  const info0 = await ciInfo(sha)
  if (!info0.available) return { state: 'indisponible', info: info0 }
  const t0 = Date.now()
  for (;;) {
    const info = await ciInfo(sha)
    if (info.items.length && info.items.every((i) => i.state === 'ok' || i.state === 'échec')) return { state: info.items.some((i) => i.state === 'échec') ? 'échec' : 'ok', info }
    if (!info.items.length && Date.now() - t0 > 150000) return { state: 'aucun', info }
    if (Date.now() - t0 > seconds * 1000) return { state: 'délai dépassé', info }
    await new Promise((r) => setTimeout(r, 15000))
  }
}

// ---------- status ----------
async function status() {
  const dir = prepare()
  const main = git(dir, 'rev-parse', 'origin/main'), pre = git(dir, 'rev-parse', 'origin/preprod')
  const ahead = git(dir, 'rev-list', '--count', 'origin/main..origin/preprod'), behind = git(dir, 'rev-list', '--count', 'origin/preprod..origin/main')
  console.log(`Branche main (production)  : ${main.slice(0, 7)}  -> ${SITES.prod}\nBranche preprod            : ${pre.slice(0, 7)}  -> ${SITES.preprod}  (${ahead} commit(s) d'avance, ${behind} de retard sur main)`)
  console.log(`Déploiement de main (prod)    : ${describeCi(await ciInfo(main))}`)
  console.log(`Déploiement de preprod (préprod) : ${describeCi(await ciInfo(pre))}`)
  console.log(`Pour savoir quel code est en ligne : ouvrir ${SITES.prod}version.json et ${SITES.preprod}version.json (champ « commit »).`)
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

async function plan() {
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

  // la préproduction publiée correspond-elle au code livré ?
  const preHead = git(dir, 'rev-parse', pre)
  const live = await ciInfo(preHead)
  P('\n## La préproduction en ligne correspond-elle au code livré ?\n')
  if (!live.available || !live.items.length) result.warnings.push(`Le déploiement de la préproduction n'est pas vérifiable d'ici : ouvre ${SITES.preprod}version.json et vérifie que le commit commence par ${preHead.slice(0, 7)}, puis teste le site avant de livrer.`)
  else if (live.items.some((i) => i.state === 'échec')) result.warnings.push('Le dernier déploiement de la préproduction a ÉCHOUÉ côté Cloudflare : corrige-le avant de livrer.')
  else if (live.items.some((i) => i.state !== 'ok')) result.warnings.push('Le déploiement de la préproduction est encore en cours ou dans un état inconnu : attends sa fin et teste le site.')
  P(`- ${describeCi(live)}`)

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
  check('Compilation de la production (comme le fera Cloudflare)', 'npm', ['run', 'build:prod'])
  const skipTests = flag('skip-tests')
  check('Tests du front', 'node', ['tests/front.test.mjs'], { skipIf: skipTests ? '--skip-tests' : has('tests/front.test.mjs') ? '' : 'test absent' })
  check('Tests des fonctions Edge', 'node', ['tests/functions.test.mjs'], { skipIf: skipTests ? '--skip-tests' : !has('tests/functions.test.mjs') ? 'test absent' : hasDeno(dir) ? '' : 'Deno absent (npm i --no-save deno)' })
  check('Tests SQL (prod et préprod, isolation)', 'bash', ['tests/run-sql.sh'], { skipIf: skipTests ? '--skip-tests' : !has('tests/run-sql.sh') ? 'test absent' : hasPg() ? '' : 'PostgreSQL absent (apt-get install -y postgresql)' })

  // SQL à exécuter en production
  P('\n## Base de données de production\n')
  P('Le SQL doit être exécuté **par l\'utilisateur** dans le SQL Editor de Supabase, **avant** la livraison du site (le push sur `main` publie le site automatiquement).\n')
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
async function apply() {
  if (!flag('yes')) { console.error('Livraison en PRODUCTION : relance avec --yes après confirmation explicite de l\'utilisateur.'); process.exit(2) }
  const dir = prepare()
  const commits = git(dir, 'log', '--no-merges', '--format=%h %s', 'origin/main..origin/preprod').split('\n').filter(Boolean)
  if (!commits.length) { console.log('Rien à livrer : preprod n\'a aucun commit d\'avance sur main.'); return }
  git(dir, 'checkout', '--quiet', '-B', 'main', 'origin/main')
  const ff = gitTry(dir, 'merge-base', '--is-ancestor', 'origin/main', 'origin/preprod').ok
  if (ff) git(dir, 'merge', '--ff-only', '--quiet', 'origin/preprod')
  else if (flag('merge')) git(dir, 'merge', '--no-ff', '--quiet', '-m', 'Livraison de la préproduction en production', 'origin/preprod')
  else { console.error('main a des commits absents de preprod : fusion impossible sans --merge. Vérifie ce qu\'il contient (git log preprod..main) avant de continuer.'); process.exit(1) }
  // Cloudflare compilera main : on s'assure d'abord que la compilation de production réussit, avant de pousser
  install(dir)
  console.log('Compilation de contrôle de la production…')
  run('npm', ['run', 'build:prod'], { cwd: dir })
  const head = git(dir, 'rev-parse', 'HEAD')
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-').slice(0, 13)
  const tag = `release-${stamp}`
  git(dir, 'tag', '-a', tag, '-m', `Livraison ${tag}\n\n${commits.slice(0, 30).join('\n')}`)
  git(dir, 'push', '--quiet', 'origin', 'main'); git(dir, 'push', '--quiet', 'origin', tag)
  console.log(`main mis à jour (${head.slice(0, 7)}), étiquette ${tag} poussée. Cloudflare publie ${SITES.prod}…`)
  const res = await waitDeploy(head, Number(opt('wait', '420')))
  console.log(`\nSuivi du déploiement : ${res.state}${res.info.items.length ? ' — ' + describeCi(res.info) : ''}`)
  if (['indisponible', 'aucun'].includes(res.state)) console.log(`Le suivi automatique n'est pas possible : ouvre ${SITES.prod}version.json dans une à deux minutes ; le commit doit commencer par ${head.slice(0, 7)}.`)
  console.log(`\nLivraison poussée : ${tag}\nÀ faire maintenant : parcourir la liste de contrôle de la production (connexion, ouverture d'un booster, collection, marché, boutique).\nRetour arrière : tableau de bord Cloudflare > projet de production > Deployments > Rollback (immédiat), ou node promote.mjs rollback ${tag} --yes`)
  if (['échec', 'délai dépassé'].includes(res.state)) process.exitCode = 1
}

// ---------- rollback ----------
async function rollback() {
  const tag = rest.find((a) => !a.startsWith('--'))
  if (!tag) { console.error('Usage : promote.mjs rollback <étiquette> --yes   (étiquettes : promote.mjs status)'); process.exit(2) }
  if (!flag('yes')) { console.error('Retour arrière en PRODUCTION : relance avec --yes après confirmation explicite de l\'utilisateur.'); process.exit(2) }
  const dir = prepare()
  if (!gitTry(dir, 'rev-parse', '--verify', `refs/tags/${tag}`).ok) { console.error(`Étiquette ${tag} introuvable.`); process.exit(1) }
  git(dir, 'checkout', '--quiet', '-B', 'main', 'origin/main')
  // Un nouveau commit qui remet exactement les fichiers de l'étiquette (l'historique est conservé, aucun push forcé)
  git(dir, 'read-tree', '--reset', '-u', `refs/tags/${tag}`)
  const changed = git(dir, 'status', '--porcelain').split('\n').filter(Boolean).length
  if (!changed) { console.log(`main est déjà dans l'état de ${tag} : rien à faire.`); return }
  git(dir, 'commit', '--quiet', '-m', `Retour à ${tag}`)
  const head = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'push', '--quiet', 'origin', 'main')
  console.log(`main remis dans l'état de ${tag} (commit ${head.slice(0, 7)}, ${changed} fichier(s) modifiés). Cloudflare publie ${SITES.prod}…`)
  const res = await waitDeploy(head, Number(opt('wait', '420')))
  console.log(`Suivi du déploiement : ${res.state}${res.info.items.length ? ' — ' + describeCi(res.info) : ''}`)
  console.log(`\nLa base de données n'est PAS modifiée : une migration déjà exécutée ne s'annule pas avec cette commande.\nPour un retour immédiat sans passer par Git : Cloudflare > projet de production > Deployments > Rollback.`)
}

try {
  if (cmd === 'status') await status()
  else if (cmd === 'plan') await plan()
  else if (cmd === 'apply') await apply()
  else if (cmd === 'rollback') await rollback()
  else { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 15).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')) }
} catch (e) {
  console.error(mask(e.message)); process.exit(1)
}

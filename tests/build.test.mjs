// Teste scripts/post-build.mjs : version.json, en-têtes HTTP, noindex en préproduction et garde-fou « production seulement depuis main ».
//   node tests/build.test.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
let bad = 0
const ok = (name, cond, extra = '') => { console.log(cond ? 'OK  ' : 'FAIL', name, cond ? '' : extra); if (!cond) bad++ }

// Copie minimale du projet dans un dossier temporaire pour ne pas écraser les vrais builds
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'o1o-build-'))
fs.mkdirSync(path.join(tmp, 'scripts'))
fs.copyFileSync(path.join(root, 'scripts/post-build.mjs'), path.join(tmp, 'scripts/post-build.mjs'))
for (const e of ['prod', 'preprod']) { fs.mkdirSync(path.join(tmp, 'dist', e), { recursive: true }); fs.writeFileSync(path.join(tmp, 'dist', e, 'index.html'), '<html></html>') }

const run = (env, extraEnv = {}) =>
  spawnSync('node', ['scripts/post-build.mjs', env], { cwd: tmp, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, ...extraEnv } })
const read = (e, f) => fs.readFileSync(path.join(tmp, 'dist', e, f), 'utf8')

let r = run('prod', { CF_PAGES: '1', CF_PAGES_BRANCH: 'main', CF_PAGES_COMMIT_SHA: 'abc1234567' })
ok('prod depuis main sur Cloudflare : build accepté', r.status === 0, r.stderr)
const v = JSON.parse(read('prod', 'version.json'))
ok('version.json : environnement, commit, branche et hébergeur', v.env === 'prod' && v.commit === 'abc1234567' && v.branch === 'main' && v.host === 'cloudflare-pages' && !!v.builtAt)
const hp = read('prod', '_headers')
ok('_headers prod : sécurité et cache des fichiers compilés', hp.includes('X-Content-Type-Options: nosniff') && hp.includes('/assets/*') && hp.includes('immutable') && hp.includes('/version.json'))
ok('_headers prod : pas de noindex (site référençable)', !hp.includes('X-Robots-Tag'))

r = run('prod', { CF_PAGES: '1', CF_PAGES_BRANCH: 'preprod', CF_PAGES_COMMIT_SHA: 'def' })
ok('prod depuis la branche preprod sur Cloudflare : build REFUSÉ', r.status === 1 && /refusé/.test(r.stderr), r.stderr)
r = run('prod', { CF_PAGES: '1', CF_PAGES_BRANCH: 'feature-x', CF_PAGES_COMMIT_SHA: 'def' })
ok('prod depuis une branche de travail : build REFUSÉ', r.status === 1)
r = run('prod', { CF_PAGES: '1', CF_PAGES_BRANCH: 'feature-x', ALLOW_PROD_BUILD_FROM_ANY_BRANCH: '1' })
ok('prod : le garde-fou peut être levé volontairement', r.status === 0)
r = run('prod', {})
ok('prod en local (hors Cloudflare) : pas de blocage', r.status === 0 && JSON.parse(read('prod', 'version.json')).host === 'local')

r = run('preprod', { CF_PAGES: '1', CF_PAGES_BRANCH: 'preprod', CF_PAGES_COMMIT_SHA: '9999999' })
ok('préprod depuis preprod : build accepté', r.status === 0, r.stderr)
const hq = read('preprod', '_headers')
ok('_headers préprod : noindex, nofollow', hq.includes('X-Robots-Tag: noindex, nofollow'))
ok('version.json préprod : environnement preprod', JSON.parse(read('preprod', 'version.json')).env === 'preprod')
r = run('autre')
ok('environnement inconnu : refusé', r.status === 2)

fs.rmSync(tmp, { recursive: true, force: true })
console.log(bad ? `\n${bad} ÉCHEC(S)` : '\nBuild : tous les contrôles sont passés.')
process.exit(bad ? 1 : 0)

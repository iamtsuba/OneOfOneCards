// Catalogue gardé dans le navigateur : on ne demande que l'empreinte, et le catalogue complet seulement s'il a changé.
//   node tests/catalog-cache.test.mjs
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Stockage du navigateur simulé
const store = new Map()
let quotaFull = false, storageBroken = false
const ls = {
  getItem: (k) => { if (storageBroken) throw new Error('denied'); return store.has(k) ? store.get(k) : null },
  setItem: (k, v) => { if (storageBroken) throw new Error('denied'); if (quotaFull) throw new Error('QuotaExceededError'); store.set(k, String(v)) },
  removeItem: (k) => { if (storageBroken) throw new Error('denied'); store.delete(k) },
}
globalThis.localStorage = ls
globalThis.window = { localStorage: ls, addEventListener() {}, location: { origin: 'https://pp.1o1cards.cc', pathname: '/' } }

// Serveur simulé
let version = 'v-aaa'
let versionStatus = 200        // 404 : serveur sans catalog_version
let versionBody = null         // surcharge du corps (ex. null)
let tableFail = null
const calls = []
const catalog = () => ({ categories: [{ id: 1, name: 'Collection ' + version }], types: [{ id: 5, name: 'Carte', image: 'https://abc.supabase.co/storage/v1/object/public/o1ocards-images/pp/types/x.webp' }], typeRarities: [{ type_id: 5, rarity_id: 'common', max_series: 10 }] })
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json', 'content-range': '0-0/*' } })
globalThis.fetch = async (url) => {
  const u = String(url)
  if (u.includes('/rpc/')) {
    calls.push('rpc:' + u.split('/rpc/')[1])
    if (versionStatus !== 200) return json({ message: 'Could not find the function', code: 'PGRST202' }, versionStatus)
    return json(versionBody !== null ? versionBody : version)
  }
  const t = u.split('/rest/v1/')[1]?.split('?')[0]
  calls.push('table:' + t)
  if (tableFail === t) return json({ message: 'boom' }, 500)
  const c = catalog()
  return json(t === 'pp_o1ocards_categories' ? c.categories : t === 'pp_o1ocards_types' ? c.types : t === 'pp_o1ocards_type_rarities' ? c.typeRarities : [])
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-cat-'))
await build({ entryPoints: [path.join(root, 'src/api.js')], bundle: true, format: 'esm', platform: 'node', outfile: path.join(out, 'a.mjs'), logLevel: 'silent',
  define: { 'import.meta.env': JSON.stringify({ MODE: 'preprod', VITE_APP_ENV: 'preprod', VITE_TABLE_PREFIX: 'pp_o1ocards_' }) } })
const api = await import(pathToFileURL(path.join(out, 'a.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const tables = () => calls.filter((c) => c.startsWith('table:')).length
const reset = () => { calls.length = 0 }
const KEY = 'o1o:catalog:v1:pp_o1ocards_'

// 1. premier chargement : empreinte + 3 tables, puis rangé
let d = await api.getCatalog()
ok('premier chargement : l\'empreinte est demandée, puis les 3 tables du catalogue', calls[0] === 'rpc:pp_o1ocards_catalog_version' && tables() === 3 && d.categories.length === 1 && d.types.length === 1 && d.typeRarities.length === 1)
ok('le catalogue est rangé dans le navigateur avec son empreinte (clé propre à l\'environnement)', store.has(KEY) && JSON.parse(store.get(KEY)).v === 'v-aaa' && JSON.parse(store.get(KEY)).data.categories[0].name === 'Collection v-aaa')
// 2. visites suivantes
reset()
d = await api.getCatalog(); const again = await api.getCatalog(); await api.getCatalog()
ok('visites suivantes (rien n\'a changé) : UNE seule petite demande d\'empreinte chaque fois, AUCUNE table téléchargée', calls.length === 3 && calls.every((c) => c === 'rpc:pp_o1ocards_catalog_version') && tables() === 0)
ok('et le catalogue rendu est bien celui du cache', d.categories[0].name === 'Collection v-aaa' && again.types[0].id === 5)
// 3. changement
version = 'v-bbb'; reset()
d = await api.getCatalog()
ok('le catalogue a changé (nouvelle empreinte) : les 3 tables sont retéléchargées et le cache mis à jour', tables() === 3 && d.categories[0].name === 'Collection v-bbb' && JSON.parse(store.get(KEY)).v === 'v-bbb')
reset(); await api.getCatalog()
ok('puis de nouveau plus rien à télécharger', tables() === 0)
// 4. serveur ancien
store.clear(); versionStatus = 404; reset()
d = await api.getCatalog(); await api.getCatalog()
ok('serveur sans catalog_version (SQL pas encore à jour) : comportement d\'avant, catalogue complet à chaque fois, rien n\'est mis en cache', tables() === 6 && !store.has(KEY) && d.types.length === 1)
versionStatus = 200
// 5. empreinte inutilisable
store.clear(); versionBody = null; reset()
versionBody = 12345
d = await api.getCatalog()
ok('empreinte qui n\'est pas un texte : pas de cache, catalogue complet', tables() === 3 && !store.has(KEY))
versionBody = ''
reset(); await api.getCatalog()
ok('empreinte vide : pas de cache, catalogue complet', tables() === 3 && !store.has(KEY))
versionBody = null
// 6. cache abîmé
for (const [name, raw] of [['JSON cassé', '{pas du json'], ['sans catalogue', JSON.stringify({ v: 'v-bbb' })], ['catalogue incomplet', JSON.stringify({ v: 'v-bbb', data: { categories: [], types: [] } })], ['empreinte absente', JSON.stringify({ data: catalog() })]]) {
  store.set(KEY, raw); reset()
  d = await api.getCatalog()
  ok(`cache abîmé (${name}) : ignoré, catalogue retéléchargé et cache réparé`, tables() === 3 && d.types.length === 1 && JSON.parse(store.get(KEY)).v === 'v-bbb' && Array.isArray(JSON.parse(store.get(KEY)).data.typeRarities))
}
// 7. navigateur sans stockage
store.clear(); quotaFull = true; reset()
d = await api.getCatalog()
ok('stockage plein : le catalogue est quand même rendu, sans erreur, sans cache', tables() === 3 && d.categories.length === 1 && !store.has(KEY))
quotaFull = false
storageBroken = true; reset()
d = await api.getCatalog(); await api.getCatalog()
ok('stockage interdit (navigation privée stricte) : le site marche, il retélécharge le catalogue à chaque fois', tables() === 6 && d.types.length === 1)
storageBroken = false
// 8. erreurs
store.clear(); tableFail = 'pp_o1ocards_types'; reset()
let err = null; try { await api.getCatalog() } catch (e) { err = e }
ok('une table qui échoue : l\'erreur remonte comme avant et rien n\'est mis en cache', !!err && !store.has(KEY))
tableFail = null
// 9. l'empreinte est demandée AVANT les tables, et sans arguments
store.clear(); reset(); await api.getCatalog()
ok('ordre : empreinte d\'abord (une demande, aucun argument secret), puis les tables', calls[0].startsWith('rpc:') && calls.slice(1).every((c) => c.startsWith('table:')))
// 10. empreinte qui change entre-temps : la prochaine visite se met à jour
version = 'v-ccc'; reset(); d = await api.getCatalog()
ok('toute nouvelle empreinte déclenche une mise à jour (ajout d\'une carte, changement d\'image…)', tables() === 3 && JSON.parse(store.get(KEY)).v === 'v-ccc')

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nCache du catalogue : tous les contrôles sont passés.')
process.exit(0)

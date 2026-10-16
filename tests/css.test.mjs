// Contrôle statique de src/styles.css. Une classe de taille ou d'état (md, sm, lg, big, small, on, mine, taken, wide, narrow, fill…) sert de
// modificateur à plusieurs composants (« brand md », « card md », « segmented small »…). Une règle qui la cible SEULE (« .md { … } ») s'applique
// alors à tous ces composants : c'est ce qui avait fait déborder la barre du haut sur toutes les pages mobiles. Ces classes ne doivent donc être
// stylées que combinées à leur composant (« .card.md », « .admin.wide »…).
//   node tests/css.test.mjs
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const SHARED = ['xs', 'sm', 'md', 'lg', 'xl', 'big', 'small', 'tiny', 'on', 'off', 'active', 'current', 'open', 'closed', 'mine', 'taken', 'new', 'wide', 'narrow', 'fill', 'full', 'compact', 'dim', 'ghost', 'light', 'accent']

let bad = 0
const ok = (name, cond, extra = '') => { console.log(cond ? 'OK  ' : 'FAIL', name, cond ? '' : extra); if (!cond) bad++ }

// Tous les sélecteurs (y compris à l'intérieur des @media)
const selectors = []
for (const m of css.matchAll(/([^{}@;]+)\{/g)) {
  const head = m[1].trim()
  if (!head || /^\d+%$|^(from|to)$/.test(head) || /^@/.test(head)) continue
  for (const sel of head.split(',')) selectors.push(sel.trim())
}
// Premier élément composé d'un sélecteur : « .md .x » -> « .md », « .card.md:hover » -> « .card.md:hover »
const first = (sel) => sel.split(/[\s>+~]+/)[0]
const offenders = []
for (const sel of selectors) {
  const f = first(sel)
  const m = f.match(/^\.([a-z][a-z0-9-]*)((?::{1,2}[a-z-]+(\([^)]*\))?)*)$/i)   // une seule classe, éventuellement avec pseudo-classes
  if (m && SHARED.includes(m[1])) offenders.push(sel)
}
ok(`aucune règle ne cible seule une classe partagée de taille ou d'état (${SHARED.length} surveillées)`, offenders.length === 0, `\n   ${[...new Set(offenders)].join('\n   ')}`)
ok('le CSS contient bien des sélecteurs à analyser (le test n\'est pas vide)', selectors.length > 300, `${selectors.length}`)
ok('les tailles de marque et de carte sont stylées combinées à leur composant', selectors.some((s) => /^\.brand\.lg/.test(s)) && selectors.some((s) => /^\.card\.md/.test(s) || /^\.card\.sm/.test(s)))

// Usages réels : toute classe de taille utilisée comme modificateur dans les composants ne doit pas être redéfinie nue par le CSS
const used = new Set()
for (const f of fs.readdirSync(path.join(root, 'src/components'))) {
  const src = fs.readFileSync(path.join(root, 'src/components', f), 'utf8')
  for (const m of src.matchAll(/className=\{?[`"']([^`"']*)[`"']/g)) for (const c of m[1].split(/\s+/)) if (SHARED.includes(c)) used.add(c)
}
ok(`les classes partagées réellement utilisées par les composants (${[...used].sort().join(', ')}) ne sont jamais stylées seules`, [...used].every((c) => !selectors.some((s) => first(s) === `.${c}`)))

// Contrôle négatif : le CSS qui avait provoqué le défaut serait refusé
const bug = '.md { display: grid; gap: 18px; }'
const test = (text) => { const out = []; for (const m of text.matchAll(/([^{}@;]+)\{/g)) for (const sel of m[1].split(',')) { const f = first(sel.trim()); const mm = f.match(/^\.([a-z][a-z0-9-]*)$/i); if (mm && SHARED.includes(mm[1])) out.push(sel.trim()) } return out }
ok('contrôle négatif : « .md { … } » serait détecté, « .card.md { … } » et « .admin-md { … } » non', test(bug).length === 1 && test('.card.md { display: block; } .admin-md { display: grid; }').length === 0)

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nCSS : tous les contrôles sont passés.')

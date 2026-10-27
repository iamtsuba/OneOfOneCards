// Pseudo -> adresse technique (connexion par pseudo, sans email) : format, casse, anciens comptes.
//   node tests/pseudo.test.mjs
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const out = mkdtempSync(path.join(root, 'tests', '.out-pseudo-'))
await build({ entryPoints: [path.join(root, 'src/pseudo.js')], bundle: true, format: 'esm', platform: 'node', outfile: path.join(out, 'p.mjs'), logLevel: 'silent' })
const { PSEUDO_DOMAIN, pseudoProblem, isValidPseudo, pseudoToEmail, isPseudoEmail, loginEmail } = await import(pathToFileURL(path.join(out, 'p.mjs')).href)
rmSync(out, { recursive: true, force: true })

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }

ok('domaine technique : pseudo.1o1cards.cc', PSEUDO_DOMAIN === 'pseudo.1o1cards.cc')
ok('pseudos valides : lettres, chiffres, _ - . à l\'intérieur, 2 à 24 caractères', ['ab', 'Tom', 'a_b-c.d', 'Tom.Hanks', 'X1', '_x_', '-ok-', 'a'.repeat(24), '  Tom  '].every(isValidPseudo))
ok('pseudos refusés : trop courts ou trop longs, vides, nuls', ['', 'a', 'a'.repeat(25), '   ', null, undefined].every((p) => !isValidPseudo(p)))
ok('pseudos refusés : espace, accent, symbole, emoji, « @ », « / », « + »', ['Tom Hanks', 'Éric', 'a@b', 'a/b', 'a+b', 'a:b', 'tom😀', 'to m', 'à la', 'ça'].every((p) => !isValidPseudo(p)))
ok('point : refusé au début, à la fin ou doublé (l\'adresse serait invalide)', ['.tom', 'tom.', 'to..m', '..', 'a...b'].every((p) => !isValidPseudo(p)) && isValidPseudo('t.o.m'))
ok('messages : longueur, puis caractères ; aucun message pour un pseudo valide', /entre 2 et 24 caractères/.test(pseudoProblem('a')) && /lettres sans accent/.test(pseudoProblem('Tom Hanks')) && pseudoProblem('Tom') === '')

ok('adresse technique : pseudo en minuscules + domaine', pseudoToEmail('Tom') === 'tom@pseudo.1o1cards.cc' && pseudoToEmail('  A_b-C.d ') === 'a_b-c.d@pseudo.1o1cards.cc')
ok('« Tom », « tom » et « TOM » sont le même compte (même adresse)', new Set(['Tom', 'tom', 'TOM', ' tOm ']).size === 4 && new Set(['Tom', 'tom', 'TOM', ' tOm '].map(pseudoToEmail)).size === 1)
ok('deux pseudos différents donnent deux adresses différentes (pas de collision)', new Set(['tom', 'tom_', 'tom-', 'tom.1', 'tom1', 't.om'].map(pseudoToEmail)).size === 6)
ok('l\'adresse d\'un pseudo valide ne contient que des caractères sûrs avant le domaine', ['Tom', 'a_b-c.d', 'X1', '_x_', '-ok-', 'a'.repeat(24)].every((p) => /^[a-z0-9_.-]+@pseudo\.1o1cards\.cc$/.test(pseudoToEmail(p))))
ok('reconnaître une adresse technique (casse et espaces ignorés), pas un vrai email', isPseudoEmail('tom@pseudo.1o1cards.cc') && isPseudoEmail(' TOM@Pseudo.1o1cards.cc ') && !isPseudoEmail('tom@gmail.com') && !isPseudoEmail('tom@1o1cards.cc') && !isPseudoEmail('tom@xpseudo.1o1cards.cc.fr') && !isPseudoEmail(null) && !isPseudoEmail(undefined) && !isPseudoEmail(''))
ok('connexion : un pseudo valide donne son adresse technique', loginEmail('Tom') === 'tom@pseudo.1o1cards.cc' && loginEmail('  tom.hanks ') === 'tom.hanks@pseudo.1o1cards.cc')
ok('connexion d\'un ancien compte : un identifiant avec « @ » est gardé tel quel (sans espaces autour)', loginEmail('ancien@test.fr') === 'ancien@test.fr' && loginEmail('  Ancien@Test.fr ') === 'Ancien@Test.fr')
ok('connexion : ni pseudo valide ni email = rien (pas d\'appel au service)', ['Tom Hanks', 'Éric', '.tom', 'x', '', null].every((v) => loginEmail(v) === null))

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nPseudo et adresse technique : tous les contrôles sont passés.')

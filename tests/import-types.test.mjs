// Teste le lecteur du fichier d'import de types (src/importTypes.js), sans navigateur ni réseau.
//   node tests/import-types.test.mjs
import { parseTypesFile, TEMPLATE_CSV, MAX_ROWS } from '../src/importTypes.js'

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }

// Modèle téléchargeable : se relit sans erreur
const tpl = parseTypesFile(TEMPLATE_CSV)
ok('modèle : 3 lignes valides (BOM, en-tête, point-virgule)', tpl.rows.length === 3 && tpl.rows.every((r) => !r.error))
ok('modèle : emoji et https reconnus', tpl.rows[0].kind === 'emoji' && tpl.rows[2].kind === 'url' && tpl.rows[1].position === 2)

// Séparateurs : virgule, tabulation ; sans en-tête ; fins de ligne Windows
ok('virgule sans en-tête', parseTypesFile('Rugby,4,🏉\nGolf,5,⛳').rows.map((r) => r.name).join() === 'Rugby,Golf')
ok('tabulation', parseTypesFile('nom\tposition\timage\nRugby\t4\t🏉').rows[0].image === '🏉')
ok('fins de ligne Windows et ligne vide ignorée', parseTypesFile('Rugby;1;🏉\r\n\r\nGolf;2;⛳\r\n').rows.length === 2)

// En-tête : les titres réordonnent les colonnes
const re = parseTypesFile('image;nom;position\n🏉;Rugby;4').rows[0]
ok('en-tête : colonnes réordonnées', re.name === 'Rugby' && re.position === 4 && re.image === '🏉')

// Guillemets : séparateur dans un nom, guillemets doublés
const q = parseTypesFile('nom;position;image\n"Tennis; de table";2;🏓\n"Le ""Roi"""; 3;').rows
ok('guillemets : séparateur dans un nom', q[0].name === 'Tennis; de table')
ok('guillemets doublés', q[1].name === 'Le "Roi"' && q[1].position === 3 && q[1].kind === 'none')

// Champs facultatifs
const opt = parseTypesFile('Football').rows[0]
ok('nom seul : position et image facultatives', !opt.error && opt.position === null && opt.image === '' && opt.kind === 'none')

// Erreurs, avec le numéro de ligne du fichier (en-tête compris)
const err = parseTypesFile('nom;position;image\nOK;1;⚽\n;2;⚽\nFoot;abc;⚽\nHttp;3;http://x.fr/a.png\nJs;4;javascript:alert(1)\nLong;5;ceciestbeaucouptroplong').rows
ok('nom manquant, ligne 3', err[1].line === 3 && /nom manquant/.test(err[1].error))
ok('position invalide, ligne 4', err[2].line === 4 && /position/.test(err[2].error))
ok('http:// refusé', /https/.test(err[3].error))
ok('javascript: refusé', !!err[4].error)
ok('image trop longue refusée', !!err[5].error)
ok('ligne valide intacte', !err[0].error)

// Doublons (dans le fichier et avec la catégorie), casse ignorée
const dup = parseTypesFile('Foot;1;⚽\nfoot;2;⚽\nTennis;3;🎾', ['TENNIS']).rows
ok('doublon dans le fichier signalé', !dup[0].duplicate && dup[1].duplicate)
ok('doublon avec la catégorie signalé', dup[2].duplicate)

// Limites et fichiers vides
ok('fichier vide', parseTypesFile('  \n ').fileError !== '')
ok('en-tête seul', parseTypesFile('nom;position;image').fileError !== '')
ok(`plus de ${MAX_ROWS} lignes refusé`, parseTypesFile(Array.from({ length: MAX_ROWS + 1 }, (_, i) => `T${i}`).join('\n')).fileError !== '')

if (bad) { console.error(`\n${bad} contrôle(s) en échec`); process.exit(1) }
console.log('\nImport de types : tous les contrôles sont passés.')

// Teste le lecteur du fichier d'import de types (src/importTypes.js), sans navigateur ni réseau.
//   node tests/import-types.test.mjs
import { parseTypesFile, TEMPLATE_CSV, MAX_ROWS, makeTemplate, matchPhotos, photoKey, describeRarities } from '../src/importTypes.js'

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

// Doublons (dans le fichier et avec la collection), casse ignorée
const dup = parseTypesFile('Foot;1;⚽\nfoot;2;⚽\nTennis;3;🎾', ['TENNIS']).rows
ok('doublon dans le fichier signalé', !dup[0].duplicate && dup[1].duplicate)
ok('doublon avec la collection signalé', dup[2].duplicate)

// Limites et fichiers vides
ok('fichier vide', parseTypesFile('  \n ').fileError !== '')
ok('en-tête seul', parseTypesFile('nom;position;image').fileError !== '')
ok(`plus de ${MAX_ROWS} lignes refusé`, parseTypesFile(Array.from({ length: MAX_ROWS + 1 }, (_, i) => `T${i}`).join('\n')).fileError !== '')

// ---------- Raretés, secret, photos ----------
const R = [{ id: 'legende', name: 'Légende' }, { id: 'ultra', name: 'Ultra Rare' }, { id: 'super', name: 'Super Rare' }, { id: 'rare', name: 'Rare' }, { id: 'common', name: 'Commune' }]
const one = (line, rar = R, existing = []) => parseTypesFile(`nom;position;image;secret;raretes\n${line}`, existing, rar).rows[0]
const full = one('Football;1;⚽;non;ultra:50:5:fullart|super:100:1|common:500:0')
ok('raretés : séries, numérotées et style lus (ultra 50/5 FullArt, super 100/1 Simple, commune 500/0)',
  !full.error && JSON.stringify(full.rarities) === JSON.stringify([
    { rarity_id: 'ultra', max_series: 50, numbered_series: 5, card_style: 'fullart' },
    { rarity_id: 'super', max_series: 100, numbered_series: 1, card_style: 'simple' },
    { rarity_id: 'common', max_series: 500, numbered_series: 0, card_style: 'simple' }]) && full.secret === false)
const byName = one('Tennis;3;;oui;Ultra Rare:20:20:FullArt|commune:300')
ok('raretés : le nom ou l’identifiant, sans souci d’accents ni de casse ; « Full Art » accepté', !byName.error && byName.rarities[0].rarity_id === 'ultra' && byName.rarities[0].card_style === 'fullart' && byName.rarities[1].rarity_id === 'common')
ok('raretés : « numérotées » omis = tous les numéros visibles, style omis = Simple', byName.rarities[1].numbered_series === 300 && byName.rarities[1].card_style === 'simple')
ok('raretés : « Légende » (avec accent) reconnue sans accent', one('A;1;;;legende:20:20').rarities[0].rarity_id === 'legende' && one('A;1;;;LÉGENDE:20:20').rarities[0].rarity_id === 'legende')
ok('raretés : une rareté à 0 série est acceptée si une autre a des séries', !one('A;1;;;ultra:0|common:10').error && one('A;1;;;ultra:0|common:10').rarities.length === 2)
ok('raretés : cellule vide = réglages par défaut (rarities null)', one('A;1;⚽;;').rarities === null && !one('A;1;⚽;;').error)
ok('secret : oui / non / vide', one('A;1;;oui;').secret === true && one('A;1;;non;').secret === false && one('A;1;;;').secret === false && one('A;1;;X;').secret === true)
const bads = {
  'rareté inconnue': one('A;1;;;platine:10'),
  'séries manquantes': one('A;1;;;ultra'),
  'séries non numériques': one('A;1;;;ultra:beaucoup'),
  'numérotées > séries': one('A;1;;;ultra:10:20'),
  'style inconnu': one('A;1;;;ultra:10:5:holo'),
  'même rareté deux fois': one('A;1;;;ultra:10|Ultra Rare:20'),
  'tout à 0 série': one('A;1;;;ultra:0|common:0'),
  'plus de 5000 séries': one('A;1;;;ultra:5001'),
  'trop de champs': one('A;1;;;ultra:10:5:fullart:x'),
  'secret incompréhensible': one('A;1;;peut-être;'),
}
for (const [name, r] of Object.entries(bads)) ok(`erreur claire : ${name}`, !!r.error && r.rarities === null || (name === 'secret incompréhensible' && !!r.error))
ok('erreur : le message nomme la rareté fautive', /platine/.test(bads['rareté inconnue'].error) && /ultra/i.test(bads['numérotées > séries'].error + bads['séries manquantes'].error))
ok('erreur : plusieurs problèmes d’une même ligne sont tous annoncés', /rareté inconnue/.test(one('A;1;;;platine:10|ultra:x').error) && /séries invalide/.test(one('A;1;;;platine:10|ultra:x').error))
ok('sans liste de raretés : une cellule de raretés est signalée (pas ignorée en silence)', /indisponibles/.test(parseTypesFile('nom;raretes\nA;ultra:10', [], []).rows[0].error))
ok('colonnes réordonnées par l’en-tête (raretés avant image)', (() => { const r = parseTypesFile('nom;raretes;image;secret\nA;ultra:10:5:fullart;🏉;oui', [], R).rows[0]; return !r.error && r.image === '🏉' && r.secret && r.rarities[0].card_style === 'fullart' })())
ok('résumé lisible des raretés', describeRarities(full.rarities, R) === 'Ultra Rare 50/5 num. FullArt · Super Rare 100/1 num. · Commune 500 non num.')
// Photos
ok('photoKey : extension, accents, casse, _ - . ignorés', photoKey('Chat_Va-Pas.PNG') === 'chat va pas' && photoKey('éléphant.jpeg') === 'elephant' && photoKey('Le  Chat.webp') === 'le chat')
const rowsP = parseTypesFile('nom;image\nChat va;\nChien;🐶\nRaté;http://x', [], R).rows
const m = matchPhotos([{ name: 'chat_va.png' }, { name: 'CHIEN.jpg' }, { name: 'Raté.png' }, { name: 'inconnu.png' }, { name: 'chat va.webp' }], rowsP, [{ id: 7, name: 'Oiseau' }])
ok('photos : rapprochées d’une ligne du fichier par le nom (même si la ligne a déjà un emoji)', m[0].target?.kind === 'row' && m[0].target.name === 'Chat va' && m[1].target?.kind === 'row' && m[1].target.name === 'Chien')
ok('photos : une ligne en erreur ou inconnue n’est pas rapprochée', m[2].target === null && m[3].target === null)
ok('photos : une 2e photo pour le même type est signalée en double', m[4].target?.name === 'Chat va' && m[4].duplicate === true && m[0].duplicate === false)
const mx = matchPhotos([{ name: 'oiseau.png' }, { name: 'Chat va.png' }], parseTypesFile('Chat va', ['Chat va'], R).rows, [{ id: 7, name: 'Oiseau' }, { id: 8, name: 'Chat va' }])
ok('photos : un type déjà présent voit sa photo mise à jour (ligne ignorée comme doublon -> type existant)', mx[0].target?.kind === 'existing' && mx[0].target.id === 7 && mx[1].target?.kind === 'existing' && mx[1].target.id === 8)
// Modèle complet généré avec les raretés réelles
const mt = parseTypesFile(makeTemplate(R), [], R)
ok('modèle complet : 4 lignes lues sans erreur avec les raretés du jeu', mt.rows.length === 4 && mt.rows.every((r) => !r.error), mt.rows.map((r) => r.error).join('|'))
ok('modèle complet : utilise les noms réels (première, deuxième et dernière rareté)', /Légende:50:5:fullart\|Ultra Rare:100:1\|Commune:500:0/.test(makeTemplate(R)))
ok('modèle complet : fonctionne même sans liste de raretés (noms d’exemple)', parseTypesFile(makeTemplate([]), [], [{ id: 'ultra', name: 'Ultra Rare' }, { id: 'super', name: 'Super Rare' }, { id: 'common', name: 'Commune' }]).rows.every((r) => !r.error))

if (bad) { console.error(`\n${bad} contrôle(s) en échec`); process.exit(1) }
console.log('\nImport de types : tous les contrôles sont passés.')

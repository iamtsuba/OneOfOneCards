// Teste src/bands.js avec les MÊMES cas que tests/sql/10_type_rarities.template.sql (cohérence client / base).
//   node tests/bands.test.mjs
import { bandsOf, numberVisible, typeSeries, checklistNumbers, defaultBands, validateTypeRarities } from '../src/bands.js'

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Type A : six raretés ; type B (secret) : Légende seule sur 100 séries ; type C : aucun réglage propre
const A = [
  { rarity_id: 'legende', max_series: 20, numbered_series: 10 }, { rarity_id: 'ultra', max_series: 100, numbered_series: 1 },
  { rarity_id: 'super', max_series: 200, numbered_series: 1 }, { rarity_id: 'rare', max_series: 300, numbered_series: 1 },
  { rarity_id: 'peu_commune', max_series: 400, numbered_series: 1 }, { rarity_id: 'common', max_series: 500, numbered_series: 0 },
]
const B = [{ rarity_id: 'legende', max_series: 100, numbered_series: 10 }]

ok('tranches du type A (mêmes bornes que type_bands)', eq(bandsOf([...A].reverse()).map((b) => [b.rarity_id, b.lo, b.hi, b.numbered]), [
  ['legende', 1, 20, 10], ['ultra', 21, 100, 1], ['super', 101, 200, 1], ['rare', 201, 300, 1], ['peu_commune', 301, 400, 1], ['common', 401, 500, 0],
]))

// m -> visible pour A, B, C : identique au tableau « numéros visibles » du test SQL
const cases = { 1: [true, true, true], 10: [true, true, true], 11: [false, false, true], 20: [false, false, true], 21: [true, false, true],
  22: [false, false, true], 101: [true, true, true], 102: [false, true, true], 401: [false, true, true], 402: [false, true, true], 500: [false, true, true] }
for (const [m, [a, b, c]] of Object.entries(cases)) {
  ok(`série ${m} : A ${a ? 'visible' : 'masqué'}, B ${b ? 'visible' : 'masqué'}, C (sans réglage) ${c ? 'visible' : 'masqué'}`,
    numberVisible(A, Number(m)) === a && numberVisible(B, Number(m)) === b && numberVisible([], Number(m)) === c && numberVisible(undefined, Number(m)) === c)
}
ok('Commune non numérotée (0) : jamais visible', [401, 450, 500].every((m) => !numberVisible(A, m)))

ok('nombre de séries : celui du type, sinon celui de la catégorie', typeSeries({ series_count: 100 }, { series_count: 500 }) === 100 && typeSeries({ series_count: null }, { series_count: 500 }) === 500)

// Checklist : Chat Eau 1/2, Chat Peau 2/2, Chat Iny (secret) 3/2 ; une autre catégorie reste indépendante
const cl = checklistNumbers([
  { id: 1, category_id: 1, position: 1, secret: false }, { id: 2, category_id: 1, position: 2, secret: true },
  { id: 3, category_id: 1, position: 3, secret: false }, { id: 4, category_id: 2, position: 1, secret: false },
])
ok('checklist : types normaux numérotés dans l’ordre', eq(cl[1], { no: 1, total: 2, secret: false }) && eq(cl[3], { no: 2, total: 2, secret: false }))
ok('checklist : le secret passe au-delà du total (ex. 51/50)', eq(cl[2], { no: 3, total: 2, secret: true }))
ok('checklist : une autre catégorie est indépendante', eq(cl[4], { no: 1, total: 1, secret: false }))


// Seuils par défaut : seuils globaux, la dernière (null) couvre le reste ; plafonnés à la taille de la catégorie
const cat = { id: 7, series_count: 500 }
const glob = [{ id: 'ultra', max_series: 35 }, { id: 'super', max_series: 100 }, { id: 'rare', max_series: 250 }, { id: 'common', max_series: null }]
ok('seuils par défaut (la dernière couvre le reste)', eq(defaultBands(glob, cat).map((b) => [b.rarity_id, b.lo, b.hi]), [['ultra', 1, 35], ['super', 36, 100], ['rare', 101, 250], ['common', 251, 500]]))
ok('seuils plafonnés à la taille de la catégorie, « le reste » reste la dernière tranche (cf. test SQL)', eq(defaultBands(glob, { id: 7, series_count: 60 }).map((b) => [b.rarity_id, b.lo, b.hi]), [['ultra', 1, 35], ['super', 36, 60]]))

// Validation : mêmes refus que admin_save_type_rarities (cf. test SQL)
ok('validation : modèle du type A accepté', validateTypeRarities(A.map((r) => ({ ...r, max_series: String(r.max_series), numbered_series: String(r.numbered_series) }))) === '')
ok('validation : vide refusé', validateTypeRarities([]) !== '')
ok('validation : même taille maximale refusée', validateTypeRarities([{ rarity_id: 'ultra', max_series: 50 }, { rarity_id: 'super', max_series: 50 }]) !== '')
ok('validation : même rareté deux fois refusée', validateTypeRarities([{ rarity_id: 'ultra', max_series: 50 }, { rarity_id: 'ultra', max_series: 80 }]) !== '')
ok('validation : numérotées au-delà de la tranche refusé', validateTypeRarities([{ rarity_id: 'ultra', max_series: 50, numbered_series: 51 }]) !== '')
ok('validation : numérotées = taille de la tranche accepté (tous les numéros visibles)', validateTypeRarities([{ rarity_id: 'ultra', max_series: 50, numbered_series: 50 }]) === '')
ok('validation : décimal refusé', validateTypeRarities([{ rarity_id: 'ultra', max_series: '50.5' }]) !== '')
ok('validation : la 2e tranche compte sa propre taille', validateTypeRarities([{ rarity_id: 'ultra', max_series: 20, numbered_series: 20 }, { rarity_id: 'rare', max_series: 30, numbered_series: 11 }]) !== '')

if (bad) { console.error(`\n${bad} contrôle(s) en échec`); process.exit(1) }
console.log('\nRaretés par type (client) : tous les contrôles sont passés.')

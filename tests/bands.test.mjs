// Teste src/bands.js avec les MÊMES cas que tests/sql/10_type_rarities.template.sql (cohérence client / base) :
// chaque rareté a ses propres séries 1..max ; numéros visibles de la série 1 à la série numérotée de CETTE rareté.
//   node tests/bands.test.mjs
import { numberVisible, typeSeries, cardCount, checklistNumbers, defaultConfig, validateTypeRarities, cardStyle, CARD_STYLES } from '../src/bands.js'

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// Type A : six raretés aux séries indépendantes ; type B (secret) : Légende seule sur 100 séries
const A = [
  { rarity_id: 'legende', max_series: 20, numbered_series: 10 }, { rarity_id: 'ultra', max_series: 100, numbered_series: 5 },
  { rarity_id: 'super', max_series: 200, numbered_series: 1 }, { rarity_id: 'rare', max_series: 300, numbered_series: 1 },
  { rarity_id: 'peu_commune', max_series: 400, numbered_series: 1 }, { rarity_id: 'common', max_series: 500, numbered_series: 0 },
]
const B = [{ rarity_id: 'legende', max_series: 100, numbered_series: 10 }]

// Tableau « numéros visibles PAR RARETÉ » du test SQL : m -> [Légende, Ultra, Super, Commune]
const cases = { 1: [true, true, true, false], 5: [true, true, false, false], 6: [true, false, false, false],
  10: [true, false, false, false], 11: [false, false, false, false], 20: [false, false, false, false] }
for (const [m, [l, u, su, c]] of Object.entries(cases)) {
  const n = Number(m)
  ok(`série ${m} : Légende ${l ? 'visible' : 'masquée'}, Ultra ${u ? 'visible' : 'masquée'}, Super ${su ? 'visible' : 'masquée'}, Commune ${c ? 'visible' : 'masquée'}`,
    numberVisible(A, 'legende', n) === l && numberVisible(A, 'ultra', n) === u && numberVisible(A, 'super', n) === su && numberVisible(A, 'common', n) === c)
}
ok('le numéro dépend de la rareté de base : la même série 4 est visible en Ultra Rare (≤5) mais masquée en Super Rare (≤1)', numberVisible(A, 'ultra', 4) && !numberVisible(A, 'super', 4))
ok('type B : Légende visible jusqu’à la série 10 seulement', numberVisible(B, 'legende', 10) && !numberVisible(B, 'legende', 11))
ok('sans réglage propre ou rareté inconnue : toujours visible', numberVisible([], 'ultra', 400) && numberVisible(undefined, 'ultra', 400) && numberVisible(B, 'ultra', 400))
ok('Commune non numérotée (0) : jamais visible', [1, 2, 500].every((m) => !numberVisible(A, 'common', m)))

ok('nombre de séries : celui du type, sinon celui de la collection', typeSeries({ series_count: 100 }, { series_count: 500 }) === 100 && typeSeries({ series_count: null }, { series_count: 500 }) === 500)
ok('nombre de cartes d’une rareté : 1 + 2 + … + N (50 séries = 1 275 cartes ; Légende 20 = 210)', cardCount(50) === 1275 && cardCount(20) === 210 && cardCount(1) === 1)

// Réglages par défaut (type C du test SQL) : chaque rareté 1..max_series, « le reste » = séries de la collection
const glob = [{ id: 'legende', max_series: 20 }, { id: 'ultra', max_series: 35 }, { id: 'super', max_series: 100 }, { id: 'rare', max_series: 250 },
  { id: 'peu_commune', max_series: 400 }, { id: 'common', max_series: null }]
ok('réglages par défaut : 20, 35, 100, 250, 400, 500 séries (comme le type C du test SQL)', eq(defaultConfig(glob, { series_count: 500 }).map((r) => r.max_series), [20, 35, 100, 250, 400, 500]))
ok('réglages par défaut plafonnés à la taille de la collection (60) : 20, 35, 60, 60, 60, 60', eq(defaultConfig(glob, { series_count: 60 }).map((r) => r.max_series), [20, 35, 60, 60, 60, 60]))
ok('réglages par défaut : tous les numéros visibles', defaultConfig(glob, { series_count: 500 }).every((r) => r.numbered_series === Infinity))

// Checklist : Chat Eau 1/2, Chat Peau 2/2, Chat Iny (secret) 3/2 ; une autre collection reste indépendante
const cl = checklistNumbers([
  { id: 1, category_id: 1, position: 1, secret: false }, { id: 2, category_id: 1, position: 2, secret: true },
  { id: 3, category_id: 1, position: 3, secret: false }, { id: 4, category_id: 2, position: 1, secret: false },
])
ok('checklist : types normaux numérotés dans l’ordre', eq(cl[1], { no: 1, total: 2, secret: false }) && eq(cl[3], { no: 2, total: 2, secret: false }))
ok('checklist : le secret passe au-delà du total (ex. 51/50)', eq(cl[2], { no: 3, total: 2, secret: true }))
ok('checklist : une autre collection est indépendante', eq(cl[4], { no: 1, total: 1, secret: false }))

// Validation : mêmes règles que admin_save_type_rarities (cf. test SQL) ; aucun ordre à respecter
const txt = (rows) => rows.map((r) => ({ ...r, max_series: String(r.max_series), numbered_series: String(r.numbered_series) }))
ok('validation : le modèle du type A est accepté', validateTypeRarities(txt(A)) === '')
ok('validation : SANS ordre imposé, Super Rare avec moins de séries qu’Ultra Rare est accepté', validateTypeRarities([{ rarity_id: 'ultra', max_series: 100, numbered_series: 3 }, { rarity_id: 'super', max_series: 40, numbered_series: 0 }]) === '')
ok('validation : tableau vide refusé', validateTypeRarities([]) !== '')
ok('validation : même rareté deux fois refusée', validateTypeRarities([{ rarity_id: 'ultra', max_series: 50 }, { rarity_id: 'ultra', max_series: 80 }]) !== '')
ok('validation : numérotées au-delà du nombre de séries refusé (51 > 50)', validateTypeRarities([{ rarity_id: 'ultra', max_series: 50, numbered_series: 51 }]) !== '')
ok('validation : numérotées = nombre de séries accepté (tous visibles)', validateTypeRarities([{ rarity_id: 'ultra', max_series: 50, numbered_series: 50 }]) === '')
ok('validation : décimal, négatif et trop grand refusés', validateTypeRarities([{ rarity_id: 'ultra', max_series: '50.5' }]) !== '' && validateTypeRarities([{ rarity_id: 'ultra', max_series: -1 }, { rarity_id: 'super', max_series: 10 }]) !== '' && validateTypeRarities([{ rarity_id: 'ultra', max_series: 5001 }]) !== '')
// 0 série = la rareté n'existe pas pour ce type (une carte peut n'exister que dans une seule rareté)
ok('validation : 0 série accepté pour une rareté si une autre a des séries', validateTypeRarities([{ rarity_id: 'ultra', max_series: 0, numbered_series: 0 }, { rarity_id: 'super', max_series: 40, numbered_series: 0 }]) === '')
ok('validation : tout à 0 refusé (un type sans aucune carte)', validateTypeRarities([{ rarity_id: 'ultra', max_series: 0 }, { rarity_id: 'super', max_series: 0 }]) !== '')
ok('validation : des séries numérotées sans série sont refusées (3 > 0)', validateTypeRarities([{ rarity_id: 'ultra', max_series: 0, numbered_series: 3 }, { rarity_id: 'super', max_series: 40 }]) !== '')
ok('validation : une seule rareté dans tout le type est possible (ex. carte secrète en Légende seulement)', validateTypeRarities([{ rarity_id: 'legende', max_series: 100, numbered_series: 10 }, { rarity_id: 'ultra', max_series: '0' }, { rarity_id: 'common', max_series: '0' }]) === '')
ok('validation : une ligne sans rareté refusée', validateTypeRarities([{ rarity_id: '', max_series: 50 }]) !== '')

// Style de carte (Simple / FullArt) : par rareté de base d'un type ; Simple sans réglage
const styled = [{ rarity_id: 'ultra', max_series: 50, numbered_series: 5, card_style: 'fullart' }, { rarity_id: 'super', max_series: 100, numbered_series: 1, card_style: 'simple' }, { rarity_id: 'rare', max_series: 200, numbered_series: 20 }]
ok('style : Ultra Rare en FullArt, Super Rare en Simple, Rare sans style = Simple', cardStyle(styled, 'ultra') === 'fullart' && cardStyle(styled, 'super') === 'simple' && cardStyle(styled, 'rare') === 'simple')
ok('style : une rareté absente du type, un type sans réglage ou une valeur inconnue : Simple', cardStyle(styled, 'common') === 'simple' && cardStyle([], 'ultra') === 'simple' && cardStyle(undefined, 'ultra') === 'simple' && cardStyle([{ rarity_id: 'ultra', card_style: 'holo' }], 'ultra') === 'simple')
ok('style : deux choix, Simple et FullArt', CARD_STYLES.map((x) => x.id).join() === 'simple,fullart' && CARD_STYLES.map((x) => x.name).join() === 'Simple,FullArt')
ok('validation : un style Simple ou FullArt est accepté, un autre refusé', validateTypeRarities([{ rarity_id: 'ultra', max_series: 50, numbered_series: 5, card_style: 'fullart' }]) === '' && validateTypeRarities([{ rarity_id: 'ultra', max_series: 50, card_style: 'holo' }]) !== '' && validateTypeRarities([{ rarity_id: 'ultra', max_series: 50 }]) === '')

if (bad) { console.error(`\n${bad} contrôle(s) en échec`); process.exit(1) }
console.log('\nRaretés par type (client) : tous les contrôles sont passés.')

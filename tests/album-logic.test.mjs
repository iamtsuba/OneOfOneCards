// Teste src/albumLogic.js : statistiques d'album (Unique = bonus), sélecteur regroupé, bilan d'une pile.
//   node tests/album-logic.test.mjs
import { albumStats, pickerEntries, stackInfo, isBonus } from '../src/albumLogic.js'

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ---- Statistiques : l'exemple de la capture (2 cartes × 7 raretés de full set + 2 Unique bonus = 16 emplacements)
const rarityMap = {
  common: { id: 'common', kind: 'range', sort_order: 7 }, rare: { id: 'rare', kind: 'range', sort_order: 6 },
  omega: { id: 'omega', kind: 'omega', sort_order: 3 }, alpha: { id: 'alpha', kind: 'alpha', sort_order: 2 }, unique: { id: 'unique', kind: 'unique', sort_order: 1 },
}
const slot = (type, rarity, picked, owned = 0) => ({ type_id: type, rarity_id: rarity, pick_series: picked ? 10 : null, pick_number: picked ? 3 : null, owned_count: owned })
const rows = []
for (const t of [1, 2]) for (const r of ['common', 'rare', 'omega', 'alpha', 'unique']) rows.push(slot(t, r, false, 0))
rows[0] = slot(1, 'common', true, 2); rows[1] = slot(1, 'rare', true, 1); rows[5] = slot(2, 'common', true, 3)
rows[4] = slot(1, 'unique', false, 1)   // une Unique possédée mais pas encore placée
const st = albumStats(rows, rarityMap)
ok('full set : 3 remplis sur 8 (Unique exclues)', st.base.filled === 3 && st.base.total === 8)
ok('Unique en bonus : 0/2, comptées à part', st.bonus.filled === 0 && st.bonus.total === 2)
ok('pourcentage calculé sur le full set seulement', Math.abs(st.base.pct - 37.5) < 1e-9)
ok('emplacement remplissable : la Unique possédée compte comme remplissable', st.fillable === 1)
ok('full set non complet', st.base.complete === false)
ok('détail par rareté : la Unique est marquée bonus, les autres non', st.byRarity.find((e) => e.id === 'unique').bonus === true && st.byRarity.find((e) => e.id === 'common').bonus === false)
ok('détail par rareté : trié du plus commun au plus rare', eq(st.byRarity.map((e) => e.id), ['common', 'rare', 'omega', 'alpha', 'unique']))

const full = albumStats(rows.filter((r) => r.rarity_id !== 'unique').map((r) => ({ ...r, pick_series: 5, pick_number: 2 })), rarityMap)
ok('full set complet quand tous les emplacements hors Unique sont remplis (sans aucune Unique)', full.base.complete === true && full.bonus.total === 0)
const fullWithBonusMissing = albumStats(rows.map((r) => (r.rarity_id === 'unique' ? r : { ...r, pick_series: 5, pick_number: 2 })), rarityMap)
ok('full set complet même si les Unique bonus manquent', fullWithBonusMissing.base.complete === true && fullWithBonusMissing.bonus.filled === 0)
ok('album vide : pas de division par zéro', albumStats([], rarityMap).base.pct === 0 && albumStats(null, rarityMap).base.total === 0)
ok('isBonus : seulement la rareté Unique', isBonus(rarityMap.unique) && !isBonus(rarityMap.alpha) && !isBonus(undefined))

// ---- Sélecteur : 200 cartes à numéro masqué = UNE proposition ; 3 numérotées visibles = 3 propositions (soit 4 au total)
const hidden = (n) => ({ series: 40 + (n % 30), number: 2 + Math.floor(n / 30), visible: false, listed: false, picked: false })
const visible = (s, n) => ({ series: s, number: n, visible: true, listed: false, picked: false })
const cards = [...Array.from({ length: 200 }, (_, i) => hidden(i)), visible(7, 2), visible(50, 30), visible(26, 25)]
const pe = pickerEntries(cards)
ok('200 cartes masquées + 3 numérotées → 4 propositions', pe.entries.length === 4)
ok('une seule proposition pour les 200 cartes masquées, avec leur nombre', pe.entries.filter((e) => e.kind === 'stack').length === 1 && pe.entries[0].count === 200)
ok('chaque carte numérotée est proposée séparément', pe.entries.filter((e) => e.kind === 'card').length === 3)
ok('seulement des cartes masquées → une seule proposition', pickerEntries(Array.from({ length: 20 }, (_, i) => hidden(i))).entries.length === 1)
ok('aucune carte → aucune proposition', pickerEntries([]).entries.length === 0)
const withListed = pickerEntries([{ ...hidden(1), listed: true }, hidden(2), { ...visible(7, 2), listed: true }])
ok('une carte en vente n’est pas proposée, et on le sait', withListed.entries.length === 1 && withListed.listedCount === 2 && withListed.entries[0].count === 1)
const pickedStack = pickerEntries([hidden(1), { ...hidden(2), picked: true }, hidden(3)])
ok('la pile est « choisie » quand une de ses cartes est dans l’album, et la proposée est celle-là', pickedStack.entries[0].picked === true && pickedStack.entries[0].card.number === hidden(2).number && pickedStack.entries[0].card.series === hidden(2).series)
ok('une carte numérotée déjà dans l’album est marquée choisie', pickerEntries([{ ...visible(7, 2), picked: true }]).entries[0].picked === true)

// ---- Bilan d'une pile
const si = stackInfo([hidden(1), { ...hidden(2), listed: true }, { ...hidden(3), picked: true }, hidden(4), visible(7, 2)])
ok('pile : 4 cartes masquées (la numérotée visible n’en fait pas partie)', si.total === 4)
ok('pile : 1 en vente, 1 dans l’album, 2 vendables', si.listed === 1 && si.inAlbum === 1 && si.free === 2)
ok('pile : première carte vendable fournie pour la mise en vente', si.firstFree !== null && !si.firstFree.listed && !si.firstFree.picked)
ok('pile vide : rien de vendable', stackInfo([]).free === 0 && stackInfo([]).firstFree === null)

if (bad) { console.error(`\n${bad} contrôle(s) en échec`); process.exit(1) }
console.log('\nAlbum et piles (logique) : tous les contrôles sont passés.')

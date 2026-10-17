// Teste src/albumLogic.js : statistiques d'album (master set = raretés ordinaires ; Unique, Alpha et Omega hors master set), sélecteur regroupé, bilan d'une pile.
//   node tests/album-logic.test.mjs
import { albumStats, pickerEntries, stackInfo, isBonus, specialSuffix, SPECIAL_KINDS } from '../src/albumLogic.js'

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ---- Statistiques : 2 cartes × (2 raretés ordinaires + Omega, Alpha, Unique) : master set = 4 emplacements, 6 emplacements spéciaux hors master set
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
ok('master set : 3 remplis sur 4 (Alpha, Omega et Unique exclues)', st.base.filled === 3 && st.base.total === 4)
ok('Unique, Alpha et Omega hors master set : 0/6, comptées à part', st.bonus.filled === 0 && st.bonus.total === 6)
ok('pourcentage calculé sur le master set seulement (75 %)', Math.abs(st.base.pct - 75) < 1e-9)
ok('emplacement remplissable : la Unique possédée compte comme remplissable', st.fillable === 1)
ok('master set non complet', st.base.complete === false)
ok('détail par rareté : Unique, Alpha et Omega sont marquées hors master set, les raretés ordinaires non', ['unique', 'alpha', 'omega'].every((id) => st.byRarity.find((e) => e.id === id).bonus === true) && ['common', 'rare'].every((id) => st.byRarity.find((e) => e.id === id).bonus === false))
ok('détail par rareté : trié du plus commun au plus rare', eq(st.byRarity.map((e) => e.id), ['common', 'rare', 'omega', 'alpha', 'unique']))
ok('suffixes à côté des raretés spéciales : Unique 1/1, Alpha 1/N, Omega N/N, rien pour les ordinaires', st.byRarity.find((e) => e.id === 'unique').suffix === '1/1' && st.byRarity.find((e) => e.id === 'alpha').suffix === '1/N' && st.byRarity.find((e) => e.id === 'omega').suffix === 'N/N' && st.byRarity.find((e) => e.id === 'common').suffix === '')
ok('specialSuffix : 1/1, 1/N, N/N ; vide pour une rareté ordinaire ou inconnue', specialSuffix(rarityMap.unique) === '1/1' && specialSuffix(rarityMap.alpha) === '1/N' && specialSuffix(rarityMap.omega) === 'N/N' && specialSuffix(rarityMap.common) === '' && specialSuffix(undefined) === '')

const specials = ['unique', 'alpha', 'omega']
const full = albumStats(rows.filter((r) => !specials.includes(r.rarity_id)).map((r) => ({ ...r, pick_series: 5, pick_number: 2 })), rarityMap)
ok('master set complet quand tous les emplacements ordinaires sont remplis (sans aucune carte spéciale)', full.base.complete === true && full.bonus.total === 0)
const fullWithBonusMissing = albumStats(rows.map((r) => (specials.includes(r.rarity_id) ? r : { ...r, pick_series: 5, pick_number: 2 })), rarityMap)
ok('master set complet même si les Unique, Alpha et Omega manquent', fullWithBonusMissing.base.complete === true && fullWithBonusMissing.bonus.filled === 0 && fullWithBonusMissing.bonus.total === 6)
const specialsOnly = albumStats(rows.map((r) => (specials.includes(r.rarity_id) ? { ...r, pick_series: 5, pick_number: 2 } : r)), rarityMap)
ok('remplir les Alpha, Omega et Unique ne fait pas avancer le master set', specialsOnly.base.filled === st.base.filled && specialsOnly.bonus.filled === 6)
ok('album vide : pas de division par zéro', albumStats([], rarityMap).base.pct === 0 && albumStats(null, rarityMap).base.total === 0)
ok('isBonus : Unique, Alpha et Omega (hors master set), pas les raretés ordinaires', SPECIAL_KINDS.join() === 'unique,alpha,omega' && isBonus(rarityMap.unique) && isBonus(rarityMap.alpha) && isBonus(rarityMap.omega) && !isBonus(rarityMap.common) && !isBonus(undefined))

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

// ---- Cartes secrètes (numérotées au-delà de la checklist, ex. 4/3) : hors master set, comptées à part
const secretRows = [
  ...rows,
  { type_id: 9, rarity_id: null, pick_series: null, pick_number: null, owned_count: 0, secret: true, revealed: false },   // pas encore découverte
]
const ss = albumStats(secretRows, rarityMap)
ok('secrète non découverte : le master set ne change pas (3 sur 4)', ss.base.filled === 3 && ss.base.total === 4)
ok('secrète : comptée à part, 0 découverte sur 1', ss.secrets.total === 1 && ss.secrets.found === 0)
ok('secrète non découverte : ni dans les puces par rareté ni parmi les emplacements remplissables', ss.byRarity.every((e) => e.id !== null) && ss.fillable === st.fillable)
const found = albumStats([...rows, { type_id: 9, rarity_id: 'common', pick_series: null, pick_number: null, owned_count: 2, secret: true, revealed: true }, { type_id: 9, rarity_id: 'unique', pick_series: 1, pick_number: 1, owned_count: 1, secret: true, revealed: true }], rarityMap)
ok('secrète découverte : 1 trouvée sur 1, toujours hors master set et hors cartes spéciales', found.secrets.found === 1 && found.secrets.total === 1 && found.base.total === 4 && found.bonus.total === 6)
ok('secrète découverte : ses emplacements remplissables comptent parmi ceux qu’on peut remplir', found.fillable === st.fillable + 1)
ok('aucune secrète : 0 sur 0', albumStats(rows, rarityMap).secrets.total === 0)

if (bad) { console.error(`\n${bad} contrôle(s) en échec`); process.exit(1) }
console.log('\nAlbum et piles (logique) : tous les contrôles sont passés.')

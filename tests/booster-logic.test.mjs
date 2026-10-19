// Teste src/boosterLogic.js : répartitions par carte, pourcentages, contrôles de l'éditeur de boosters.
//   node tests/booster-logic.test.mjs
import { slotsToPositions, positionsToSlots, shares, resizePositions, validateBooster, defaultPositions, pickableRarities, ROLES, roleLabel, NUMBERED, MAX_CARDS } from '../src/boosterLogic.js'

let bad = 0
const ok = (name, cond) => { console.log(cond ? 'OK  ' : 'FAIL', name); if (!cond) bad++ }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const slots = [
  { position: 1, rarity_id: 'commune', weight: 100 }, { position: 2, rarity_id: 'commune', weight: 100 },
  { position: 3, rarity_id: 'commune', weight: 80 }, { position: 3, rarity_id: 'peu', weight: 20 },
  { position: 4, rarity_id: 'peu', weight: 80 }, { position: 4, rarity_id: 'rare', weight: 20 },
  { position: 5, rarity_id: 'rare', weight: 60 }, { position: 5, rarity_id: 'super', weight: 30 }, { position: 5, rarity_id: 'ultra', weight: 9 },
  { position: 5, rarity_id: 'art', weight: 0.8 }, { position: 5, rarity_id: 'unique', weight: 0.2 },
]
const pos = slotsToPositions(slots, 5)

ok('slotsToPositions : une liste par carte, dans l\'ordre', pos.length === 5 && pos[0].length === 1 && pos[2].length === 2 && pos[4].length === 5 && pos[4][4].rarity_id === 'unique')
ok('slotsToPositions : une carte sans répartition donne une liste vide, une position hors du booster est ignorée', eq(slotsToPositions([{ position: 1, rarity_id: 'a', weight: 1 }, { position: 9, rarity_id: 'b', weight: 1 }], 3), [[{ rarity_id: 'a', weight: 1 }], [], []]))
ok('positionsToSlots est l\'inverse de slotsToPositions', eq(positionsToSlots(pos), slots))
ok('poids texte (saisie) convertis en nombres à l\'enregistrement', eq(positionsToSlots([[{ rarity_id: 'a', weight: '12.5' }]]), [{ position: 1, rarity_id: 'a', weight: 12.5 }]))
ok('shares : 80 et 20 donnent 80 % et 20 %', eq(shares(pos[2]), [0.8, 0.2]))
ok('shares : la carte 5 de l\'exemple totalise 100 % (60 / 30 / 9 / 0,8 / 0,2)', Math.abs(shares(pos[4]).reduce((a, x) => a + x, 0) - 1) < 1e-12 && Math.abs(shares(pos[4])[3] - 0.008) < 1e-12)
ok('shares : seuls les poids positifs comptent (0, négatif, texte invalide = 0 %)', eq(shares([{ weight: 50 }, { weight: 0 }, { weight: -3 }, { weight: 'x' }, { weight: 50 }]), [0.5, 0, 0, 0, 0.5]))
ok('shares : aucune chance quand tous les poids sont nuls', eq(shares([{ weight: 0 }, { weight: '' }]), [0, 0]))
ok('shares : des poids qui ne font pas 100 sont ramenés à 100 % (1 et 3 = 25 % et 75 %)', eq(shares([{ weight: 1 }, { weight: 3 }]), [0.25, 0.75]))

const six = resizePositions(pos, 7)
ok('resizePositions : agrandir copie la répartition de la dernière carte', six.length === 7 && eq(six[5], pos[4]) && eq(six[6], pos[4]))
ok('resizePositions : copie indépendante (modifier la copie ne touche pas l\'original)', (() => { const c = resizePositions(pos, 6); c[5][0].weight = 999; return pos[4][0].weight === 60 })())
ok('resizePositions : réduire retire les dernières cartes', eq(resizePositions(pos, 2), pos.slice(0, 2)))
ok('resizePositions : agrandir une liste vide donne des cartes vides', eq(resizePositions([], 2), [[], []]))

const names = { commune: 'Commune', peu: 'Peu Commune', rare: 'Rare' }
const base = { name: 'Silver', cards: 5, price: '50', positions: pos }
ok('validateBooster : le Standard de l\'exemple est valide', validateBooster(base, names) === '')
ok('validateBooster : nom vide ou trop long', /nom/i.test(validateBooster({ ...base, name: '  ' })) && /40/.test(validateBooster({ ...base, name: 'x'.repeat(41) })))
ok('validateBooster : nombre de cartes entre 1 et 10', /entre 1 et 10/.test(validateBooster({ ...base, cards: 0 })) && /entre 1 et 10/.test(validateBooster({ ...base, cards: MAX_CARDS + 1 })) && /entre 1 et 10/.test(validateBooster({ ...base, cards: 2.5 })))
ok('validateBooster : prix entier ou vide', validateBooster({ ...base, price: '' }) === '' && /prix/i.test(validateBooster({ ...base, price: '-1' })) && /prix/i.test(validateBooster({ ...base, price: '1.5' })) && /prix/i.test(validateBooster({ ...base, price: 'abc' })))
ok('validateBooster : une carte sans rareté est signalée avec son numéro', /La carte 3 n’a aucune rareté/.test(validateBooster({ ...base, positions: [pos[0], pos[1], [], pos[3], pos[4]] })))
ok('validateBooster : poids nul, négatif ou invalide signalé avec le nom de la rareté', /Carte 3 : le poids de « Peu Commune » doit être un nombre positif/.test(validateBooster({ ...base, positions: [pos[0], pos[1], [pos[2][0], { rarity_id: 'peu', weight: 0 }], pos[3], pos[4]] }, names))
  && /positif/.test(validateBooster({ ...base, positions: [[{ rarity_id: 'commune', weight: -1 }], pos[1], pos[2], pos[3], pos[4]] }, names)) && /positif/.test(validateBooster({ ...base, positions: [[{ rarity_id: 'commune', weight: '' }], pos[1], pos[2], pos[3], pos[4]] }, names)))
ok('validateBooster : rareté en double sur une carte', /Carte 2 : « Commune » est en double/.test(validateBooster({ ...base, positions: [pos[0], [{ rarity_id: 'commune', weight: 1 }, { rarity_id: 'commune', weight: 2 }], pos[2], pos[3], pos[4]] }, names)))
ok('validateBooster : seules les cartes du booster comptent (les répartitions en trop sont ignorées)', validateBooster({ ...base, cards: 2 }, names) === '')

const rarities = [
  { id: 'unique', name: 'Unique', kind: 'unique', sort_order: 1 }, { id: 'alpha', name: 'Alpha', kind: 'alpha', sort_order: 2 }, { id: 'omega', name: 'Omega', kind: 'omega', sort_order: 3 },
  { id: 'rare', name: 'Rare', kind: 'range', sort_order: 6 }, { id: 'common', name: 'Commune', kind: 'range', sort_order: 9 }, { id: 'super', name: 'Super Rare', kind: 'range', sort_order: 5 },
]
ok('pickableRarities : ordinaires et Unique seulement (ni Alpha ni Omega), de la plus répandue à la plus rare', eq(pickableRarities(rarities).map((r) => r.id), ['common', 'rare', 'super', 'unique']))
ok('defaultPositions : un booster neuf = 100 % de la rareté ordinaire la plus répandue sur chaque carte', eq(defaultPositions(rarities, 3), [[{ rarity_id: 'common', weight: 100 }], [{ rarity_id: 'common', weight: 100 }], [{ rarity_id: 'common', weight: 100 }]]) && defaultPositions(rarities).length === 5)
ok('defaultPositions : sans rareté ordinaire, des cartes vides (pas de plantage)', eq(defaultPositions([{ id: 'unique', kind: 'unique', sort_order: 1 }], 2), [[], []]))

// ---- rôles des boosters et choix du booster de récompense (Gold)
ok('rôles : ordinaire, abonnés, cadeau des abonnés, récompense de carte complétée (dans cet ordre, avec une aide chacun)', eq(ROLES.map((r) => r.id), ['', 'subscriber', 'subscription_gift', 'card_reward']) && ROLES.every((r) => r.label && r.help))
ok('roleLabel : libellé du rôle, vide pour un booster ordinaire ou un rôle inconnu', roleLabel('card_reward') === 'Récompense : carte complétée' && roleLabel('') === 'Booster ordinaire' && roleLabel(null) === 'Booster ordinaire' && roleLabel('vip') === '')
ok('pickableRarities (booster ordinaire, des abonnés ou cadeau) : toujours sans Alpha, Omega ni carte numérotée', ['', 'subscriber', 'subscription_gift'].every((role) => eq(pickableRarities(rarities, role).map((r) => r.id), ['common', 'super', 'rare', 'unique'].filter(() => true).length ? pickableRarities(rarities).map((r) => r.id) : [])) && !pickableRarities(rarities, 'subscriber').some((r) => ['alpha', 'omega', 'numbered'].includes(r.id)))
const reward = pickableRarities(rarities, 'card_reward').map((r) => r.id)
ok('pickableRarities (récompense) : ordinaires, Unique, Alpha, Omega, puis « carte numérotée » en dernier', reward.includes('alpha') && reward.includes('omega') && reward.includes('unique') && reward.at(-1) === 'numbered' && reward.indexOf('common') < reward.indexOf('rare'))
ok('la carte numérotée a un nom lisible pour l\'admin', NUMBERED.id === 'numbered' && /numérotée/.test(NUMBERED.name) && /carte complétée/.test(NUMBERED.name))
const kinds = { alpha: 'alpha', omega: 'omega', common: 'range', unique: 'unique' }
const names2 = { alpha: 'Alpha', omega: 'Omega', numbered: NUMBERED.name, common: 'Commune' }
const withEntry = (id, role) => validateBooster({ name: 'X', cards: 1, price: '', positions: [[{ rarity_id: id, weight: 1 }]], role }, names2, kinds)
ok('validation : Alpha, Omega et « numbered » refusés pour un booster ordinaire, des abonnés ou cadeau, avec un message qui dit pourquoi', ['', 'subscriber', 'subscription_gift'].every((role) => /n’est possible que dans le booster de récompense/.test(withEntry('alpha', role)) && /Omega/.test(withEntry('omega', role)) && /numérotée/.test(withEntry('numbered', role))))
ok('validation : acceptés pour le booster de récompense', withEntry('alpha', 'card_reward') === '' && withEntry('omega', 'card_reward') === '' && withEntry('numbered', 'card_reward') === '')
ok('validation : une rareté ordinaire reste valable partout ; sans rôle précisé (appel ancien), comme un booster ordinaire', withEntry('common', '') === '' && withEntry('common', 'card_reward') === '' && validateBooster({ name: 'X', cards: 1, price: '', positions: [[{ rarity_id: 'alpha', weight: 1 }]] }, names2, kinds) !== '')

if (bad) { console.error(`\n${bad} ÉCHEC(S)`); process.exit(1) }
console.log('\nLogique des boosters : tous les contrôles sont passés.')

// Raretés qui déclenchent les feux d'artifice et l'effet métallisé
export const isSpecial = (r) => !!r && ['unique', 'alpha', 'omega'].includes(r.kind)
// Art Rare et Full Art Rare : reconnues par leur nom (sans tenir compte des majuscules, accents, espaces ni tirets), comme les boosters de départ ; les identifiants de rareté
// ne sont jamais utilisés. Elles déclenchent l'animation plein écran à la révélation. (La 1/1 d'une Full Art Rare reste une Full Art Rare, jamais une Unique : côté base de données.)
const rarityKey = (r) => String(r?.name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '')
export const isArtRare = (r) => !!r && r.kind === 'range' && ['artrare', 'fullartrare'].includes(rarityKey(r))

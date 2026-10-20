// Raretés qui déclenchent les feux d'artifice et l'effet métallisé
export const isSpecial = (r) => !!r && ['unique', 'alpha', 'omega'].includes(r.kind)
// Art Rare : reconnue par son nom (« Art Rare », sans tenir compte des majuscules, accents, espaces ni tirets), comme les boosters de départ ; les identifiants de rareté
// ne sont jamais utilisés. Elle déclenche l'animation plein écran à la révélation.
export const isArtRare = (r) => !!r && r.kind === 'range' && String(r.name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '') === 'artrare'

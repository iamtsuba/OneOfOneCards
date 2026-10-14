// Raretés qui déclenchent les feux d'artifice et l'effet métallisé
export const isSpecial = (r) => !!r && ['unique', 'alpha', 'omega'].includes(r.kind)

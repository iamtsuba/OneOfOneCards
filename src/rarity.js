// Raretés qui déclenchent les feux d'artifice et l'effet métallisé
export const isSpecial = (r) => !!r && ['unique', 'alpha', 'omega'].includes(r.kind)
// Une carte 1/1 (rareté affichée « Unique ») garde l'apparence de SA rareté de base : une Ultra Rare 1/1 est rouge, une Rare 1/1 verte, une Art Rare 1/1 de la couleur
// de l'Art Rare. Renvoie la rareté dont on montre le nom et les couleurs ; pour toute autre carte (ou sans rareté de base connue), la rareté affichée telle quelle.
export const shownRarity = (rarity, baseRarity) => (rarity?.kind === 'unique' && baseRarity?.kind === 'range' ? baseRarity : rarity)
// Rareté des feux d'artifice d'une carte : ceux d'une Unique (grands) mais aux couleurs de la rareté de base d'une carte 1/1 ; identifiant propre pour ne pas les mélanger
export const fireworksRarity = (rarity, baseRarity) => (rarity?.kind === 'unique' && baseRarity?.kind === 'range' ? { ...baseRarity, id: `unique-${baseRarity.id}`, kind: 'unique' } : rarity)

// Art Rare : reconnue par son nom (« Art Rare », sans tenir compte des majuscules, accents, espaces ni tirets), comme les boosters de départ ; les identifiants de rareté
// ne sont jamais utilisés. Elle déclenche l'animation plein écran à la révélation.
export const isArtRare = (r) => !!r && r.kind === 'range' && String(r.name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '') === 'artrare'

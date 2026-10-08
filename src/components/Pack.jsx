// Booster dessiné en SVG. Le bandeau du haut s'arrache à l'ouverture.
function crimp(y0, y1, w, teeth) {
  const step = w / teeth
  let d = ''
  for (let i = 0; i <= teeth; i++) {
    const x = 10 + i * step
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${i % 2 === 0 ? y0 : y1} `
  }
  return d
}

// Variables de couleur du booster, tirées de la catégorie (le booster doré garde sa propre palette)
function packColors(category) {
  if (!category) return undefined
  return {
    '--pk-a': category.color,
    '--pk-b': category.color2,
    '--pk-band': `color-mix(in srgb, ${category.color2} 62%, #000)`,
    '--pk-crimp': category.color2,
    '--pk-text': category.text_color,
    '--pk-bandtext': '#ffffff',
  }
}

export default function Pack({ phase = 'idle', dim = false, golden = false, category = null }) {
  const top = crimp(4, 20, 220, 30) + 'L230 34 L10 34 Z'
  const bottom = crimp(356, 340, 220, 30) + 'L230 326 L10 326 Z'
  return (
    <div className={`pack-wrap ${phase} ${dim ? 'dim' : ''} ${golden ? 'golden' : ''}`} style={golden ? undefined : packColors(category)} aria-hidden="true">
      <svg viewBox="0 0 240 360" role="img">
        <defs>
          <linearGradient id="pk-body" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--pk-a)' }} />
            <stop offset="1" style={{ stopColor: 'var(--pk-b)' }} />
          </linearGradient>
          <linearGradient id="pk-shine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".22" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <clipPath id="pk-clip"><rect x="10" y="30" width="220" height="300" /></clipPath>
        </defs>
        <g className="pack-body">
          <rect x="10" y="30" width="220" height="300" fill="url(#pk-body)" />
          <g clipPath="url(#pk-clip)">
            <polygon points="0,205 240,148 240,208 0,265" style={{ fill: 'var(--pk-band)' }} />
            <rect x="10" y="30" width="70" height="300" fill="url(#pk-shine)" />
          </g>
          <text x="120" y="130" textAnchor="middle" fontSize="76" fontWeight="800" style={{ fill: 'var(--pk-text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.04em' }}>1/1</text>
          <text x="120" y="212" textAnchor="middle" fontSize="15" fontWeight="600" transform="rotate(-13 120 207)" style={{ fill: 'var(--pk-bandtext)', fontFamily: 'var(--font-body)' }}>{golden ? 'Booster doré' : category?.name ?? '5 cartes numérotées'}</text>
          <text x="120" y="302" textAnchor="middle" fontSize="23" fontWeight="700" style={{ fill: 'var(--pk-text)', fontFamily: 'var(--font-display)' }}>1/1 Cards</text>
          <path d={bottom} style={{ fill: 'var(--pk-crimp)' }} />
        </g>
        <path className="pack-top" d={top} style={{ fill: 'var(--pk-crimp)' }} />
      </svg>
    </div>
  )
}

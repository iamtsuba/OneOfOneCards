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

export default function Pack({ phase = 'idle', dim = false }) {
  const top = crimp(4, 20, 220, 30) + 'L230 34 L10 34 Z'
  const bottom = crimp(356, 340, 220, 30) + 'L230 326 L10 326 Z'
  return (
    <div className={`pack-wrap ${phase} ${dim ? 'dim' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 240 360" role="img">
        <defs>
          <linearGradient id="pk-body" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#323b9e" />
            <stop offset="1" stopColor="#14173f" />
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
            <polygon points="0,205 240,148 240,208 0,265" fill="#e8432f" />
            <rect x="10" y="30" width="70" height="300" fill="url(#pk-shine)" />
          </g>
          <text x="120" y="130" textAnchor="middle" fontSize="76" fontWeight="800" fill="#fff"
                style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.04em' }}>1/1</text>
          <text x="120" y="212" textAnchor="middle" fontSize="15" fontWeight="600" fill="#fff"
                transform="rotate(-13 120 207)" style={{ fontFamily: 'var(--font-body)' }}>5 cartes numérotées</text>
          <text x="120" y="302" textAnchor="middle" fontSize="23" fontWeight="700" fill="#fff"
                style={{ fontFamily: 'var(--font-display)' }}>OneOfOne Pack</text>
          <path d={bottom} fill="#2a3189" />
        </g>
        <path className="pack-top" d={top} fill="#2a3189" />
      </svg>
    </div>
  )
}

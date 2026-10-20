// Booster dessiné en SVG : le nom de la catégorie en haut, son image au centre (« 1/1 » tant qu'elle n'en a pas), le nom du booster (Standard, OneMore…) sur la
// bande du bas (« 1/1 Cards » à défaut). Un halo de lumière peut entourer le paquet. Le bandeau du haut s'arrache à l'ouverture.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { isImage } from './TypeArt'

function crimp(y0, y1, w, teeth) {
  const step = w / teeth
  let d = ''
  for (let i = 0; i <= teeth; i++) {
    const x = 10 + i * step
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${i % 2 === 0 ? y0 : y1} `
  }
  return d
}

// Couleur de la bande du bas : celle réglée sur le booster (onglet Boosters de l'admin), avec un texte blanc ou foncé selon sa luminosité pour rester lisible.
// Une couleur absente ou invalide laisse la couleur de la catégorie.
export function bandColors(color) {
  if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) return null
  const ch = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  const lum = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
  return { '--pk-band': color, '--pk-bandtext': lum > 0.45 ? '#14173f' : '#ffffff' }
}

// Variables de couleur du booster, tirées de la catégorie (le booster doré garde sa propre palette) ; color = couleur de la bande réglée sur le booster
function packColors(category, color) {
  if (!category && !bandColors(color)) return undefined
  if (!category) return bandColors(color)
  return {
    '--pk-a': category.color,
    '--pk-b': category.color2,
    '--pk-band': `color-mix(in srgb, ${category.color2} 62%, #000)`,
    '--pk-crimp': category.color2,
    '--pk-text': category.text_color,
    '--pk-bandtext': '#ffffff',
    ...bandColors(color),
  }
}

// Titre du booster : toujours sur une seule ligne, la taille s'adapte à la longueur du nom (tronqué au-delà de 22 caractères). La
// largeur réelle dépend de la police : le composant la mesure et, si besoin, resserre le texte pour qu'il ne déborde jamais du booster.
const TITLE_MAX = 204
// useLayoutEffect évite un affichage furtif non resserré dans le navigateur ; côté serveur (tests) il n'existe pas : useEffect
const useMeasure = typeof window !== 'undefined' ? useLayoutEffect : useEffect
export function packTitle(name) {
  const text = String(name ?? '').trim() || '1/1 Cards'
  const shown = text.length > 22 ? text.slice(0, 21).trimEnd() + '…' : text
  return { text: shown, size: Math.max(15, Math.min(30, Math.floor(200 / (shown.length * 0.62)))) }
}

// Nom du booster sur la bande du bas : une seule ligne, taille adaptée à la longueur (tronqué au-delà de 18 caractères)
export function bandLabel(label) {
  const text = String(label ?? '').trim() || '1/1 Cards'
  const shown = text.length > 18 ? text.slice(0, 17).trimEnd() + '…' : text
  return { text: shown, size: Math.max(12, Math.min(22, Math.floor(190 / (shown.length * 0.6)))) }
}
const GLOW_IDS = ['gold', 'silver', 'red', 'blue', 'green', 'purple', 'rainbow']

const STAR = 'M12 2.2l2.9 6.5 7.1.7-5.3 4.8 1.5 7-6.2-3.7-6.2 3.7 1.5-7L2 9.4l7.1-.7z'

export default function Pack({ phase = 'idle', dim = false, golden = false, category = null, label = null, glow = 'none', color = null }) {
  const top = crimp(4, 20, 220, 30) + 'L230 34 L10 34 Z'
  const bottom = crimp(356, 340, 220, 30) + 'L230 326 L10 326 Z'
  const title = packTitle(golden ? 'Booster doré' : category?.name)
  const band = bandLabel(label)
  const halo = !dim && !golden && GLOW_IDS.includes(glow) ? glow : null   // pas de halo sur un paquet éteint (stock vide) ni sur le booster doré (qui a le sien)
  const image = golden ? '' : (category?.image ?? '')
  // Identifiants SVG propres à chaque booster : plusieurs boosters peuvent être affichés ensemble (aperçus de la console admin) et,
  // avec des identifiants communs, tous prendraient le dégradé du premier
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const titleRef = useRef(null)
  const [fit, setFit] = useState(1)   // facteur de resserrement horizontal du titre (1 = tel quel)
  useMeasure(() => {
    const el = titleRef.current
    if (!el || typeof el.getComputedTextLength !== 'function') return undefined
    const measure = () => { const w = el.getComputedTextLength(); setFit(w > TITLE_MAX ? TITLE_MAX / w : 1) }
    measure()
    document.fonts?.ready?.then(measure)   // la police du site peut arriver après le premier affichage
    return undefined
  }, [title.text, title.size])
  return (
    <div className={`pack-wrap ${phase} ${dim ? 'dim' : ''} ${golden ? 'golden' : ''}${halo ? ` has-glow glow-${halo}` : ''}`} style={golden ? undefined : packColors(category, color)} aria-hidden="true">
      <svg viewBox="0 0 240 360" role="img">
        <defs>
          <linearGradient id={`pk-body-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--pk-a)' }} />
            <stop offset="1" style={{ stopColor: 'var(--pk-b)' }} />
          </linearGradient>
          <linearGradient id={`pk-shine-${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".5" stopColor="#fff" stopOpacity=".22" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`pk-clip-${uid}`}><rect x="10" y="30" width="220" height="300" /></clipPath>
          <clipPath id={`pk-win-${uid}`}><rect x="46" y="102" width="148" height="142" rx="14" /></clipPath>
        </defs>
        <g className="pack-body">
          <rect x="10" y="30" width="220" height="300" fill={`url(#pk-body-${uid})`} />
          <g clipPath={`url(#pk-clip-${uid})`}>
            <polygon points="0,272 240,252 240,308 0,328" style={{ fill: 'var(--pk-band)' }} />
            <rect x="10" y="30" width="70" height="300" fill={`url(#pk-shine-${uid})`} />
          </g>
          <text ref={titleRef} className="pack-title" x="0" y="0" transform={`translate(120 78) scale(${fit} 1)`} textAnchor="middle" fontSize={title.size} fontWeight="800"
            style={{ fill: 'var(--pk-text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>{title.text}</text>
          <g className="pack-window">
            <rect x="42" y="98" width="156" height="150" rx="18" fill="rgba(255,255,255,.2)" stroke="rgba(255,255,255,.6)" strokeWidth="2" />
            {golden ? (
              <path d={STAR} transform="translate(60 113) scale(5)" style={{ fill: 'var(--pk-text)' }} />
            ) : isImage(image) ? (
              <image className="pack-image" href={image} x="46" y="102" width="148" height="142" preserveAspectRatio="xMidYMid slice" clipPath={`url(#pk-win-${uid})`} />
            ) : image ? (
              <text className="pack-emoji" x="120" y="203" textAnchor="middle" fontSize="88">{image}</text>
            ) : (
              <text className="pack-mark" x="120" y="196" textAnchor="middle" fontSize="64" fontWeight="800"
                style={{ fill: 'var(--pk-text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.04em' }}>1/1</text>
            )}
          </g>
          <text className="pack-band" x="120" y="298" textAnchor="middle" fontSize={band.size} fontWeight="700" transform="rotate(-5 120 294)"
            style={{ fill: 'var(--pk-bandtext)', fontFamily: 'var(--font-display)' }}>{band.text}</text>
          <path d={bottom} style={{ fill: 'var(--pk-crimp)' }} />
        </g>
        <path className="pack-top" d={top} style={{ fill: 'var(--pk-crimp)' }} />
      </svg>
    </div>
  )
}

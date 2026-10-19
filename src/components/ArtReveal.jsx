import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isImage } from './TypeArt'

// Animation d'une carte Art Rare à la révélation : l'illustration occupe TOUT l'écran, puis se réduit petit à petit jusqu'à la place de l'image de la carte, qui apparaît
// alors autour d'elle ; des feux d'artifice dorés suivent (gérés par l'écran d'ouverture). Toucher l'écran passe l'animation.
// Durées en millisecondes (modifiables : les tests les raccourcissent).
export const ART_TIMING = { hold: 1000, shrink: 1800 }

// Couleurs des feux d'artifice dorés d'une Art Rare (grands, comme ceux d'une Unique)
export const GOLD_FIREWORKS = { kind: 'unique', color: '#ffcf3a', color2: '#d4a017' }

export default function ArtIntro({ type, onDone }) {
  const ref = useRef(null)
  const [phase, setPhase] = useState('full')   // full : plein écran ; shrink : se réduit vers la carte
  const [rect, setRect] = useState(null)
  const doneRef = useRef(false)
  const finish = () => { if (!doneRef.current) { doneRef.current = true; onDone() } }

  useEffect(() => {
    // « réduire les animations » : pas d'animation, la carte apparaît directement
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) { finish(); return undefined }
    const t1 = setTimeout(() => {
      // La place de l'image de la carte est mesurée à cet instant (l'apparition de la carte est terminée, donc sa position est définitive)
      const target = document.querySelector('.reveal-card .card-art')
      if (!target) { finish(); return }
      const r = target.getBoundingClientRect()
      const radius = parseFloat(window.getComputedStyle(target).borderTopLeftRadius) || 0
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height, radius })
      setPhase('shrink')
    }, ART_TIMING.hold)
    const t2 = setTimeout(finish, ART_TIMING.hold + ART_TIMING.shrink)
    return () => { clearTimeout(t1); clearTimeout(t2) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const full = { top: 0, left: 0, width: '100vw', height: '100dvh', borderRadius: 0 }
  const style = phase === 'shrink' && rect
    ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height, borderRadius: rect.radius, transition: `all ${ART_TIMING.shrink}ms cubic-bezier(.7, 0, .25, 1)` }
    : full
  // Affichée directement dans la page (portail) : l'étape de révélation a une transformation CSS, qui ferait du « plein écran » un plein bloc décalé
  return createPortal(
    <div ref={ref} className={`art-intro ${phase}`} onClick={finish} role="presentation" aria-hidden="true" style={{ '--art-shrink': `${ART_TIMING.shrink}ms` }}>
      <div className="art-intro-backdrop" />
      <div className="art-intro-img" style={style}>
        {isImage(type?.image) ? <img src={type.image} alt="" draggable="false" /> : <span className="art-intro-emoji">{type?.image || '🃏'}</span>}
      </div>
    </div>,
    document.body,
  )
}

import { useEffect, useRef } from 'react'

const toRgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const lighten = (hex, t) => {
  const [r, g, b] = toRgb(hex)
  const f = (c) => Math.round(c + (255 - c) * t)
  return `rgb(${f(r)},${f(g)},${f(b)})`
}

// Feux d'artifice aux couleurs de la rareté (violet Unique, doré Alpha, argenté Omega)
export default function Fireworks({ rarity }) {
  const ref = useRef(null)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0
    let h = 0
    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const big = rarity.kind === 'unique'
    const palette = [rarity.color, rarity.color2, lighten(rarity.color, 0.45), lighten(rarity.color, 0.8), '#ffffff']
    const duration = big ? 5600 : 3600
    const gap = big ? 230 : 340
    const count = big ? 110 : 70
    const speed = big ? 6.5 : 5
    const parts = []
    const pick = () => palette[(Math.random() * palette.length) | 0]

    const burst = (x, y) => {
      const base = pick()
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2
        const s = (0.6 + Math.random()) * speed
        parts.push({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1,
          decay: 0.009 + Math.random() * 0.011, size: 1.4 + Math.random() * 2.2,
          color: Math.random() < 0.7 ? base : pick(),
        })
      }
    }

    const t0 = performance.now()
    let last = -1e9
    let raf
    const frame = (now) => {
      const t = now - t0
      if (t < duration && now - last > gap) {
        last = now
        burst(w * (0.15 + Math.random() * 0.7), h * (0.1 + Math.random() * 0.4))
      }
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = 'rgba(0,0,0,0.2)'
      ctx.fillRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        p.vx *= 0.985
        p.vy = p.vy * 0.985 + 0.07
        p.x += p.vx
        p.y += p.vy
        p.life -= p.decay
        if (p.life <= 0) { parts.splice(i, 1); continue }
        ctx.globalAlpha = p.life
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      if (t < duration || parts.length) raf = requestAnimationFrame(frame)
      else ctx.clearRect(0, 0, w, h)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [rarity])

  return <canvas ref={ref} className="fireworks" aria-hidden="true" />
}

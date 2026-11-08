import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { motion, window4 } from '../three/motion'
import { bySlug, formatINR, noteImage } from '../data/products'
import { useCart } from '../state/cart'

gsap.registerPlugin(ScrollTrigger)
const RawahScene = lazy(() => import('../three/RawahScene'))

type Chapter = { from: number; in: number; out: number; to: number; side: 'center' | 'left'; bottom?: boolean; node: React.ReactNode }

const tiers = [
  { name: 'Top', tone: '#e8c98a', notes: ['Woody', 'Balsamic', 'Powdery'], line: 'The first minute. Dry wood and resin, softened by a cosmetic powder.' },
  { name: 'Heart', tone: '#c98a58', notes: ['Musky', 'Warm Spicy', 'Tobacco'], line: 'An hour in. Clean musk, a spice cabinet and cured tobacco leaf.' },
  { name: 'Base', tone: '#a48a6a', notes: ['Oud', 'Amber', 'Metallic'], line: 'What stays on the collar. Oud and amber, with a cold mineral edge.' },
]

export default function RawahStory() {
  const section = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const chapterRefs = useRef<(HTMLDivElement | null)[]>([])
  const [hint, setHint] = useState(true)
  const add = useCart((s) => s.add)
  const rawah = bySlug('rawah')!

  const chapters: Chapter[] = [
    {
      from: -1, in: 0, out: 0.08, to: 0.13, side: 'center',
      node: (
        <>
          <p className="eyebrow">Abzari Paris · Eau de Parfum</p>
          <h1 className="story-title">Rawah</h1>
          <p className="story-sub">Oud, worn close.</p>
        </>
      ),
    },
    {
      from: 0.13, in: 0.17, out: 0.29, to: 0.33, side: 'center',
      node: (
        <>
          <p className="eyebrow">The flacon</p>
          <h2 className="story-h">A pebble of glass, heavy in the hand.</h2>
          <p className="story-p">Gold foil on black, a lacquered sphere for a crown.</p>
        </>
      ),
    },
    {
      from: 0.34, in: 0.37, out: 0.43, to: 0.46, side: 'center',
      node: (
        <>
          <p className="eyebrow">Open it</p>
          <h2 className="story-h">Lift the crown.</h2>
        </>
      ),
    },
    ...tiers.map((t, i) => {
      const a = [0.46, 0.63, 0.8][i]
      return {
        from: a, in: a + 0.03, out: a + 0.13, to: a + 0.16, side: 'left' as const,
        node: (
          <>
            <p className="eyebrow" style={{ color: t.tone }}>{t.name} notes</p>
            <ul className="note-list">
              {t.notes.map((n) => (
                <li key={n}>
                  <img className="note-img" src={noteImage(n)} alt="" style={{ borderColor: t.tone }} />
                  {n}
                </li>
              ))}
            </ul>
            <p className="story-p">{t.line}</p>
          </>
        ),
      }
    }),
    {
      from: 0.94, in: 0.97, out: 2, to: 3, side: 'left',
      node: (
        <div className="story-buy">
          <p className="eyebrow">50ml Eau de Parfum</p>
          <h2 className="story-h">Keep it close.</h2>
          <p className="story-price">
            {formatINR(rawah.price)} <s>{formatINR(rawah.compareAt!)}</s>
          </p>
          <div className="story-actions">
            <button className="btn btn-gold" onClick={() => add('rawah')}>Add to bag</button>
            <Link className="btn btn-ghost-light" to="/product/rawah">Details</Link>
          </div>
        </div>
      ),
    },
  ]

  useEffect(() => {
    const el = section.current
    if (!el) return
    const apply = (p: number) => {
      motion.progress = p
      chapters.forEach((c, i) => {
        const node = chapterRefs.current[i]
        if (!node) return
        const o = c.from < 0 ? 1 - Math.min(1, Math.max(0, (p - c.out) / (c.to - c.out))) : window4(p, c.from, c.in, c.out, c.to)
        node.style.opacity = String(o)
        node.style.transform = `translate3d(0, ${(1 - o) * (p < c.in ? 24 : -24)}px, 0)`
        node.style.visibility = o < 0.01 ? 'hidden' : 'visible'
        node.style.pointerEvents = o > 0.6 ? 'auto' : 'none'
      })
    }
    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (s) => apply(s.progress),
    })
    apply(0)
    return () => st.kill()
  }, [])

  // Drag to turn the bottle. Releasing flicks the oil.
  useEffect(() => {
    const el = stage.current
    if (!el) return
    let down = false
    let lx = 0
    let ly = 0
    let id = -1
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('a,button')) return
      down = true
      id = e.pointerId
      lx = e.clientX
      ly = e.clientY
      setHint(false)
    }
    const onMove = (e: PointerEvent) => {
      if (!down || e.pointerId !== id) return
      const dx = e.clientX - lx
      const dy = e.clientY - ly
      lx = e.clientX
      ly = e.clientY
      motion.dragY += dx * 0.012
      motion.dragX = Math.max(-0.5, Math.min(0.5, motion.dragX + dy * 0.004))
      motion.impulse += dx * 0.004
    }
    const onUp = () => {
      down = false
      gsap.to(motion, { dragX: 0, duration: 1.4, ease: 'elastic.out(1, 0.5)' })
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  return (
    <section ref={section} className="story" aria-label="Rawah">
      <div ref={stage} className="story-stage">
        <div className="story-glow" aria-hidden />
        <Suspense fallback={<div className="story-loading">Rawah</div>}>
          <RawahScene />
        </Suspense>
        {chapters.map((c, i) => (
          <div
            key={i}
            ref={(n) => {
              chapterRefs.current[i] = n
            }}
            className={`story-chapter story-${c.side} ${c.bottom ? 'is-bottom' : ''}`}
          >
            {c.node}
          </div>
        ))}
        <div className={`story-hint ${hint ? '' : 'is-gone'}`} aria-hidden>
          Drag to swirl · Scroll to open
        </div>
      </div>
    </section>
  )
}

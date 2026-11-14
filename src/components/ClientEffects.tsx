'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { motion } from '../three/motion'
import { useCart } from '../state/cart'

gsap.registerPlugin(ScrollTrigger)

/** Browser-only effects shared by every page: smooth scrolling and restoring the saved bag. */
export default function ClientEffects() {
  const pathname = usePathname()

  // The bag lives in localStorage. Restore it after the first render so the server HTML
  // (always an empty bag) and the first browser render match.
  useEffect(() => {
    void useCart.persist.rehydrate()
  }, [])

  useEffect(() => {
    if (motion.reduced) return
    const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9 })
    lenis.on('scroll', ScrollTrigger.update)
    const tick = (t: number) => lenis.raf(t * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
    }
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
    requestAnimationFrame(() => ScrollTrigger.refresh())
  }, [pathname])

  return null
}

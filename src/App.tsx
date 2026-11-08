import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Header from './components/Header'
import Footer from './components/Footer'
import CartDrawer from './components/CartDrawer'
import Home from './pages/Home'
// Home ships in the first bundle; every other page loads on demand.
const Shop = lazy(() => import('./pages/Shop'))
const ProductPage = lazy(() => import('./pages/ProductPage'))
const Checkout = lazy(() => import('./pages/Checkout'))
const About = lazy(() => import('./pages/About'))
const Contact = lazy(() => import('./pages/Contact'))
const Policies = lazy(() => import('./pages/Policies'))
import { motion } from './three/motion'

gsap.registerPlugin(ScrollTrigger)

function SmoothScroll() {
  const { pathname } = useLocation()
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

// The hosted preview cannot use real URL paths, so it keeps routes in memory.
const Router = import.meta.env.MODE === 'preview-page' ? MemoryRouter : BrowserRouter

export default function App() {
  return (
    <Router>
      <SmoothScroll />
      <Header />
      <CartDrawer />
      <main>
        <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/product/:slug" element={<ProductPage />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/policies" element={<Policies />} />
          <Route path="*" element={<ProductPage />} />
        </Routes>
        </Suspense>
      </main>
      <Footer />
    </Router>
  )
}

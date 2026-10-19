import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)

/**
 * Smooth-scroll foundation (E&M Studio signature feel).
 *
 * Lenis drives the scroll, GSAP's ticker drives Lenis, and every Lenis
 * scroll event pings ScrollTrigger so pins/scrubs stay in sync.
 *
 * Rules enforced here (per the studio recipe):
 *  - DESKTOP ONLY: only enabled under `(pointer: fine)`. Coarse-pointer
 *    / touch devices keep native scrolling.
 *  - `syncTouch: false` ALWAYS — never hijack touch scrolling (it froze
 *    iOS Safari on a previous build).
 *  - `lerp: 0.1` — a heavy, weighted glide (flick → coast).
 *  - Disabled entirely under `prefers-reduced-motion`.
 *
 * Returns a cleanup function.
 */
export function initSmoothScroll(): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const finePointer = window.matchMedia('(pointer: fine)').matches

  // Re-measure pins once the display fonts have loaded (layout shifts).
  document.fonts?.ready.then(() => ScrollTrigger.refresh()).catch(() => {})

  // Native scroll on touch / coarse pointers and under reduced-motion.
  // ScrollTrigger still works — it just reads the native scroll position.
  if (reduced || !finePointer) {
    return () => {}
  }

  const lenis = new Lenis({
    autoRaf: false,
    smoothWheel: true,
    syncTouch: false, // never hijack touch
    lerp: 0.1, // heavy, weighted glide
    wheelMultiplier: 0.9,
  })

  lenis.on('scroll', ScrollTrigger.update)

  const raf = (time: number) => {
    lenis.raf(time * 1000)
  }
  gsap.ticker.add(raf)
  gsap.ticker.lagSmoothing(0)

  // Expose for programmatic nav (Book a Tasting CTA → form).
  ;(window as unknown as { __lenis?: Lenis }).__lenis = lenis

  return () => {
    gsap.ticker.remove(raf)
    lenis.destroy()
    delete (window as unknown as { __lenis?: Lenis }).__lenis
  }
}

/**
 * Smoothly scroll to an element by id (or the top). Uses Lenis when it is
 * active (desktop, motion allowed), otherwise a native smooth scroll —
 * both honoured by a single call site (nav + hero CTA).
 */
export function scrollToId(id: string): void {
  const target = document.getElementById(id)
  if (!target) return
  const lenis = (window as unknown as { __lenis?: Lenis }).__lenis
  if (lenis) {
    lenis.scrollTo(target, { offset: 0, duration: 1.4 })
  } else {
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })
  }
}

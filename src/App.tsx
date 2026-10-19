import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { initSmoothScroll, scrollToId } from './lib/smoothScroll'
import { createDropScene } from './scene/drop'

gsap.registerPlugin(ScrollTrigger)

const RINGS = ['הזרקות', 'לייזר', 'טיפולי עור', 'טיפוח']
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function App() {
  const sectionRef = useRef<HTMLElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelRefs = useRef<HTMLElement[]>([])

  useEffect(() => initSmoothScroll(), [])

  useEffect(() => {
    const section = sectionRef.current!
    let scene: ReturnType<typeof createDropScene> | undefined
    try {
      scene = createDropScene(canvasRef.current!, labelRefs.current, { reducedMotion })
    } catch {
      section.dataset.nogl = '' // no WebGL: captions still read fine on the porcelain background
    }
    if (reducedMotion) {
      section.style.setProperty('--p', '0.95')
      return () => scene?.dispose()
    }
    const st = ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        section.style.setProperty('--p', self.progress.toFixed(4))
        scene?.setProgress(self.progress)
      },
    })
    return () => {
      st.kill()
      scene?.dispose()
    }
  }, [])

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:right-3 focus:z-50 focus:bg-porcelain focus:px-4 focus:py-2">
        דילוג לתוכן
      </a>

      <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-6 py-5 md:px-12">
        <a href="#top" className="font-latin text-2xl tracking-[0.35em] text-ink" aria-label="LUMA, לראש העמוד">LUMA</a>
        <nav className="hidden gap-9 text-sm tracking-wide md:flex" aria-label="ראשי">
          <a href="#approach" className="hover:text-clay-deep">הגישה</a>
          <a href="#approach" className="hover:text-clay-deep">טיפולים</a>
          <a href="#approach" className="hover:text-clay-deep">המרחב</a>
          <a href="#approach" className="hover:text-clay-deep">שאלות</a>
        </nav>
        <button onClick={() => scrollToId('approach')} className="rounded-full border border-ink/70 px-5 py-2 text-sm transition hover:bg-ink hover:text-porcelain">
          תיאום ייעוץ
        </button>
      </header>

      <main id="main">
        <section id="top" ref={sectionRef} className={reducedMotion ? 'relative h-svh' : 'relative h-[520vh]'} aria-label="LUMA, פתיחה">
          <div className="sticky top-0 h-svh overflow-hidden">
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />

            {/* 0 → 0.13 : opening */}
            <div className="cap pointer-events-none absolute inset-x-0 top-[13vh] text-center" style={{ '--b': 0.13 } as React.CSSProperties}>
              <p className="mb-3 text-xs tracking-[0.4em] text-clay-deep">קליניקה לאסתטיקה רפואית</p>
              <h1 className="font-latin text-[clamp(4.5rem,13vw,11rem)] font-light leading-none tracking-[0.18em] text-ink">LUMA</h1>
            </div>
            <div className="cap absolute inset-x-0 bottom-[9vh] px-6 text-center" style={{ '--b': 0.13 } as React.CSSProperties}>
              <p className="font-display text-[clamp(1.6rem,3.2vw,2.6rem)] leading-tight">העור שלך, רק רגוע יותר.</p>
              <p className="mt-3 text-sm text-ink/70">גללו למטה</p>
            </div>

            {/* 0.17 → 0.37 */}
            <div className="cap pointer-events-none absolute inset-x-0 bottom-[12vh] px-6 text-center md:inset-x-auto md:right-[8vw] md:bottom-auto md:top-[38vh] md:text-right" style={{ '--a': 0.17, '--b': 0.37 } as React.CSSProperties}>
              <p className="font-display text-[clamp(1.7rem,3.4vw,3rem)] leading-[1.15]">כל טיפול מתחיל<br />בשאלה אחת:</p>
              <p className="mt-2 font-display text-[clamp(1.7rem,3.4vw,3rem)] text-clay-deep">מה נכון לך.</p>
            </div>

            {/* ring labels — positioned every frame by the scene */}
            {RINGS.map((name, i) => (
              <span
                key={name}
                ref={(el) => { if (el) labelRefs.current[i] = el }}
                className="pointer-events-none absolute left-0 top-0 opacity-0 will-change-transform"
              >
                <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-clay" />
                <span className="absolute -translate-x-1/2 -translate-y-[130%] whitespace-nowrap font-display text-lg md:text-2xl md:-translate-x-[105%] md:-translate-y-1/2">
                  {name}
                </span>
              </span>
            ))}

            {/* 0.88 → end */}
            <div className="cap absolute inset-x-0 top-[12vh] px-6 text-center" style={{ '--a': 0.88 } as React.CSSProperties}>
              <p className="font-display text-[clamp(2rem,4.4vw,3.8rem)]">ארבעה תחומים. ייעוץ אחד.</p>
              <p className="mx-auto mt-3 max-w-md text-ink/75">כל טיפול ב-LUMA מתחיל בפגישת ייעוץ אישית עם רופא/ה, ורק אחריה מחליטים יחד.</p>
            </div>
          </div>
        </section>

        <section id="approach" className="flex min-h-svh items-center justify-center px-6">
          <p className="font-display text-3xl text-ink/60">כאן ימשיך שאר האתר (שלב הבא)</p>
        </section>
      </main>
    </>
  )
}

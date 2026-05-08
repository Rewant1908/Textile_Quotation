import { useState, useEffect, useRef } from 'react'
import { gsap }                        from 'gsap'
import API                             from '../api'

/* ── Static data ─────────────────────────────────────────────────── */
const fabricTypes = [
  { label: 'Suiting',         cls: 'tile-suiting',        desc: 'Wool blends, twills & pinstripes for formal wear' },
  { label: 'Shirting',        cls: 'tile-shirting',       desc: 'Poplin, oxford & fine cotton for shirts' },
  { label: 'Cotton',          cls: 'tile-cotton',         desc: 'Breathable everyday fabric in classic weaves' },
  { label: 'Fine Cashmere',   cls: 'tile-fine-cashmere',  desc: 'Luxurious soft fibre for premium dealers' },
  { label: 'Dress Material',  cls: 'tile-dress-material', desc: 'Vibrant dress cloth for ladies & occasion wear' },
  { label: 'Uniform Fabric',  cls: 'tile-uniform-fabric', desc: 'Durable institutional fabric for schools & offices' },
]

const sampleProducts = [
  { name: 'Suit Length Lots',        type: 'Suiting',       detail: 'Finished suiting cloth in wholesale lots for suit and pant fabric dealers.', cls: 'sample-image-suiting' },
  { name: 'Shirt & Pant Piece Lots', type: 'Shirting',      detail: 'Shirting and pant-piece fabric lots for tailors, retailers, and local dealer counters.', cls: 'sample-image-shirting' },
  { name: 'School Uniform Fabric',   type: 'Dress Material',detail: 'Durable finished cloth lots for school dress, uniform, and institutional fabric.', cls: 'sample-image-uniform' },
]

const stats = [
  { value: 20, suffix: '+', label: 'Years in Trade' },
  { value: 3,  suffix: '',  label: 'Core Fabric Lines' },
  { value: 13, suffix: '%', label: 'Nepal VAT Quotations' },
  { value: 50, suffix: '+', label: 'Dealer Partners' },
]

const processSteps = [
  { num: '01', title: 'Request Access',  body: 'Dealers sign up for a portal account and await admin approval for quotation access.' },
  { num: '02', title: 'Browse Fabrics',  body: 'Explore wholesale fabric lines — suiting, shirting, cotton, uniform and dress material.' },
  { num: '03', title: 'Generate Quote',  body: 'Create itemised quotations with Nepal VAT, per-metre pricing, and dealer notes.' },
  { num: '04', title: 'Confirm & Trade', body: 'Admin reviews and approves. Fabric lots are dispatched through the wholesale channel.' },
]


/* ================================================================
   RIPPLE CANVAS — mouse-driven cloth ripple
   ================================================================ */
function mountRippleCanvas() {
  const canvas = document.getElementById('kt-ripple-canvas')
  if (!canvas) return
  canvas.style.display = 'block'
  const COLS = 64, ROWS = 40
  const ctx  = canvas.getContext('2d')
  canvas.width = COLS; canvas.height = ROWS
  const pts = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => ({ x: c, y: r, dy: 0 }))
  )
  let mx = -1, my = -1, raf, active = true
  const onMove = (e) => {
    const rect = canvas.getBoundingClientRect()
    mx = ((e.clientX - rect.left) / rect.width)  * COLS
    my = ((e.clientY - rect.top)  / rect.height) * ROWS
  }
  window.addEventListener('mousemove', onMove, { passive: true })
  const stop  = () => { active = false; cancelAnimationFrame(raf) }
  const start = () => { if (!active) { active = true; tick() } }
  document.addEventListener('visibilitychange', () =>
    document.visibilityState === 'visible' ? start() : stop()
  )
  const io = new IntersectionObserver(([e]) =>
    e.isIntersecting ? start() : stop(), { threshold: 0 }
  )
  io.observe(canvas)
  function tick() {
    if (!active) return
    raf = requestAnimationFrame(tick)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (mx >= 0) {
          const dx = c - mx, dy = r - my
          const d2 = dx*dx + dy*dy
          if (d2 < 80) pts[r][c].dy += (1 - d2/80) * 0.12
        }
        pts[r][c].dy *= 0.88
        pts[r][c].y   = r + pts[r][c].dy
      }
    }
    ctx.clearRect(0, 0, COLS, ROWS)
    for (let r = 1; r < ROWS - 1; r += 2) {
      ctx.beginPath()
      ctx.strokeStyle = r % 4 === 0 ? 'rgba(185,137,69,0.28)' : 'rgba(143,29,29,0.22)'
      ctx.lineWidth = 0.35
      ctx.moveTo(0, pts[r][0].y)
      for (let c = 1; c < COLS; c++) ctx.lineTo(c, pts[r][c].y)
      ctx.stroke()
    }
    for (let c = 1; c < COLS - 1; c += 3) {
      ctx.beginPath()
      ctx.strokeStyle = 'rgba(143,29,29,0.14)'
      ctx.lineWidth = 0.2
      ctx.moveTo(pts[0][c].x, 0)
      for (let r = 1; r < ROWS; r++) ctx.lineTo(pts[r][c].x, r)
      ctx.stroke()
    }
  }
  tick()
  return () => { stop(); io.disconnect(); window.removeEventListener('mousemove', onMove) }
}


/* ================================================================
   GSAP PRELOADER
   ================================================================ */
function runPreloader(onDone) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.getElementById('kt-preloader')?.classList.add('pre-done')
    onDone(); return
  }
  const tl = gsap.timeline({ defaults: { ease: 'expo.out', force3D: true } })
  tl.to('.pre-progress', { width: '100%', duration: 3.0, ease: 'power2.inOut' }, 0)
  tl.to('.pre-bolt', { scaleX: 1, duration: 0.8, ease: 'expo.out', transformOrigin: 'left center' }, 0.05)
    .to('.pre-bolt-sheen', { xPercent: 300, duration: 0.75, ease: 'power2.inOut' }, 0.1)
    .to('.pre-bolt', { xPercent: 110, duration: 0.55, ease: 'expo.in' }, 0.65)
  tl.to('.pre-drape', { y: '0%', stagger: 0.1, duration: 0.65, ease: 'back.out(1.4)' }, 0.08)
    .to('.pre-drape', { y: '-110%', stagger: 0.08, duration: 0.45, ease: 'power2.in' }, 0.65)
  tl.to('.pre-thread', { scaleX: 1, stagger: 0.055, duration: 0.55, ease: 'power3.out', transformOrigin: 'left center' }, 0.9)
    .to('.pre-needle', { x: '100vw', duration: 0.5, ease: 'power2.inOut' }, 0.92)
    .to('.pre-weave',  { opacity: 1, duration: 0.4 }, 1.1)
    .to('.pre-thread', { opacity: 0, duration: 0.35 }, 1.35)
  tl.to('.pre-silk', { opacity: 1, duration: 0.35 }, 1.4)
  tl.fromTo('.pre-logo', { opacity: 0, y: 32, filter: 'blur(8px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.4, ease: 'power3.out' }, 1.45)
  tl.fromTo('.pre-letter', { opacity: 0, y: -28, rotateX: -80, filter: 'blur(6px)' },
    { opacity: 1, y: 0, rotateX: 0, filter: 'blur(0px)', stagger: { each: 0.07, ease: 'power1.inOut' }, duration: 0.42, ease: 'back.out(1.8)' }, 1.55)
  tl.to('.pre-cursor', { opacity: 0, duration: 0.2, repeat: 5, yoyo: true }, 1.55)
  tl.to('.pre-cursor', { opacity: 0, duration: 0.15 }, 2.05)
  tl.to('.pre-divider', { scaleX: 1, duration: 0.55, transformOrigin: 'center', ease: 'power2.out' }, 1.88)
  tl.to('.pre-brand-sub', { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }, 2.02)
  tl.fromTo(['.pre-curtain-left', '.pre-curtain-right'], { xPercent: 0 },
    { xPercent: (i) => i === 0 ? -105 : 105, duration: 0.85, ease: 'expo.inOut' }, 2.65)
    .to('.pre-logo', { opacity: 0, scale: 0.92, duration: 0.35 }, 2.65)
    .to('.pre-silk',  { opacity: 0, duration: 0.3 }, 2.65)
  tl.to('.page-reveal', { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.65, ease: 'power2.out',
    onStart: () => document.querySelector('.page-reveal')?.classList.add('pre-visible') }, 3.0)
  tl.add(() => { document.getElementById('kt-preloader')?.classList.add('pre-done'); onDone() }, 3.5)
}


/* ================================================================
   ANIMATED COUNTER HOOK
   ================================================================ */
function useCountUp(target, duration = 1800) {
  const [count, setCount] = useState(0)
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      io.disconnect()
      let start = null
      const step = (ts) => {
        if (!start) start = ts
        const progress = Math.min((ts - start) / duration, 1)
        setCount(Math.floor(progress * target))
        if (progress < 1) requestAnimationFrame(step)
        else setCount(target)
      }
      requestAnimationFrame(step)
    }, { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [target, duration])
  return [count, ref]
}

function StatCard({ value, suffix, label }) {
  const [count, ref] = useCountUp(value)
  return (
    <div className="lp-stat" ref={ref}>
      <strong>{count}{suffix}</strong>
      <span>{label}</span>
    </div>
  )
}

const BRAND_LETTERS = 'KT Impex'.split('')

export default function LoginPage({ onLogin }) {
  const [isSignup,      setIsSignup]      = useState(false)
  const [error,         setError]         = useState('')
  const [success,       setSuccess]       = useState('')
  const [loading,       setLoading]       = useState(false)
  const [preloaderDone, setPreloaderDone] = useState(false)
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true
    gsap.set('.page-reveal', { opacity: 0, y: 18, filter: 'blur(6px)' })
    runPreloader(() => setPreloaderDone(true))
    let cleanup
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      cleanup = mountRippleCanvas()
    }
    return () => cleanup?.()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setSuccess(''); setLoading(true)
    const username = e.target.username.value.trim()
    const password = e.target.password.value.trim()
    const email    = isSignup ? (e.target.email?.value?.trim() || '') : ''
    const endpoint = isSignup ? '/signup' : '/login'
    const body     = isSignup ? { username, password, email } : { username, password }
    try {
      const res  = await API.post(endpoint, body)
      const data = res.data
      if (isSignup) { setIsSignup(false); setSuccess('Account created! Please login.') }
      else onLogin({ user_id: data.user_id, username: data.username, role: data.role })
    } catch (err) {
      setError(err?.response?.data?.error || 'Cannot connect to server. Is the backend running?')
    }
    setLoading(false)
  }

  return (
    <>
      <canvas id="kt-ripple-canvas" aria-hidden="true" />

      {/* ── PRELOADER ─────────────────────────────────────── */}
      <div id="kt-preloader" aria-hidden="true" role="presentation">
        <div className="pre-bolt"><div className="pre-bolt-sheen" /></div>
        <div className="pre-drapes">
          <div className="pre-drape" />
          <div className="pre-drape" />
          <div className="pre-drape" />
        </div>
        <div className="pre-threads">
          {[...Array(8)].map((_,i) => <div key={i} className="pre-thread" />)}
        </div>
        <div className="pre-needle" />
        <div className="pre-weave"  />
        <div className="pre-silk" />
        <div className="pre-logo">
          <div className="pre-name-row" aria-label="KT Impex">
            {BRAND_LETTERS.map((ch, i) =>
              ch === ' '
                ? <span key={i} className="pre-letter-space" aria-hidden="true" />
                : <span key={i} className="pre-letter" aria-hidden="true">{ch}</span>
            )}
            <span className="pre-cursor" aria-hidden="true">|</span>
          </div>
          <div className="pre-divider" />
          <span className="pre-brand-sub">Premium Textile Wholesale</span>
        </div>
        <div className="pre-curtain pre-curtain-left"  />
        <div className="pre-curtain pre-curtain-right" />
        <div className="pre-progress" />
      </div>

      {/* ── MAIN PAGE ─────────────────────────────────────── */}
      <div className="public-page page-reveal">

        {/* ── NAV ──────────────────────────────────────────── */}
        <header className="public-nav">
          <a className="brand public-brand" href="#top">
            <span className="brand-mark">KT</span>
            <span className="brand-copy">
              <span className="brand-name">KT Impex</span>
              <span className="brand-sub">Premium Textile Wholesale</span>
            </span>
          </a>
          <nav className="public-links" aria-label="Public sections">
            <a href="#about">About</a>
            <a href="#fabrics">Fabrics</a>
            <a href="#process">Process</a>
            <a href="#contact">Contact</a>
            <a className="nav-login" href="#login">Dealer Login</a>
          </nav>
        </header>

        <main id="top">

          {/* ══════════════════════════════════════════════════
              HERO — full-height split with cinematic showcase
          ══════════════════════════════════════════════════ */}
          <section className="lp-hero">
            <div className="lp-hero-inner">
              <div className="lp-hero-copy">
                <p className="lp-eyebrow">
                  <span className="lp-eyebrow-dot" />
                  Established c. 2002 · Birgunj, Nepal
                </p>
                <h1 className="lp-hero-h1">
                  <span className="lp-hero-line">Premium</span>
                  <span className="lp-hero-line lp-hero-line--accent">Textile</span>
                  <span className="lp-hero-line">Wholesale</span>
                </h1>
                <p className="lp-hero-body">
                  KT Impex connects trusted factories with dealers across Nepal through
                  finished cloth lots — suiting, shirting, pant pieces, uniform fabric,
                  and dress material — with a transparent digital quotation system.
                </p>
                <div className="lp-hero-actions">
                  <a className="lp-btn lp-btn--primary" href="#about">Explore Company</a>
                  <a className="lp-btn lp-btn--ghost" href="#login">Generate Quotation ↗</a>
                </div>
              </div>
              <div className="cinematic-showcase" aria-label="Animated hanging fabric samples">
                <div className="studio-light light-left" />
                <div className="studio-light light-right" />
                <div className="camera-scan" />
                <div className="fabric-rack">
                  <div className="rack-line" />
                  <div className="fabric-track">
                    {['Suiting Twill','Shirting','Cotton','Fine Cashmere','Uniform Lots','Dress Material',
                      'Suiting Twill','Shirting','Cotton','Fine Cashmere','Uniform Lots','Dress Material'].map((n,i)=>(
                      <article key={i} className={`fabric-sample sample-${['twill','stripe','cotton','cashmere','uniform','dress'][i%6]}`}>
                        <span>{n}</span>
                      </article>
                    ))}
                  </div>
                </div>
                {/* Corner badge */}
                <div className="lp-showcase-badge">B2B Wholesale</div>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════
              MARQUEE TRUST STRIP
          ══════════════════════════════════════════════════ */}
          <div className="lp-marquee" aria-hidden="true">
            <div className="lp-marquee-track">
              {['Wholesale Fabric Lots','Nepal VAT 13%','Suiting · Shirting · Cotton','Dealer Quotation System',
                'Birgunj Trade Hub','Factory-Direct Pricing','Wholesale Fabric Lots','Nepal VAT 13%',
                'Suiting · Shirting · Cotton','Dealer Quotation System','Birgunj Trade Hub','Factory-Direct Pricing'
              ].map((t, i) => <span key={i}>{t}<span className="lp-marquee-dot">◆</span></span>)}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════
              ANIMATED STATS STRIP
          ══════════════════════════════════════════════════ */}
          <section className="lp-stats" aria-label="Company highlights">
            {stats.map(s => <StatCard key={s.label} {...s} />)}
          </section>

          {/* ══════════════════════════════════════════════════
              ABOUT — 2-col editorial
          ══════════════════════════════════════════════════ */}
          <section className="lp-section lp-about" id="about">
            <div className="lp-section-label">
              <span className="lp-dot" />About KT Impex
            </div>
            <div className="lp-about-grid">
              <div className="lp-about-left">
                <h2 className="lp-section-h2">Dealer-first textile distribution for serious wholesale trade.</h2>
                <p>KT Impex is based in Birgunj, Nepal and operates as a B2B textile distributor for retailers,
                fabric dealers, and factory partners. The firm supplies finished cloth in wholesale lots —
                suit lengths, shirt pieces, pant pieces, school uniform cloth, and dress material.
                All quotations include Nepal VAT and are managed digitally for transparency.</p>
              </div>
              <div className="lp-about-right">
                <div className="lp-founder-card">
                  <div className="lp-founder-photo">
                    <img src="/founder.jpeg" alt="Sandeep Kumar Agrawal – Founder, KT Impex"
                      width="120" height="120" loading="lazy" />
                  </div>
                  <div className="lp-founder-info">
                    <p className="lp-founder-role">Founder & Proprietor</p>
                    <h3>Sandeep Kumar Agrawal</h3>
                    <p>Over two decades building direct trade relationships with dealers and factories across the Birgunj corridor.</p>
                  </div>
                </div>
                <div className="lp-pill-row">
                  <span className="lp-pill">Wholesale Only</span>
                  <span className="lp-pill">Nepal VAT 13%</span>
                  <span className="lp-pill">Digital Quotations</span>
                  <span className="lp-pill">B2B Trade</span>
                </div>
              </div>
            </div>
          </section>

          {/* ══════════════════════════════════════════════════
              FABRIC SHOWCASE — enhanced cards
          ══════════════════════════════════════════════════ */}
          <section className="lp-section" id="fabrics">
            <div className="lp-section-top">
              <div>
                <div className="lp-section-label"><span className="lp-dot" />Fabric Lines</div>
                <h2 className="lp-section-h2">Focused product lines for wholesale movement</h2>
              </div>
              <p className="lp-section-sub">Six curated fabric categories sourced from certified factories and supplied in wholesale lots to dealer networks.</p>
            </div>
            <div className="lp-fabric-grid">
              {fabricTypes.map(f => (
                <article key={f.label} className={`lp-fabric-card ${f.cls}`}>
                  <div className="lp-fabric-swatch" />
                  <div className="lp-fabric-body">
                    <h3>{f.label}</h3>
                    <p>{f.desc}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* ══════════════════════════════════════════════════
              PROCESS STEPS
          ══════════════════════════════════════════════════ */}
          <section className="lp-section lp-process-section" id="process">
            <div className="lp-section-label"><span className="lp-dot" />How It Works</div>
            <h2 className="lp-section-h2">From dealer request to fabric delivery</h2>
            <div className="lp-process-grid">
              {processSteps.map((s, i) => (
                <div className="lp-step" key={i}>
                  <div className="lp-step-num">{s.num}</div>
                  <div className="lp-step-connector" />
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ══════════════════════════════════════════════════
              SAMPLE PRODUCTS
          ══════════════════════════════════════════════════ */}
          <section className="lp-section">
            <div className="lp-section-top">
              <div>
                <div className="lp-section-label"><span className="lp-dot" />Sample Products</div>
                <h2 className="lp-section-h2">Catalogue preview without MRP</h2>
              </div>
            </div>
            <div className="lp-sample-grid">
              {sampleProducts.map(p => (
                <article className="lp-sample-card" key={p.name}>
                  <div className={`lp-sample-img ${p.cls}`}>
                    <span className={`badge badge-${p.type.toLowerCase().replace(/ /g,'-')}`}>{p.type}</span>
                  </div>
                  <div className="lp-sample-body">
                    <h3>{p.name}</h3>
                    <p>{p.detail}</p>
                    <a href="#login" className="lp-sample-cta">Request Quotation →</a>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* ══════════════════════════════════════════════════
              TRUST STRIP — full-width dark banner
          ══════════════════════════════════════════════════ */}
          <div className="lp-trust-strip">
            <div className="lp-trust-inner">
              <div className="lp-trust-item">
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Verified Wholesale Lots
              </div>
              <div className="lp-trust-divider" />
              <div className="lp-trust-item">
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                Digital VAT Quotations
              </div>
              <div className="lp-trust-divider" />
              <div className="lp-trust-item">
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                B2B Dealer Network
              </div>
              <div className="lp-trust-divider" />
              <div className="lp-trust-item">
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/></svg>
                Factory-Direct Pricing
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════
              CONTACT + LOGIN — enhanced 2-col layout
          ══════════════════════════════════════════════════ */}
          <section className="lp-section lp-contact-section" id="contact">
            <div className="lp-contact-grid">
              {/* Left: Contact info */}
              <div className="lp-contact-panel">
                <div className="lp-section-label"><span className="lp-dot" />Location & Contact</div>
                <h2 className="lp-section-h2">Birgunj, Madhesh Province, Nepal</h2>
                <div className="lp-contact-details">
                  <div className="lp-contact-row">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
                    <span>KT Impex — Firm</span>
                  </div>
                  <div className="lp-contact-row">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                    <span>Sandeep Kumar Agrawal, Founder</span>
                  </div>
                  <div className="lp-contact-row">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                    <span>Finished cloth lots — not stitched products</span>
                  </div>
                  <div className="lp-contact-row">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2z"/></svg>
                    <span>13% Nepal VAT on all quotations</span>
                  </div>
                </div>
                <div className="lp-contact-tagline">
                  Wholesale access requires a dealer account.
                  <a href="#login"> Sign up below →</a>
                </div>
              </div>

              {/* Right: Login card */}
              <div className="lp-login-card" id="login">
                <div className="lp-login-header">
                  <span className="brand-mark" aria-hidden="true">KT</span>
                  <div>
                    <div className="lp-login-title-row">Dealer Portal</div>
                    <div className="lp-login-sub">Wholesale quotation system</div>
                  </div>
                </div>
                <h2 className="lp-login-h2">{isSignup ? 'Create Account' : 'Sign in'}</h2>
                <p className="login-subtext">Login to register dealers and generate quotations.</p>
                <form className="login-form" onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label htmlFor="username">Username</label>
                    <input id="username" name="username" type="text" placeholder="Enter username" required />
                  </div>
                  {isSignup && (
                    <div className="form-group">
                      <label htmlFor="email">Email (optional)</label>
                      <input id="email" name="email" type="email" placeholder="Enter email" />
                    </div>
                  )}
                  <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input id="password" name="password" type="password" placeholder="Enter password" required />
                  </div>
                  {error   && <p className="login-error">{error}</p>}
                  {success && <p className="login-success">{success}</p>}
                  <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
                    {loading ? 'Please wait…' : isSignup ? 'Create Account' : 'Login →'}
                  </button>
                </form>
                <p className="login-toggle">
                  {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
                  <span onClick={() => { setIsSignup(!isSignup); setError(''); setSuccess('') }}>
                    {isSignup ? 'Login' : 'Sign Up'}
                  </span>
                </p>
              </div>
            </div>
          </section>

        </main>

        {/* ── FOOTER ────────────────────────────────────── */}
        <footer className="lp-footer">
          <div className="lp-footer-inner">
            <div className="lp-footer-brand">
              <span className="brand-mark" style={{ width: 32, height: 32, fontSize: 14 }}>KT</span>
              <span>
                <strong>KT Impex</strong>
                <small>Premium Textile Wholesale · Birgunj, Nepal</small>
              </span>
            </div>
            <nav className="lp-footer-links">
              <a href="#about">About</a>
              <a href="#fabrics">Fabrics</a>
              <a href="#process">Process</a>
              <a href="#contact">Contact</a>
              <a href="#login">Dealer Login</a>
            </nav>
            <p className="lp-footer-copy">© {new Date().getFullYear()} KT Impex. All rights reserved. Wholesale only — not a retail outlet.</p>
          </div>
        </footer>
      </div>
    </>
  )
}

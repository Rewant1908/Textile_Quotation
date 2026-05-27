import { useState, useEffect, useRef } from 'react'
import { gsap }                         from 'gsap'
import API                              from '../api'

/* ── Static data ─────────────────────────────────────────────────── */
const sampleProducts = [
  { name: 'Suit Length Lots',        type: 'Suiting',       detail: 'Finished suiting cloth supplied in wholesale lots for suit and pant fabric dealers.', imageClass: 'sample-image-suiting' },
  { name: 'Shirt & Pant Piece Lots', type: 'Shirting',      detail: 'Shirting and pant-piece fabric lots for tailors, retailers, and local dealer counters.', imageClass: 'sample-image-shirting' },
  { name: 'School Uniform Fabric',   type: 'Dress Material',detail: 'Durable finished cloth lots suitable for school dress, uniform, and institutional fabric.', imageClass: 'sample-image-uniform' },
]
const fabricTypes = ['Suiting', 'Shirting', 'Cotton', 'Fine Cashmere', 'Dress Material', 'Uniform Fabric']


function mountRippleCanvas() {
  const canvas = document.getElementById('kt-ripple-canvas')
  if (!canvas) return
  canvas.style.display = 'block'
  const COLS = 64, ROWS = 40
  const ctx  = canvas.getContext('2d')
  canvas.width  = COLS
  canvas.height = ROWS
  const pts  = Array.from({ length: ROWS }, (_, r) =>
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
  return () => {
    stop(); io.disconnect()
    window.removeEventListener('mousemove', onMove)
  }
}


function runPreloader(onDone) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.getElementById('kt-preloader')?.classList.add('pre-done')
    onDone()
    return
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
  tl.fromTo('.pre-logo',
    { opacity: 0, y: 32, filter: 'blur(8px)' },
    { opacity: 1, y: 0,  filter: 'blur(0px)', duration: 0.4, ease: 'power3.out' }, 1.45
  )
  tl.fromTo('.pre-letter',
    { opacity: 0, y: -28, rotateX: -80, filter: 'blur(6px)' },
    { opacity: 1, y: 0, rotateX: 0, filter: 'blur(0px)', stagger: { each: 0.07, ease: 'power1.inOut' }, duration: 0.42, ease: 'back.out(1.8)' }, 1.55
  )
  tl.to('.pre-cursor', { opacity: 0, duration: 0.2, repeat: 5, yoyo: true }, 1.55)
  tl.to('.pre-cursor', { opacity: 0, duration: 0.15 }, 2.05)
  tl.to('.pre-divider', { scaleX: 1, duration: 0.55, transformOrigin: 'center', ease: 'power2.out' }, 1.88)
  tl.to('.pre-brand-sub', { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }, 2.02)
  .fromTo(['.pre-curtain-left', '.pre-curtain-right'],
    { xPercent: 0 },
    { xPercent: (i) => i === 0 ? -105 : 105, duration: 0.85, ease: 'expo.inOut' }, 2.65
  )
  .to('.pre-logo', { opacity: 0, scale: 0.92, duration: 0.35 }, 2.65)
  .to('.pre-silk',  { opacity: 0, duration: 0.3 }, 2.65)
  .to('.page-reveal', {
    opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.65, ease: 'power2.out',
    onStart: () => document.querySelector('.page-reveal')?.classList.add('pre-visible'),
  }, 3.0)
  tl.add(() => {
    document.getElementById('kt-preloader')?.classList.add('pre-done')
    onDone()
  }, 3.5)
}

const BRAND_LETTERS = 'KT Impex'.split('')

export default function LoginPage({ onLogin }) {
  const [isSignup,      setIsSignup]      = useState(false)
  const [error,         setError]         = useState('')
  const [success,       setSuccess]       = useState('')
  const [loading,       setLoading]       = useState(false)
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true
    gsap.set('.page-reveal', { opacity: 0, y: 18, filter: 'blur(6px)' })
    runPreloader(() => {})
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
    // Fix: backend mounts auth at /api/auth/login and /api/auth/signup
    const endpoint = isSignup ? '/auth/signup' : '/auth/login'
    const body     = isSignup ? { username, password, email } : { username, password }
    try {
      const res  = await API.post(endpoint, body)
      const data = res.data
      if (isSignup) {
        setIsSignup(false)
        setSuccess('Account created! Please login.')
      } else {
        if (data.token) {
          localStorage.setItem('kt_impex_token', data.token)
        }
        localStorage.setItem('kt_impex_user', JSON.stringify({
          user_id:  data.user_id,
          username: data.username,
          role:     data.role,
        }))
        onLogin({ user_id: data.user_id, username: data.username, role: data.role })
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Cannot connect to server. Is the backend running?')
    }
    setLoading(false)
  }

  return (
    <>
      <canvas id="kt-ripple-canvas" aria-hidden="true" />
      <div id="kt-preloader" aria-hidden="true" role="presentation">
        <div className="pre-bolt"><div className="pre-bolt-sheen" /></div>
        <div className="pre-drapes">
          <div className="pre-drape" /><div className="pre-drape" /><div className="pre-drape" />
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

      <div className="public-page page-reveal">
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
            <a href="#factory">Factory</a>
            <a href="#contact">Contact</a>
            <a className="nav-login" href="#login">Dealer Login</a>
          </nav>
        </header>

        <main id="top" className="public-main">
          <section className="public-hero">
            <div className="public-hero-copy">
              <p className="eyebrow">Established around 2002 | Birgunj, Nepal</p>
              <h1>KT Impex</h1>
              <p>A premium wholesale textile operating portal connecting trusted factories, serious dealers, live quotations, stock intelligence, and dispatch visibility.</p>
              <div className="hero-actions">
                <a className="btn btn-primary" href="#about">Explore Company</a>
                <a className="btn btn-secondary" href="#login">Generate Quotation</a>
              </div>
              <div className="hero-stat-grid" aria-label="KT Impex trade highlights">
                <span><strong>20+</strong> Years in textile trade</span>
                <span><strong>4</strong> Dealer portal workflows</span>
                <span><strong>13%</strong> VAT-ready quotations</span>
              </div>
            </div>
            <div className="cinematic-showcase" aria-label="Animated hanging fabric samples">
              <div className="studio-light light-left" />
              <div className="studio-light light-right" />
              <div className="camera-scan" />
              <div className="showcase-caption">
                <span>Live Textile Desk</span>
                <strong>Factory lots to dealer quotation in one flow</strong>
              </div>
              <div className="fabric-rack">
                <div className="rack-line" />
                <div className="fabric-track">
                  {['Suiting Twill','Shirting','Cotton','Fine Cashmere','Uniform Lots','Dress Material',
                    'Suiting Twill','Shirting','Cotton','Fine Cashmere','Uniform Lots','Dress Material'].map((n,i)=>(
                    <article key={i} className={`fabric-sample sample-${['twill','stripe','cotton','cashmere','uniform','dress'][i%6]}`}><span>{n}</span></article>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="public-section about-layout" id="about">
            <div>
              <p className="eyebrow">About KT Impex</p>
              <h2>Dealer-first textile distribution for serious wholesale trade.</h2>
            </div>
            <p>KT Impex is based in Birgunj, Nepal and operates as a B2B textile dealer for retailers, fabric dealers, and factory partners. The firm supplies finished cloth in wholesale lots: suit lengths, shirt pieces, pant pieces, school uniform cloth, and dress material.</p>
          </section>

          <section className="public-section founder-section">
            <div className="founder-card">
              <div className="founder-photo-wrap">
                <img src="/founder.jpeg" alt="Sandeep Kumar Agrawal – Founder, KT Impex"
                  className="founder-photo-img" width="160" height="160" loading="lazy" />
              </div>
              <div>
                <p className="eyebrow">Founder</p>
                <h2>Sandeep Kumar Agrawal</h2>
                <p>The firm has grown through direct trade relationships with dealers and factories, with Birgunj as its operating base.</p>
              </div>
            </div>
            <div className="metrics-grid" aria-label="Company highlights">
              <span><strong>20+</strong> years in trade</span>
              <span><strong>3</strong> core fabric lines</span>
              <span><strong>13%</strong> Nepal VAT quotations</span>
            </div>
          </section>

          <section className="public-section" id="fabrics">
            <div className="section-heading">
              <p className="eyebrow">Fabric Types</p>
              <h2>Focused product lines for wholesale movement</h2>
            </div>
            <div className="fabric-showcase">
              {fabricTypes.map(type => (
                <article className={`fabric-tile tile-${type.toLowerCase().replace(/ /g,'-')}`} key={type}>
                  <span>{type}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="public-section" id="factory">
            <div className="split-panel">
              <div>
                <p className="eyebrow">Factory Connection</p>
                <h2>Factories trust KT Impex as their dealer channel.</h2>
                <p>KT Impex helps factories move selected lots through dealer networks while giving dealers a consistent place to request quotations and track approvals.</p>
              </div>
              <ul className="clean-list">
                <li>Wholesale-focused dealer relationships</li>
                <li>Factory-sourced finished cloth lots, not stitched products</li>
                <li>Suit, shirt, pant, school dress, and dress material fabric lots</li>
                <li>Quotation workflow for approved trade users</li>
              </ul>
            </div>
          </section>

          <section className="public-section">
            <div className="section-heading inline">
              <div>
                <p className="eyebrow">Sample Products</p>
                <h2>Catalogue preview without MRP</h2>
              </div>
            </div>
            <div className="sample-grid">
              {sampleProducts.map(product => (
                <article className="sample-card" key={product.name}>
                  <div className={`sample-image ${product.imageClass}`} />
                  <div className="sample-body">
                    <span className={`badge badge-${product.type.toLowerCase().replace(/ /g,'-')}`}>{product.type}</span>
                    <h3>{product.name}</h3>
                    <p>{product.detail}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="public-section contact-login-layout" id="contact">
            <div className="contact-panel">
              <p className="eyebrow">Location & Contact</p>
              <h2>Birgunj, Nepal</h2>
              <p>Firm: KT Impex</p>
              <p>Founder: Sandeep Kumar Agrawal</p>
              <p>Trade: Finished cloth lots for dealers and factory partners</p>
            </div>

            <div className="login-card" id="login">
              <div className="login-header">
                <span className="brand-mark">KT</span>
                <span className="login-brand-name">Dealer Portal</span>
              </div>
              <h2 className="login-title">{isSignup ? 'Create Account' : 'Sign in'}</h2>
              <p className="login-subtext">Login only to register dealers and generate quotations.</p>
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
                  {loading ? '...' : isSignup ? 'Create Account' : 'Login'}
                </button>
              </form>
              <p className="login-toggle">
                {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
                <span onClick={() => { setIsSignup(!isSignup); setError(''); setSuccess('') }}>
                  {isSignup ? 'Login' : 'Sign Up'}
                </span>
              </p>
            </div>
          </section>
        </main>
        <footer className="public-footer">
          <div>
            <strong>KT Impex</strong>
            <span>Premium Textile Wholesale, Birgunj, Nepal</span>
          </div>
          <nav aria-label="Footer links">
            <a href="#about">About</a>
            <a href="#fabrics">Fabrics</a>
            <a href="#login">Dealer Login</a>
          </nav>
        </footer>
      </div>
    </>
  )
}

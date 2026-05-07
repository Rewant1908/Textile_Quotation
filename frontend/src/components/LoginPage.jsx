import { useState } from 'react'
import API from '../api'

const sampleProducts = [
    {
        name: 'Suit Length Lots',
        type: 'Suiting',
        detail: 'Finished suiting cloth supplied in wholesale lots for suit and pant fabric dealers.',
        imageClass: 'sample-image-suiting',
    },
    {
        name: 'Shirt & Pant Piece Lots',
        type: 'Shirting',
        detail: 'Shirting and pant-piece fabric lots for tailors, retailers, and local dealer counters.',
        imageClass: 'sample-image-shirting',
    },
    {
        name: 'School Uniform Fabric Lots',
        type: 'Dress Material',
        detail: 'Durable finished cloth lots suitable for school dress, uniform, and institutional fabric demand.',
        imageClass: 'sample-image-uniform',
    },
]

const fabricTypes = ['Suiting', 'Shirting', 'Cotton', 'Fine Cashmere', 'Dress Material', 'Uniform Fabric']

export default function LoginPage({ onLogin }) {
    const [isSignup, setIsSignup] = useState(false)
    const [error, setError]       = useState('')
    const [success, setSuccess]   = useState('')
    const [loading, setLoading]   = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setSuccess('')
        setLoading(true)
        const username = e.target.username.value.trim()
        const password = e.target.password.value.trim()
        const email    = isSignup ? (e.target.email?.value?.trim() || '') : ''

        const endpoint = isSignup ? '/signup' : '/login'
        const body     = isSignup ? { username, password, email } : { username, password }

        try {
            const res  = await API.post(endpoint, body)
            const data = res.data
            if (isSignup) {
                setIsSignup(false)
                setSuccess('Account created! Please login.')
            } else {
                onLogin({ user_id: data.user_id, username: data.username, role: data.role })
            }
        } catch (err) {
            const msg = err?.response?.data?.error
            setError(msg || 'Cannot connect to server. Is the backend running?')
        }
        setLoading(false)
    }

    return (
        <div className="public-page">
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
                        <p>
                            A wholesale textile firm connecting trusted factories with dealers
                            through finished cloth lots for suiting, shirting, pant pieces,
                            school dress fabric, and dress material supply.
                        </p>
                        <div className="hero-actions">
                            <a className="btn btn-primary" href="#about">Explore Company</a>
                            <a className="btn btn-secondary" href="#login">Generate Quotation</a>
                        </div>
                    </div>
                    <div className="cinematic-showcase" aria-label="Animated hanging fabric samples">
                        <div className="studio-light light-left" />
                        <div className="studio-light light-right" />
                        <div className="camera-scan" />
                        <div className="fabric-rack">
                            <div className="rack-line" />
                            <div className="fabric-track">
                                <article className="fabric-sample sample-twill">
                                    <span>Suiting Twill</span>
                                </article>
                                <article className="fabric-sample sample-stripe">
                                    <span>Shirting</span>
                                </article>
                                <article className="fabric-sample sample-cotton">
                                    <span>Cotton</span>
                                </article>
                                <article className="fabric-sample sample-cashmere">
                                    <span>Fine Cashmere</span>
                                </article>
                                <article className="fabric-sample sample-uniform">
                                    <span>Uniform Lots</span>
                                </article>
                                <article className="fabric-sample sample-dress">
                                    <span>Dress Material</span>
                                </article>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="public-section about-layout" id="about">
                    <div>
                        <p className="eyebrow">About KT Impex</p>
                        <h2>Dealer-first textile distribution for serious wholesale trade.</h2>
                    </div>
                    <p>
                        KT Impex is based in Birgunj, Nepal and operates as a B2B textile
                        dealer for retailers, fabric dealers, and factory partners. The firm
                        supplies finished cloth in wholesale lots, not stitched garments:
                        suit lengths, shirt pieces, pant pieces, school uniform cloth, and
                        dress material for dealer movement.
                    </p>
                </section>

                <section className="public-section founder-section">
                    <div className="founder-card">
                        <div className="founder-photo-wrap">
                            <img
                                src="/founder.jpeg"
                                alt="Sandeep Kumar Agrawal \u2013 Founder, KT Impex"
                                className="founder-photo-img"
                                width="160"
                                height="160"
                                loading="lazy"
                            />
                        </div>
                        <div>
                            <p className="eyebrow">Founder</p>
                            <h2>Sandeep Kumar Agrawal</h2>
                            <p>
                                The firm has grown through direct trade relationships with dealers
                                and factories, with Birgunj as its operating base.
                            </p>
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
                            <article className={`fabric-tile tile-${type.toLowerCase().replace(' ', '-')}`} key={type}>
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
                            <p>
                                KT Impex helps factories move selected lots through dealer networks
                                while giving dealers a consistent place to request quotations and
                                track approvals.
                            </p>
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
                    <div className="sample-grid">
                        {sampleProducts.map(product => (
                            <article className="sample-card" key={product.name}>
                                <div className={`sample-image ${product.imageClass}`} />
                                <div className="sample-body">
                                    <span className={`badge badge-${product.type.toLowerCase().replace(' ', '-')}`}>
                                        {product.type}
                                    </span>
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
        </div>
    )
}

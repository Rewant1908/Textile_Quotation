import { useState, useEffect, Component } from 'react'
import CustomerForm         from './components/CustomerForm'
import QuotationForm        from './components/QuotationForm'
import QuotationHistory     from './components/QuotationHistory'
import AdminProductManager  from './components/AdminProductManager'
import OperationsDashboard  from './components/OperationsDashboard'
import BaleManager          from './components/BaleManager'
import RetailerManager      from './components/RetailerManager'
import SaleRecorder         from './components/SaleRecorder'
import SupplierManager      from './components/SupplierManager'
import LoginPage            from './components/LoginPage'
import DeadStockAnalytics   from './components/DeadStockAnalytics'
import AgentChat            from './components/AgentChat'
import WarehouseIntelligence from './components/WarehouseIntelligence'
import AnalyticsDashboard   from './components/AnalyticsDashboard'
import './App.css'

const USER_TABS  = [
    { label: 'Register Dealer',  icon: '👤' },
    { label: 'Create Quotation', icon: '📋' },
    { label: 'My Quotations',    icon: '📄' },
]
const ADMIN_TABS = [
    { label: 'Operations',         icon: '⚡' },
    { label: 'Dead Stock',         icon: '📦' },
    { label: 'Analytics',          icon: '📊' },
    { label: 'Record Sale',        icon: '💰' },
    { label: 'Retailers',          icon: '🏪' },
    { label: 'Suppliers',          icon: '🏭' },
    { label: 'Bale Intake',        icon: '🪡' },
    { label: 'Quotation Requests', icon: '📝' },
    { label: 'Manage Products',    icon: '🗂️' },
    { label: 'AI Agents',          icon: '🤖' },
    { label: 'Warehouse AI',       icon: '🧠' },
]

const STORAGE_KEY = 'kt_impex_user'
const TOKEN_KEY   = 'kt_impex_token'

class TabErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null }
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error }
    }
    componentDidCatch(error, info) {
        console.error('Tab render error:', error, info)
    }
    componentDidUpdate(prevProps) {
        if (prevProps.tabKey !== this.props.tabKey) {
            this.setState({ hasError: false, error: null })
        }
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '2rem', maxWidth: 600, margin: '0 auto' }}>
                    <div style={{
                        background: 'var(--danger-soft)', border: '1px solid var(--danger-border)',
                        borderRadius: 'var(--r-lg)', padding: '1.5rem'
                    }}>
                        <h3 style={{ color: 'var(--danger)', marginBottom: '0.5rem', fontFamily: "'Sora', sans-serif" }}>Something went wrong loading this tab</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: '1rem' }}>
                            {this.state.error?.message || 'Unknown error'}
                        </p>
                        <button className="btn btn-primary"
                            onClick={() => this.setState({ hasError: false, error: null })}>
                            Try again
                        </button>
                    </div>
                </div>
            )
        }
        return this.props.children
    }
}

// Sun icon
const SunIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5"/>
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>
)
// Moon icon
const MoonIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
)

function App() {
    const [user, setUser] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY)
            return saved ? JSON.parse(saved) : null
        } catch { return null }
    })
    const [activeTab, setActiveTab]           = useState(0)
    const [sessionExpired, setSessionExpired] = useState(false)
    const [theme, setTheme] = useState(() => {
        const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        return sys
    })

    // Apply theme to <html>
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
    }, [theme])

    const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

    const handleLogin = (u) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
        setUser(u)
        setActiveTab(0)
    }

    const handleLogout = () => {
        localStorage.removeItem(STORAGE_KEY)
        localStorage.removeItem(TOKEN_KEY)
        setUser(null)
        setActiveTab(0)
    }

    useEffect(() => {
        const handleExpiry = () => {
            setSessionExpired(true)
            setTimeout(() => {
                setSessionExpired(false)
                handleLogout()
            }, 3000)
        }
        window.addEventListener('kt:session-expired', handleExpiry)
        return () => window.removeEventListener('kt:session-expired', handleExpiry)
    }, [])

    if (!user) return <LoginPage onLogin={handleLogin} />

    const isAdmin = user.role === 'admin'
    const tabs    = isAdmin ? ADMIN_TABS : USER_TABS

    return (
        <div className="app">
            {/* Session expired banner */}
            {sessionExpired && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
                    background: 'var(--danger)', color: '#fff',
                    padding: '14px 24px', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', fontSize: '14px',
                    fontWeight: 600, boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                }}>
                    <span>⚠️ Your session has expired. Redirecting to login…</span>
                    <button onClick={() => { setSessionExpired(false); handleLogout() }}
                        style={{
                            background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.4)',
                            color: '#fff', padding: '5px 14px', borderRadius: '6px', cursor: 'pointer',
                            fontSize: '13px', fontWeight: 600,
                        }}>
                        Dismiss
                    </button>
                </div>
            )}

            {/* Navbar */}
            <header className="navbar">
                <div className="brand">
                    {/* Inline SVG logo mark */}
                    <div className="brand-mark" aria-label="KT Impex">
                        KT
                    </div>
                    <div className="brand-copy">
                        <span className="brand-name">KT Impex</span>
                        <span className="brand-sub">Textile Wholesale</span>
                    </div>
                </div>

                <div className="userbar">
                    {/* Theme toggle */}
                    <button
                        className="theme-toggle"
                        onClick={toggleTheme}
                        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                    >
                        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                    </button>

                    <div className="user-pill">
                        <span>{isAdmin ? 'Admin' : 'Dealer'}</span>
                        <span style={{ color: 'var(--text)', fontWeight: 700 }}>{user.username}</span>
                    </div>

                    <button className="btn btn-logout" onClick={handleLogout}>
                        Sign out
                    </button>
                </div>
            </header>

            {/* Tab bar */}
            <nav className="tabs" role="tablist">
                {tabs.map((tab, i) => (
                    <button key={i}
                        role="tab"
                        aria-selected={activeTab === i}
                        className={`tab-btn ${activeTab === i ? 'active' : ''}`}
                        onClick={() => setActiveTab(i)}>
                        <span style={{ fontSize: '13px' }}>{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </nav>

            {/* Main content */}
            <main className="content" role="main">
                <TabErrorBoundary tabKey={activeTab}>
                    {isAdmin ? (
                        <>
                            {activeTab === 0  && <OperationsDashboard   user={user} />}
                            {activeTab === 1  && <DeadStockAnalytics    user={user} />}
                            {activeTab === 2  && <AnalyticsDashboard    user={user} />}
                            {activeTab === 3  && <SaleRecorder          user={user} />}
                            {activeTab === 4  && <RetailerManager       user={user} />}
                            {activeTab === 5  && <SupplierManager       user={user} />}
                            {activeTab === 6  && <BaleManager           user={user} />}
                            {activeTab === 7  && <QuotationHistory      user={user} />}
                            {activeTab === 8  && <AdminProductManager   user={user} />}
                            {activeTab === 9  && <AgentChat             user={user} />}
                            {activeTab === 10 && <WarehouseIntelligence user={user} />}
                        </>
                    ) : (
                        <>
                            {activeTab === 0 && <CustomerForm />}
                            {activeTab === 1 && <QuotationForm    user={user} />}
                            {activeTab === 2 && <QuotationHistory user={user} />}
                        </>
                    )}
                </TabErrorBoundary>
            </main>

            <footer className="footer">
                <p>KT Impex &middot; Birgunj, Nepal &middot; Dealer quotation &amp; factory sourcing portal</p>
            </footer>
        </div>
    )
}

export default App

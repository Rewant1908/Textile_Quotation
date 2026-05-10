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
import AnalyticsDashboard   from './components/AnalyticsDashboard'
import './App.css'

const USER_TABS  = ['Register Dealer', 'Create Quotation', 'My Quotations']
const ADMIN_TABS = [
    'Operations',
    'Dead Stock',
    'Analytics',
    'Record Sale',
    'Retailers',
    'Suppliers',
    'Bale Intake',
    'Quotation Requests',
    'Manage Products',
    'AI Agents',
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
                    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '1.5rem' }}>
                        <h3 style={{ color: '#b91c1c', marginBottom: '0.5rem' }}>Something went wrong loading this tab</h3>
                        <p style={{ color: '#7f1d1d', fontSize: 14, marginBottom: '1rem' }}>
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

function App() {
    const [user, setUser] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY)
            return saved ? JSON.parse(saved) : null
        } catch { return null }
    })
    const [activeTab, setActiveTab]       = useState(0)
    const [sessionExpired, setSessionExpired] = useState(false)

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
            {sessionExpired && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
                    background: '#b91c1c', color: '#fff', padding: '14px 24px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontFamily: 'sans-serif', fontSize: '15px', boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                }}>
                    <span>⚠️ Your session has expired. Redirecting to login…</span>
                    <button onClick={() => { setSessionExpired(false); handleLogout() }}
                        style={{ background: 'none', border: '1px solid #fff', color: '#fff',
                                 padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}>
                        Dismiss
                    </button>
                </div>
            )}

            <header className="navbar">
                <div className="brand">
                    <span className="brand-mark">KT</span>
                    <span className="brand-copy">
                        <span className="brand-name">KT Impex</span>
                        <span className="brand-sub">Premium Textile Wholesale</span>
                    </span>
                </div>
                <div className="userbar">
                    <span className="user-pill">{isAdmin ? 'Admin' : 'Dealer'}: {user.username}</span>
                    <button className="btn btn-logout" onClick={handleLogout}>Logout</button>
                </div>
            </header>

            <nav className="tabs">
                {tabs.map((tab, i) => (
                    <button key={i}
                        className={`tab-btn ${activeTab === i ? 'active' : ''}`}
                        onClick={() => setActiveTab(i)}>
                        {tab}
                    </button>
                ))}
            </nav>

            <main className="content">
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
                <p>KT Impex, Birgunj, Nepal | Dealer quotation and factory sourcing portal</p>
            </footer>
        </div>
    )
}

export default App

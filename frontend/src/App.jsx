import { useState, Component } from 'react'
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
import './App.css'

const USER_TABS  = ['Register Dealer', 'Create Quotation', 'My Quotations']
const ADMIN_TABS = [
    'Operations',
    'Dead Stock',
    'Record Sale',
    'Retailers',
    'Suppliers',
    'Bale Intake',
    'Quotation Requests',
    'Manage Products',
]

const STORAGE_KEY = 'kt_impex_user'

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
    const [activeTab, setActiveTab] = useState(0)

    const handleLogin  = (u) => { localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); setUser(u); setActiveTab(0) }
    const handleLogout = ()  => { localStorage.removeItem(STORAGE_KEY); setUser(null); setActiveTab(0) }

    if (!user) return <LoginPage onLogin={handleLogin} />

    const isAdmin = user.role === 'admin'
    const tabs    = isAdmin ? ADMIN_TABS : USER_TABS

    return (
        <div className="app">
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
                            {activeTab === 0 && <OperationsDashboard  user={user} />}
                            {activeTab === 1 && <DeadStockAnalytics   user={user} />}
                            {activeTab === 2 && <SaleRecorder         user={user} />}
                            {activeTab === 3 && <RetailerManager      user={user} />}
                            {activeTab === 4 && <SupplierManager      user={user} />}
                            {activeTab === 5 && <BaleManager          user={user} />}
                            {activeTab === 6 && <QuotationHistory     user={user} />}
                            {activeTab === 7 && <AdminProductManager  user={user} />}
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

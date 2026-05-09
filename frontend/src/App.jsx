// App.jsx — KT IMPEX root component
// Phase 4 Issue 2 fix: listens for 'kt:session-expired' event dispatched by api.js
// when any API call returns 401. Shows a visible banner and redirects to login
// after 3 seconds so the user is never left in a broken/empty state.

import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import LoginPage            from './components/LoginPage'
import Dashboard            from './components/OperationsDashboard'
import Products             from './components/ProductCatalogue'
import Suppliers            from './components/SupplierManager'
import Retailers            from './components/RetailerManager'
import Sales                from './components/SaleRecorder'
import Quotations           from './components/QuotationHistory'
import QuotationForm        from './components/QuotationForm'
import Analytics            from './components/AnalyticsDashboard'
import AgentChat            from './components/AgentChat'
import BaleManager          from './components/BaleManager'
import AdminProductManager  from './components/AdminProductManager'
import CustomerForm         from './components/CustomerForm'
import DeadStockAnalytics   from './components/DeadStockAnalytics'
import WarehouseIntelligence from './components/WarehouseIntelligence'

// ── Session-expired banner component ───────────────────────────────────────────────
function SessionExpiredBanner({ onDismiss }) {
    return (
        <div style={{
            position:   'fixed',
            top:        0,
            left:       0,
            right:      0,
            zIndex:     9999,
            background: '#b91c1c',
            color:      '#fff',
            padding:    '14px 24px',
            display:    'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontFamily: 'sans-serif',
            fontSize:   '15px',
            boxShadow:  '0 2px 8px rgba(0,0,0,0.25)',
        }}>
            <span>⚠️ Your session has expired. Redirecting to login…</span>
            <button
                onClick={onDismiss}
                style={{ background: 'none', border: '1px solid #fff', color: '#fff',
                         padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}
            >
                Dismiss
            </button>
        </div>
    )
}

// ── Auth guard ────────────────────────────────────────────────────────────────────────────
function RequireAuth({ children }) {
    const token = localStorage.getItem('kt_impex_token')
    if (!token) return <Navigate to="/login" replace />
    return children
}

// ── Inner app (needs useNavigate — must be inside <Router>) ───────────────────────────────
function AppInner() {
    const navigate = useNavigate()
    const [sessionExpired, setSessionExpired] = useState(false)

    // Read persisted user on mount (survives page refresh)
    const [user, setUser] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('kt_impex_user')) || null
        } catch {
            return null
        }
    })

    const handleLogin = (userData) => {
        setUser(userData)
    }

    const clearSession = () => {
        localStorage.removeItem('kt_impex_token')
        localStorage.removeItem('kt_impex_user')
        setUser(null)
    }

    useEffect(() => {
        const handleExpiry = () => {
            setSessionExpired(true)
            setTimeout(() => {
                setSessionExpired(false)
                clearSession()
                navigate('/login', { replace: true })
            }, 3000)
        }
        window.addEventListener('kt:session-expired', handleExpiry)
        return () => window.removeEventListener('kt:session-expired', handleExpiry)
    }, [navigate])

    return (
        <>
            {sessionExpired && (
                <SessionExpiredBanner onDismiss={() => {
                    setSessionExpired(false)
                    clearSession()
                    navigate('/login', { replace: true })
                }} />
            )}
            <Routes>
                {/* Public */}
                <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />

                {/* Protected */}
                <Route path="/" element={
                    <RequireAuth><Dashboard user={user} /></RequireAuth>
                } />
                <Route path="/products" element={
                    <RequireAuth><Products user={user} /></RequireAuth>
                } />
                <Route path="/admin/products" element={
                    <RequireAuth><AdminProductManager user={user} /></RequireAuth>
                } />
                <Route path="/suppliers" element={
                    <RequireAuth><Suppliers user={user} /></RequireAuth>
                } />
                <Route path="/retailers" element={
                    <RequireAuth><Retailers user={user} /></RequireAuth>
                } />
                <Route path="/retailers/new" element={
                    <RequireAuth><CustomerForm user={user} /></RequireAuth>
                } />
                <Route path="/sales" element={
                    <RequireAuth><Sales user={user} /></RequireAuth>
                } />
                <Route path="/quotations" element={
                    <RequireAuth><Quotations user={user} /></RequireAuth>
                } />
                <Route path="/quotations/new" element={
                    <RequireAuth><QuotationForm user={user} /></RequireAuth>
                } />
                <Route path="/analytics" element={
                    <RequireAuth><Analytics user={user} /></RequireAuth>
                } />
                <Route path="/analytics/deadstock" element={
                    <RequireAuth><DeadStockAnalytics user={user} /></RequireAuth>
                } />
                <Route path="/warehouse" element={
                    <RequireAuth><WarehouseIntelligence user={user} /></RequireAuth>
                } />
                <Route path="/bales" element={
                    <RequireAuth><BaleManager user={user} /></RequireAuth>
                } />
                <Route path="/agent-chat" element={
                    <RequireAuth><AgentChat user={user} /></RequireAuth>
                } />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </>
    )
}

export default function App() {
    return (
        <Router>
            <AppInner />
        </Router>
    )
}

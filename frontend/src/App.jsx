// App.jsx — KT IMPEX root component
// Phase 4 Issue 2 fix: listens for 'kt:session-expired' event dispatched by api.js
// when any API call returns 401. Shows a visible banner and redirects to login
// after 3 seconds so the user is never left in a broken/empty state.

import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Login from './components/Login'
import SignUp from './components/SignUp'
import Dashboard from './components/Dashboard'
import Products from './components/Products'
import Suppliers from './components/Suppliers'
import Retailers from './components/Retailers'
import Sales from './components/Sales'
import Quotations from './components/Quotations'
import Analytics from './components/Analytics'
import AgentChat from './components/AgentChat'

// ── Session-expired banner component ─────────────────────────────────────────
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

// ── Auth guard ────────────────────────────────────────────────────────────────
function RequireAuth({ children }) {
    const token = localStorage.getItem('kt_impex_token')
    if (!token) return <Navigate to="/login" replace />
    return children
}

// ── Inner app (needs useNavigate — must be inside <Router>) ──────────────────
function AppInner() {
    const navigate = useNavigate()
    const [sessionExpired, setSessionExpired] = useState(false)

    // Issue 2 fix: listen for kt:session-expired dispatched by api.js interceptor
    useEffect(() => {
        const handleExpiry = () => {
            setSessionExpired(true)
            // Auto-redirect after 3 seconds
            setTimeout(() => {
                setSessionExpired(false)
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
                    navigate('/login', { replace: true })
                }} />
            )}
            <Routes>
                {/* Public routes */}
                <Route path="/login"  element={<Login />} />
                <Route path="/signup" element={<SignUp />} />

                {/* Protected routes */}
                <Route path="/" element={
                    <RequireAuth><Dashboard /></RequireAuth>
                } />
                <Route path="/products" element={
                    <RequireAuth><Products /></RequireAuth>
                } />
                <Route path="/suppliers" element={
                    <RequireAuth><Suppliers /></RequireAuth>
                } />
                <Route path="/retailers" element={
                    <RequireAuth><Retailers /></RequireAuth>
                } />
                <Route path="/sales" element={
                    <RequireAuth><Sales /></RequireAuth>
                } />
                <Route path="/quotations" element={
                    <RequireAuth><Quotations /></RequireAuth>
                } />
                <Route path="/analytics" element={
                    <RequireAuth><Analytics /></RequireAuth>
                } />
                <Route path="/agent-chat" element={
                    <RequireAuth><AgentChat /></RequireAuth>
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

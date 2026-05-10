/**
 * DealerDashboard.jsx
 *
 * Unified dealer cockpit with 4 tabs:
 *   1. Receivables Ageing
 *   2. Pending Orders
 *   3. Ageing Stock on Offer
 *   4. Order Dispatch Status
 *
 * Plus the original KPI strip + recent quotations as the overview section.
 */
import { useCallback, useEffect, useState } from 'react'
import API from '../api'
import DealerReceivables   from './DealerReceivables'
import DealerPendingOrders from './DealerPendingOrders'
import DealerAgeingStock   from './DealerAgeingStock'
import DealerDispatches    from './DealerDispatches'

// ── constants ───────────────────────────────────────────────────────────────

const BADGE = {
    draft:    'kt-badge kt-badge-draft',
    pending:  'kt-badge kt-badge-draft',
    sent:     'kt-badge kt-badge-sent',
    accepted: 'kt-badge kt-badge-accepted',
    declined: 'kt-badge kt-badge-declined',
}

const TABS = [
    {
        id:    'overview',
        label: 'Overview',
        icon:  '🏠',
    },
    {
        id:    'receivables',
        label: 'Receivables Ageing',
        icon:  '💳',
    },
    {
        id:    'pending',
        label: 'Pending Orders',
        icon:  '⏳',
    },
    {
        id:    'stock',
        label: 'Ageing Stock on Offer',
        icon:  '📦',
    },
    {
        id:    'dispatch',
        label: 'Order Dispatch Status',
        icon:  '🚚',
    },
]

const fmt = (n, dec = 2) =>
    Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: dec })

// ── tab bar styles (inline so no new CSS file needed) ───────────────────────

const TAB_BAR = {
    display:        'flex',
    gap:            0,
    borderBottom:   '2px solid var(--kt-border, #e5e7eb)',
    marginBottom:   20,
    overflowX:      'auto',
    scrollbarWidth: 'none',
}

const TAB_BTN_BASE = {
    display:        'flex',
    alignItems:     'center',
    gap:            6,
    padding:        '10px 18px',
    fontSize:       13,
    fontWeight:     500,
    whiteSpace:     'nowrap',
    cursor:         'pointer',
    background:     'none',
    border:         'none',
    borderBottom:   '2px solid transparent',
    marginBottom:   -2,
    color:          'var(--kt-text-muted, #6b7280)',
    transition:     'color 0.15s, border-color 0.15s',
}

const TAB_BTN_ACTIVE = {
    ...TAB_BTN_BASE,
    color:          'var(--kt-primary, #2563eb)',
    borderBottom:   '2px solid var(--kt-primary, #2563eb)',
    fontWeight:     600,
}

// ── component ────────────────────────────────────────────────────────────────

export default function DealerDashboard({ user }) {
    const [activeTab,   setActiveTab]   = useState('overview')
    const [quotations,  setQuotations]  = useState([])
    const [loading,     setLoading]     = useState(true)
    const [error,       setError]       = useState(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await API.get('/quotations')
            setQuotations(Array.isArray(res.data) ? res.data : [])
        } catch {
            setError('Could not load your quotations. Please try again.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    // ── derived stats ──────────────────────────────────────────────────
    const total    = quotations.length
    const draft    = quotations.filter(q => q.status === 'draft' || q.status === 'pending').length
    const sent     = quotations.filter(q => q.status === 'sent').length
    const accepted = quotations.filter(q => q.status === 'accepted').length
    const declined = quotations.filter(q => q.status === 'declined').length
    const recent   = quotations.slice(0, 8)

    const totalAcceptedValue = quotations
        .filter(q => q.status === 'accepted')
        .reduce((s, q) => s + Number(q.total_amount || 0), 0)

    // ── loading skeleton ───────────────────────────────────────────────
    if (loading) return (
        <div>
            <div className="kt-stats-grid">
                {[1,2,3,4,5].map(i => (
                    <div key={i} className="kt-stat-card" style={{ opacity: 0.4 }}>
                        <span className="kt-stat-label">Loading…</span>
                        <span className="kt-stat-value">—</span>
                        <span className="kt-stat-sub"> </span>
                    </div>
                ))}
            </div>
            <div className="kt-card">
                <p style={{ color: 'var(--kt-text-muted)', textAlign: 'center', padding: '40px 0' }}>
                    Loading your dashboard…
                </p>
            </div>
        </div>
    )

    // ── tab content renderer ───────────────────────────────────────────
    const renderTab = () => {
        switch (activeTab) {
            case 'receivables':
                return <DealerReceivables user={user} />

            case 'pending':
                return <DealerPendingOrders user={user} />

            case 'stock':
                return <DealerAgeingStock user={user} />

            case 'dispatch':
                return <DealerDispatches user={user} />

            default: // 'overview'
                return (
                    <div>
                        {/* ── KPI strip ──────────────────────────────────────── */}
                        <div className="kt-stats-grid">
                            <div className="kt-stat-card">
                                <span className="kt-stat-label">Total Quotations</span>
                                <span className="kt-stat-value">{total}</span>
                                <span className="kt-stat-sub">All time</span>
                            </div>
                            <div className="kt-stat-card">
                                <span className="kt-stat-label">Draft</span>
                                <span className="kt-stat-value" style={{ color: '#2c5faa' }}>{draft}</span>
                                <span className="kt-stat-sub">Awaiting review</span>
                            </div>
                            <div className="kt-stat-card">
                                <span className="kt-stat-label">Sent</span>
                                <span className="kt-stat-value" style={{ color: '#148f77' }}>{sent}</span>
                                <span className="kt-stat-sub">Pending your confirmation</span>
                            </div>
                            <div className="kt-stat-card">
                                <span className="kt-stat-label">Accepted</span>
                                <span className="kt-stat-value" style={{ color: 'var(--kt-success)' }}>{accepted}</span>
                                <span className="kt-stat-sub">Confirmed orders</span>
                            </div>
                            <div className="kt-stat-card">
                                <span className="kt-stat-label">Declined</span>
                                <span className="kt-stat-value" style={{ color: 'var(--kt-danger)' }}>{declined}</span>
                                <span className="kt-stat-sub">Not proceeding</span>
                            </div>
                        </div>

                        {/* ── Accepted value banner ──────────────────────────── */}
                        {totalAcceptedValue > 0 && (
                            <div className="kt-card" style={{
                                background:    'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                                border:        '1px solid #bbf7d0',
                                marginBottom:  16,
                                display:       'flex',
                                alignItems:    'center',
                                gap:           12,
                                padding:       '14px 20px',
                            }}>
                                <span style={{ fontSize: 24 }}>✅</span>
                                <div>
                                    <div style={{ fontWeight: 700, color: '#166534', fontSize: 15 }}>
                                        Total Accepted Value
                                    </div>
                                    <div style={{
                                        fontWeight: 700, color: '#15803d', fontSize: 22,
                                        fontVariantNumeric: 'tabular-nums',
                                    }}>
                                        NPR {fmt(totalAcceptedValue)}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── Quick-nav cards to other tabs ─────────────────── */}
                        <div style={{
                            display:             'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                            gap:                 12,
                            marginBottom:        20,
                        }}>
                            {TABS.filter(t => t.id !== 'overview').map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setActiveTab(t.id)}
                                    style={{
                                        display:       'flex',
                                        alignItems:    'center',
                                        gap:           10,
                                        padding:       '14px 16px',
                                        background:    'var(--kt-surface, #fff)',
                                        border:        '1px solid var(--kt-border, #e5e7eb)',
                                        borderRadius:  8,
                                        cursor:        'pointer',
                                        textAlign:     'left',
                                        transition:    'box-shadow 0.15s, border-color 0.15s',
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.boxShadow    = '0 2px 8px rgba(0,0,0,0.08)'
                                        e.currentTarget.style.borderColor  = 'var(--kt-primary, #2563eb)'
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.boxShadow   = ''
                                        e.currentTarget.style.borderColor = 'var(--kt-border, #e5e7eb)'
                                    }}
                                >
                                    <span style={{ fontSize: 22 }}>{t.icon}</span>
                                    <span style={{
                                        fontSize:   13,
                                        fontWeight: 600,
                                        color:      'var(--kt-text, #111)',
                                        lineHeight: 1.3,
                                    }}>
                                        {t.label}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* ── Recent quotations table ───────────────────────── */}
                        <div className="kt-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between',
                                          alignItems: 'center', marginBottom: 16 }}>
                                <h3 className="kt-section-title" style={{ margin: 0 }}>Your Recent Quotations</h3>
                                {total > 0 && (
                                    <span style={{ fontSize: 12, color: 'var(--kt-text-muted)' }}>
                                        Showing {recent.length} of {total}
                                    </span>
                                )}
                            </div>

                            {quotations.length === 0 ? (
                                <div className="kt-empty">
                                    <div className="kt-empty-icon">📋</div>
                                    <p>No quotations yet.<br/>Use <strong>Create Quotation</strong> to get started.</p>
                                </div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table className="kt-table">
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>Customer</th>
                                                <th style={{ textAlign: 'right' }}>Total (NPR)</th>
                                                <th>Status</th>
                                                <th>Date</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {recent.map(q => (
                                                <tr key={q.quotation_id}>
                                                    <td style={{ fontWeight: 600, color: 'var(--kt-primary)',
                                                                 fontVariantNumeric: 'tabular-nums' }}>
                                                        {q.quotation_number || `#${q.quotation_id}`}
                                                    </td>
                                                    <td>{q.customer_name || '—'}</td>
                                                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                                        {fmt(q.total_amount ?? q.grand_total)}
                                                    </td>
                                                    <td>
                                                        <span
                                                            className={BADGE[q.status] || 'kt-badge'}
                                                            style={{ textTransform: 'capitalize' }}
                                                        >
                                                            {q.status === 'pending' ? 'draft' : q.status}
                                                        </span>
                                                    </td>
                                                    <td style={{ color: 'var(--kt-text-muted)', fontSize: 12,
                                                                 whiteSpace: 'nowrap' }}>
                                                        {q.created_at?.slice(0, 10) || '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {total === 0 && !error && (
                            <div className="kt-card" style={{ textAlign: 'center', padding: '24px 16px',
                                                              color: 'var(--kt-text-muted)' }}>
                                <div style={{ fontSize: 32, marginBottom: 8 }}>🚀</div>
                                <p style={{ marginBottom: 4, fontWeight: 600, color: 'var(--kt-text)' }}>Ready to start?</p>
                                <p style={{ fontSize: 13 }}>Go to <strong>Create Quotation</strong> in the top nav
                                    to create your first quotation.</p>
                            </div>
                        )}
                    </div>
                )
        }
    }

    // ── render ─────────────────────────────────────────────────────────
    return (
        <div>
            {error && (
                <div className="kt-toast kt-toast-error" style={{ marginBottom: 20 }}>
                    {error}
                    <button
                        onClick={load}
                        style={{ marginLeft: 12, background: 'none', border: '1px solid currentColor',
                                 borderRadius: 4, padding: '2px 10px', cursor: 'pointer', color: 'inherit' }}
                    >Retry</button>
                </div>
            )}

            {/* ── Tab bar ──────────────────────────────────────────────── */}
            <nav style={TAB_BAR} role="tablist" aria-label="Dealer dashboard sections">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        role="tab"
                        aria-selected={activeTab === t.id}
                        style={activeTab === t.id ? TAB_BTN_ACTIVE : TAB_BTN_BASE}
                        onClick={() => setActiveTab(t.id)}
                    >
                        <span>{t.icon}</span>
                        {t.label}
                    </button>
                ))}
            </nav>

            {/* ── Tab panel ────────────────────────────────────────────── */}
            <div role="tabpanel">
                {renderTab()}
            </div>
        </div>
    )
}

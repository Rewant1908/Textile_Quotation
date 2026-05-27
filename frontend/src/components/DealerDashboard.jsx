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

const Icon = ({ name }) => {
    const common = {
        width: 18,
        height: 18,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
    }
    const paths = {
        overview: (
            <>
                <path d="m3 10 9-7 9 7" />
                <path d="M5 10v10h14V10" />
                <path d="M9 20v-6h6v6" />
            </>
        ),
        receivables: (
            <>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 10h18" />
                <path d="M7 15h2" />
                <path d="M13 15h4" />
            </>
        ),
        pending: (
            <>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
            </>
        ),
        stock: (
            <>
                <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                <path d="m3.3 7 8.7 5 8.7-5" />
                <path d="M12 22V12" />
            </>
        ),
        dispatch: (
            <>
                <path d="M10 17h4V5H2v12h3" />
                <path d="M14 17h1V9h4l3 4v4h-2" />
                <circle cx="7.5" cy="17.5" r="2.5" />
                <circle cx="17.5" cy="17.5" r="2.5" />
            </>
        ),
        trend: (
            <>
                <path d="M3 17 9 11l4 4 8-8" />
                <path d="M14 7h7v7" />
            </>
        ),
    }
    return <svg {...common}>{paths[name] || paths.overview}</svg>
}

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
        icon:  'overview',
    },
    {
        id:    'receivables',
        label: 'Receivables Ageing',
        icon:  'receivables',
    },
    {
        id:    'pending',
        label: 'Pending Orders',
        icon:  'pending',
    },
    {
        id:    'stock',
        label: 'Ageing Stock on Offer',
        icon:  'stock',
    },
    {
        id:    'dispatch',
        label: 'Order Dispatch Status',
        icon:  'dispatch',
    },
]

const fmt = (n, dec = 2) =>
    Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: dec })

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
        <div className="kt-dashboard-shell">
            <div className="kt-dealer-hero kt-skeleton-hero">
                <span className="kt-hero-kicker">Dealer command center</span>
                <h1>Loading your trading cockpit</h1>
                <p>Preparing quotations, receivables, stock offers, and dispatch status.</p>
            </div>
            <div className="kt-stats-grid">
                {[1,2,3,4,5].map(i => (
                    <div key={i} className="kt-stat-card" style={{ opacity: 0.4 }}>
                        <span className="kt-stat-label">Loading…</span>
                        <span className="kt-stat-value">—</span>
                        <span className="kt-stat-sub"> </span>
                    </div>
                ))}
            </div>
            <div className="kt-card kt-panel-enter">
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
                        <section className="kt-dealer-hero">
                            <div className="kt-hero-copy">
                                <span className="kt-hero-kicker">Dealer command center</span>
                                <h1>Welcome back, {user?.username || 'Dealer'}</h1>
                                <p>
                                    A live view of quotation flow, receivables pressure, stock opportunities,
                                    and dispatch movement in one premium workspace.
                                </p>
                            </div>
                            <div className="kt-hero-metrics" aria-label="Dealer dashboard summary">
                                <div>
                                    <span>{accepted}</span>
                                    <small>confirmed</small>
                                </div>
                                <div>
                                    <span>NPR {fmt(totalAcceptedValue, 0)}</span>
                                    <small>accepted value</small>
                                </div>
                                <div>
                                    <span>{draft + sent}</span>
                                    <small>open quotes</small>
                                </div>
                            </div>
                        </section>

                        {/* ── KPI strip ──────────────────────────────────────── */}
                        <div className="kt-stats-grid kt-stagger">
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
                            <div className="kt-accepted-banner">
                                <span className="kt-icon-disc"><Icon name="trend" /></span>
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
                        <div className="kt-quick-grid">
                            {TABS.filter(t => t.id !== 'overview').map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setActiveTab(t.id)}
                                    className="kt-quick-card"
                                >
                                    <span className="kt-quick-icon"><Icon name={t.icon} /></span>
                                    <span>{t.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* ── Recent quotations table ───────────────────────── */}
                        <div className="kt-card kt-panel-enter">
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
                                    <div className="kt-empty-icon"><Icon name="pending" /></div>
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
                            <div className="kt-card kt-panel-enter" style={{ textAlign: 'center', padding: '24px 16px',
                                                                              color: 'var(--kt-text-muted)' }}>
                                <div className="kt-empty-icon"><Icon name="trend" /></div>
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
        <div className="kt-dashboard-shell">
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
            <nav className="kt-dealer-tabs" role="tablist" aria-label="Dealer dashboard sections">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        role="tab"
                        aria-selected={activeTab === t.id}
                        className={`kt-dealer-tab ${activeTab === t.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(t.id)}
                    >
                        <Icon name={t.icon} />
                        {t.label}
                    </button>
                ))}
            </nav>

            {/* ── Tab panel ────────────────────────────────────────────── */}
            <div role="tabpanel" className="kt-tab-panel">
                {renderTab()}
            </div>
        </div>
    )
}

/**
 * DealerDashboard.jsx
 *
 * Dealer cockpit — shows ONLY this dealer's own data.
 * Data isolation is enforced at two layers:
 *   1. Backend: GET /api/quotations filters WHERE user_id = req.user.user_id
 *   2. Backend: GET /api/dealers/cockpit/kpis also scopes to user_id
 * This component never receives or renders another dealer's records.
 */
import { useCallback, useEffect, useState } from 'react'
import API from '../api'

const BADGE = {
    draft:    'kt-badge kt-badge-draft',
    pending:  'kt-badge kt-badge-draft',
    sent:     'kt-badge kt-badge-sent',
    accepted: 'kt-badge kt-badge-accepted',
    declined: 'kt-badge kt-badge-declined',
}

const fmt = (n, dec = 2) =>
    Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: dec })

export default function DealerDashboard({ user }) {
    const [quotations, setQuotations] = useState([])
    const [kpis, setKpis]             = useState(null)
    const [loading, setLoading]       = useState(true)
    const [error, setError]           = useState(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            // Both calls are scoped server-side to req.user.user_id
            const [qRes, kRes] = await Promise.all([
                API.get('/quotations'),                  // backend filters by user_id automatically
                API.get('/dealers/cockpit/kpis'),        // backend filters by user_id automatically
            ])
            setQuotations(Array.isArray(qRes.data) ? qRes.data : [])
            setKpis(kRes.data?.kpis || null)
        } catch (e) {
            setError('Could not load your dashboard. Please try again.')
        } finally {
            setLoading(false)
        }
    }, [])   // no dependency on user_id — server enforces scope via JWT

    useEffect(() => { load() }, [load])

    // Derive stats locally from the already-scoped quotations list
    const total    = quotations.length
    const draft    = quotations.filter(q => q.status === 'draft' || q.status === 'pending').length
    const sent     = quotations.filter(q => q.status === 'sent').length
    const accepted = quotations.filter(q => q.status === 'accepted').length
    const declined = quotations.filter(q => q.status === 'declined').length
    const recent   = quotations.slice(0, 8)

    const totalAcceptedValue = quotations
        .filter(q => q.status === 'accepted')
        .reduce((s, q) => s + Number(q.total_amount || 0), 0)

    // ── Loading skeleton ──────────────────────────────────────────────────────
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

            {/* ── KPI strip ─────────────────────────────────────────────────── */}
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

            {/* ── Accepted value banner (only shown when > 0) ───────────────── */}
            {totalAcceptedValue > 0 && (
                <div className="kt-card" style={{
                    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                    border: '1px solid #bbf7d0',
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 20px',
                }}>
                    <span style={{ fontSize: 24 }}>✅</span>
                    <div>
                        <div style={{ fontWeight: 700, color: '#166534', fontSize: 15 }}>
                            Total Accepted Value
                        </div>
                        <div style={{ fontWeight: 700, color: '#15803d', fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>
                            NPR {fmt(totalAcceptedValue)}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Recent quotations table ───────────────────────────────────── */}
            <div className="kt-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 className="kt-section-title" style={{ margin: 0 }}>Your Recent Quotations</h3>
                    <span style={{ fontSize: 12, color: 'var(--kt-text-muted)' }}>
                        Showing {recent.length} of {total}
                    </span>
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
                                        <td style={{ fontWeight: 600, color: 'var(--kt-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                            {q.quotation_number || `#${q.quotation_id}`}
                                        </td>
                                        <td>{q.customer_name || '—'}</td>
                                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                            {fmt(q.total_amount ?? q.grand_total)}
                                        </td>
                                        <td>
                                            <span className={BADGE[q.status] || 'kt-badge'}
                                                  style={{ textTransform: 'capitalize' }}>
                                                {q.status === 'pending' ? 'draft' : q.status}
                                            </span>
                                        </td>
                                        <td style={{ color: 'var(--kt-text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>
                                            {q.created_at?.slice(0, 10) || '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Quick actions hint (only when no quotations yet) ──────────── */}
            {total === 0 && !error && (
                <div className="kt-card" style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--kt-text-muted)' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🚀</div>
                    <p style={{ marginBottom: 4, fontWeight: 600, color: 'var(--kt-text)' }}>Ready to start?</p>
                    <p style={{ fontSize: 13 }}>Go to <strong>Create Quotation</strong> in the top nav to create your first quotation.</p>
                </div>
            )}
        </div>
    )
}

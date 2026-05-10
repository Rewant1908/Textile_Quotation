/**
 * DealerDashboard.jsx
 * Dealer home tab — shows quotation stats + recent quotations table.
 * Mirrors admin card layout using dealer theme classes from theme.css.
 */
import { useCallback, useEffect, useState } from 'react'
import API from '../api'

const BADGE_CLASS = {
    draft:    'kt-badge kt-badge-draft',
    pending:  'kt-badge kt-badge-pending',
    sent:     'kt-badge kt-badge-sent',
    accepted: 'kt-badge kt-badge-accepted',
    declined: 'kt-badge kt-badge-declined',
}

export default function DealerDashboard({ user }) {
    const [quotations, setQuotations] = useState([])
    const [loading, setLoading]       = useState(true)
    const [error, setError]           = useState(null)

    const load = useCallback(() => {
        setLoading(true)
        setError(null)
        API.get('/quotations', { params: { user_id: user.user_id } })
            .then(r => setQuotations(Array.isArray(r.data) ? r.data : []))
            .catch(() => setError('Could not load your quotations.'))
            .finally(() => setLoading(false))
    }, [user.user_id])

    useEffect(() => { load() }, [load])

    // ── Compute stats ──────────────────────────────────────────────────
    const total    = quotations.length
    const draft    = quotations.filter(q => q.status === 'draft' || q.status === 'pending').length
    const sent     = quotations.filter(q => q.status === 'sent').length
    const accepted = quotations.filter(q => q.status === 'accepted').length
    const declined = quotations.filter(q => q.status === 'declined').length
    const recent   = quotations.slice(0, 8)

    if (loading) return (
        <div className="kt-card">
            <p style={{ color: 'var(--kt-text-muted)', textAlign: 'center', padding: '40px 0' }}>Loading dashboard…</p>
        </div>
    )

    return (
        <div>
            {error && <div className="kt-toast kt-toast-error" style={{ marginBottom: 20 }}>{error}</div>}

            {/* ── Stats row ──────────────────────────────────────────── */}
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

            {/* ── Recent quotations ──────────────────────────────────── */}
            <div className="kt-card">
                <h3 className="kt-section-title">Recent Quotations</h3>
                {quotations.length === 0 ? (
                    <div className="kt-empty">
                        <div className="kt-empty-icon">📋</div>
                        <p>No quotations yet. Use <strong>Create Quotation</strong> to get started.</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="kt-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Customer</th>
                                    <th>Total (NPR)</th>
                                    <th>Status</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recent.map(q => (
                                    <tr key={q.quotation_id}>
                                        <td style={{ fontWeight: 600, color: 'var(--kt-primary)' }}>
                                            {q.quotation_number || `#${q.quotation_id}`}
                                        </td>
                                        <td>{q.customer_name || '—'}</td>
                                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                                            {Number(q.total_amount ?? q.grand_total ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td>
                                            <span className={BADGE_CLASS[q.status] || 'kt-badge'}>
                                                {q.status}
                                            </span>
                                        </td>
                                        <td style={{ color: 'var(--kt-text-muted)', fontSize: 12 }}>
                                            {q.created_at?.slice(0, 10) || '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}

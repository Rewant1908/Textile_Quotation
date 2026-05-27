/**
 * DealerPendingOrders.jsx
 * Shows draft + sent quotations that are not yet accepted/declined.
 * Data comes from GET /api/dealers/cockpit/pending-orders (scoped to this user only).
 */
import { useCallback, useEffect, useState } from 'react'
import API from '../api'

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })

const STATUS_STYLE = {
    draft:   { bg: '#eff6ff', color: '#1d4ed8', label: 'Draft' },
    pending: { bg: '#eff6ff', color: '#1d4ed8', label: 'Draft' },
    sent:    { bg: '#f0fdfa', color: '#0f766e', label: 'Sent — Awaiting Your Confirmation' },
}

function urgencyColor(days) {
    if (days >= 14) return '#b91c1c'
    if (days >= 7)  return '#c2410c'
    return 'var(--kt-text-muted)'
}

export default function DealerPendingOrders({ user }) {
    const [rows, setRows]       = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError]     = useState(null)

    const load = useCallback(async () => {
        setLoading(true); setError(null)
        try {
            const res = await API.get('/dealers/cockpit/pending-orders')
            setRows(res.data?.rows || [])
        } catch { setError('Could not load pending orders.') }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { load() }, [load])

    const totalPending = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0)
    const overdue      = rows.filter(r => r.days_open >= 7).length

    if (loading) return <div className="kt-card"><p style={{ textAlign: 'center', padding: 40, color: 'var(--kt-text-muted)' }}>Loading pending orders…</p></div>
    if (error)   return <div className="kt-toast kt-toast-error">{error} <button onClick={load} style={{ marginLeft: 10, cursor: 'pointer', background: 'none', border: '1px solid currentColor', borderRadius: 4, padding: '2px 8px' }}>Retry</button></div>

    return (
        <div>
            {/* ── Summary strip ────────────────────────────────────────────── */}
            <div className="kt-stats-grid">
                <div className="kt-stat-card">
                    <span className="kt-stat-label">Total Pending</span>
                    <span className="kt-stat-value">{rows.length}</span>
                    <span className="kt-stat-sub">Open quotations</span>
                </div>
                <div className="kt-stat-card">
                    <span className="kt-stat-label">Total Value</span>
                    <span className="kt-stat-value" style={{ color: 'var(--kt-primary)', fontSize: 18 }}>NPR {fmt(totalPending)}</span>
                    <span className="kt-stat-sub">Awaiting resolution</span>
                </div>
                <div className="kt-stat-card" style={{ borderTop: overdue > 0 ? '3px solid #fca5a5' : undefined }}>
                    <span className="kt-stat-label">Needs Attention</span>
                    <span className="kt-stat-value" style={{ color: overdue > 0 ? '#b91c1c' : 'var(--kt-success)' }}>{overdue}</span>
                    <span className="kt-stat-sub">Open ≥ 7 days</span>
                </div>
                <div className="kt-stat-card">
                    <span className="kt-stat-label">Sent by KT</span>
                    <span className="kt-stat-value" style={{ color: '#0f766e' }}>
                        {rows.filter(r => r.status === 'sent').length}
                    </span>
                    <span className="kt-stat-sub">Awaiting your confirmation</span>
                </div>
            </div>

            {/* ── Sent quotations alert ─────────────────────────────────────── */}
            {rows.filter(r => r.status === 'sent').length > 0 && (
                <div style={{
                    background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 8,
                    padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start'
                }}>
                    <span style={{ fontSize: 20 }}>🔔</span>
                    <div>
                        <strong style={{ color: '#0f766e' }}>Action Required</strong>
                        <p style={{ margin: '2px 0 0', fontSize: 13, color: '#0f766e' }}>
                            {rows.filter(r => r.status === 'sent').length} quotation{rows.filter(r => r.status === 'sent').length > 1 ? 's have' : ' has'} been sent by KT Impex and
                            {' '}awaiting your confirmation. Go to <strong>My Quotations</strong> to accept or decline.
                        </p>
                    </div>
                </div>
            )}

            {/* ── Table ──────────────────────────────────────────────────────── */}
            <div className="kt-card">
                <h3 className="kt-section-title">Open Quotations</h3>
                {rows.length === 0 ? (
                    <div className="kt-empty">
                        <div className="kt-empty-icon">✅</div>
                        <p>No pending orders. All quotations have been resolved.</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="kt-table">
                            <thead>
                                <tr>
                                    <th>Quotation</th>
                                    <th>Customer</th>
                                    <th style={{ textAlign: 'right' }}>Amount (NPR)</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'center' }}>Days Open</th>
                                    <th>Created</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => {
                                    const ss = STATUS_STYLE[r.status] || STATUS_STYLE.draft
                                    return (
                                        <tr key={r.quotation_id}>
                                            <td style={{ fontWeight: 600, color: 'var(--kt-primary)' }}>
                                                {r.quotation_number || `#${r.quotation_id}`}
                                            </td>
                                            <td>
                                                <div>{r.customer_name || '—'}</div>
                                                {r.contact_phone && <div style={{ fontSize: 11, color: 'var(--kt-text-muted)' }}>{r.contact_phone}</div>}
                                            </td>
                                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                                                {fmt(r.total_amount)}
                                            </td>
                                            <td>
                                                <span style={{
                                                    background: ss.bg, color: ss.color,
                                                    borderRadius: 12, padding: '2px 10px',
                                                    fontSize: 11, fontWeight: 600,
                                                }}>{ss.label}</span>
                                            </td>
                                            <td style={{ textAlign: 'center', fontWeight: 700, color: urgencyColor(r.days_open) }}>
                                                {r.days_open}d
                                                {r.days_open >= 7 && <span title="Needs attention" style={{ marginLeft: 4 }}>⚠️</span>}
                                            </td>
                                            <td style={{ color: 'var(--kt-text-muted)', fontSize: 12 }}>
                                                {r.created_at?.slice(0, 10) || '—'}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}

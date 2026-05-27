/**
 * DealerDispatches.jsx
 * Shows dispatch and order status for this dealer's accepted quotations.
 * Data comes from GET /api/dealers/cockpit/dispatches.
 * Falls back gracefully if migration_v4 hasn't been run (orders/dispatches tables missing).
 */
import { useCallback, useEffect, useState } from 'react'
import API from '../api'

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })

const ORDER_STATUS_STYLE = {
    confirmed:   { bg: '#eff6ff', color: '#1d4ed8', label: 'Confirmed' },
    processing:  { bg: '#faf5ff', color: '#7c3aed', label: 'Processing' },
    packed:      { bg: '#fff7ed', color: '#c2410c', label: 'Packed' },
    dispatched:  { bg: '#ecfdf5', color: '#059669', label: 'Dispatched' },
    delivered:   { bg: '#f0fdf4', color: '#15803d', label: 'Delivered' },
    cancelled:   { bg: '#fef2f2', color: '#b91c1c', label: 'Cancelled' },
}

const DELIVERY_STATUS_STYLE = {
    preparing:          { color: '#6b7280', label: 'Preparing' },
    in_transit:         { color: '#2563eb', label: 'In Transit' },
    out_for_delivery:   { color: '#d97706', label: 'Out for Delivery' },
    delivered:          { color: '#15803d', label: 'Delivered' },
    returned:           { color: '#b91c1c', label: 'Returned' },
}

export default function DealerDispatches() {
    const [rows, setRows]           = useState([])
    const [migPending, setMigPending] = useState(false)
    const [loading, setLoading]     = useState(true)
    const [error, setError]         = useState(null)

    const load = useCallback(async () => {
        setLoading(true); setError(null)
        try {
            const res = await API.get('/dealers/cockpit/dispatches')
            setRows(res.data?.rows || [])
            if (res.data?._migrationPending) setMigPending(true)
        } catch { setError('Could not load dispatch status.') }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { load() }, [load])

    const dispatched  = rows.filter(r => r.delivery_status === 'in_transit' || r.delivery_status === 'out_for_delivery').length
    const delivered   = rows.filter(r => r.delivery_status === 'delivered').length
    const pending     = rows.filter(r => !r.order_id).length

    if (loading) return <div className="kt-card"><p style={{ textAlign: 'center', padding: 40, color: 'var(--kt-text-muted)' }}>Loading dispatch status…</p></div>
    if (error)   return <div className="kt-toast kt-toast-error">{error} <button onClick={load} style={{ marginLeft: 10, cursor: 'pointer', background: 'none', border: '1px solid currentColor', borderRadius: 4, padding: '2px 8px' }}>Retry</button></div>

    return (
        <div>
            {migPending && (
                <div style={{
                    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
                    padding: '12px 18px', marginBottom: 16, fontSize: 13, color: '#92400e'
                }}>
                    ⚠️ Order tracking tables not yet set up. Showing accepted quotations only.
                    Run <code>migration_v4.sql</code> to enable full dispatch tracking.
                </div>
            )}

            {/* ── Summary strip ────────────────────────────────────────────── */}
            <div className="kt-stats-grid">
                <div className="kt-stat-card">
                    <span className="kt-stat-label">Accepted Orders</span>
                    <span className="kt-stat-value">{rows.length}</span>
                    <span className="kt-stat-sub">All time</span>
                </div>
                <div className="kt-stat-card">
                    <span className="kt-stat-label">Awaiting Dispatch</span>
                    <span className="kt-stat-value" style={{ color: '#7c3aed' }}>{pending}</span>
                    <span className="kt-stat-sub">Order not yet raised</span>
                </div>
                <div className="kt-stat-card" style={{ borderTop: '3px solid #93c5fd' }}>
                    <span className="kt-stat-label">In Transit</span>
                    <span className="kt-stat-value" style={{ color: '#2563eb' }}>{dispatched}</span>
                    <span className="kt-stat-sub">On the way</span>
                </div>
                <div className="kt-stat-card" style={{ borderTop: '3px solid #86efac' }}>
                    <span className="kt-stat-label">Delivered</span>
                    <span className="kt-stat-value" style={{ color: '#15803d' }}>{delivered}</span>
                    <span className="kt-stat-sub">Completed</span>
                </div>
            </div>

            {/* ── Detail table ───────────────────────────────────────────────── */}
            <div className="kt-card">
                <h3 className="kt-section-title">Dispatch Details</h3>
                {rows.length === 0 ? (
                    <div className="kt-empty">
                        <div className="kt-empty-icon">📦</div>
                        <p>No accepted orders yet. Accepted quotations will appear here.</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="kt-table">
                            <thead>
                                <tr>
                                    <th>Quotation</th>
                                    <th>Customer</th>
                                    <th style={{ textAlign: 'right' }}>Amount (NPR)</th>
                                    <th>Order Status</th>
                                    <th>Dispatch Date</th>
                                    <th>Delivery Status</th>
                                    <th>Tracking</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => {
                                    const os = ORDER_STATUS_STYLE[r.order_status]
                                    const ds = DELIVERY_STATUS_STYLE[r.delivery_status]
                                    return (
                                        <tr key={r.quotation_id}>
                                            <td style={{ fontWeight: 600, color: 'var(--kt-primary)' }}>
                                                {r.quotation_number || `#${r.quotation_id}`}
                                            </td>
                                            <td>{r.customer_name || '—'}</td>
                                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                                                {fmt(r.total_amount)}
                                            </td>
                                            <td>
                                                {os ? (
                                                    <span style={{
                                                        background: os.bg, color: os.color,
                                                        borderRadius: 12, padding: '2px 10px',
                                                        fontSize: 11, fontWeight: 600,
                                                    }}>{os.label}</span>
                                                ) : (
                                                    <span style={{ color: 'var(--kt-text-muted)', fontSize: 12 }}>Awaiting</span>
                                                )}
                                            </td>
                                            <td style={{ color: 'var(--kt-text-muted)', fontSize: 12 }}>
                                                {r.dispatch_date || '—'}
                                            </td>
                                            <td>
                                                {ds ? (
                                                    <span style={{ fontWeight: 600, color: ds.color, fontSize: 12 }}>
                                                        {ds.label}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: 'var(--kt-text-muted)', fontSize: 12 }}>Not dispatched</span>
                                                )}
                                            </td>
                                            <td style={{ fontSize: 12 }}>
                                                {r.tracking_number || <span style={{ color: 'var(--kt-text-muted)' }}>No tracking</span>}
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

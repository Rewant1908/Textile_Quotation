/**
 * DealerReceivables.jsx
 * Shows accepted quotations with ageing buckets: 0-30 / 31-60 / 61-90 / 90+ days.
 * Data comes from GET /api/dealers/cockpit/receivables (scoped to this user only).
 */
import { useCallback, useEffect, useState } from 'react'
import API from '../api'

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })

const BUCKET_COLOR = {
    '0-30 days':  { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d', badge: '#dcfce7', badgeText: '#166534' },
    '31-60 days': { bg: '#fffbeb', border: '#fde68a', text: '#b45309', badge: '#fef9c3', badgeText: '#92400e' },
    '61-90 days': { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', badge: '#ffedd5', badgeText: '#9a3412' },
    '90+ days':   { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', badge: '#fee2e2', badgeText: '#991b1b' },
}

export default function DealerReceivables() {
    const [data, setData]     = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError]   = useState(null)

    const load = useCallback(async () => {
        setLoading(true); setError(null)
        try {
            const res = await API.get('/dealers/cockpit/receivables')
            setData(res.data)
        } catch { setError('Could not load receivables.') }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { load() }, [load])

    if (loading) return <div className="kt-card"><p style={{ textAlign: 'center', padding: 40, color: 'var(--kt-text-muted)' }}>Loading receivables…</p></div>
    if (error)   return <div className="kt-toast kt-toast-error">{error} <button onClick={load} style={{ marginLeft: 10, cursor: 'pointer', background: 'none', border: '1px solid currentColor', borderRadius: 4, padding: '2px 8px' }}>Retry</button></div>

    const rows    = data?.rows    || []
    const buckets = data?.buckets || {}
    const total   = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0)

    return (
        <div>
            {/* ── Bucket summary cards ─────────────────────────────────────── */}
            <div className="kt-stats-grid">
                <div className="kt-stat-card">
                    <span className="kt-stat-label">Total Outstanding</span>
                    <span className="kt-stat-value" style={{ color: 'var(--kt-primary)', fontSize: 20 }}>NPR {fmt(total)}</span>
                    <span className="kt-stat-sub">{rows.length} invoice{rows.length !== 1 ? 's' : ''}</span>
                </div>
                {Object.entries(BUCKET_COLOR).map(([bucket, style]) => (
                    <div key={bucket} className="kt-stat-card"
                         style={{ borderTop: `3px solid ${style.border}`, background: style.bg }}>
                        <span className="kt-stat-label" style={{ color: style.text }}>{bucket}</span>
                        <span className="kt-stat-value" style={{ color: style.text, fontSize: 18 }}>
                            {buckets[bucket] > 0 ? `NPR ${fmt(buckets[bucket])}` : '—'}
                        </span>
                        <span className="kt-stat-sub">
                            {rows.filter(r => r.ageing_bucket === bucket).length} items
                        </span>
                    </div>
                ))}
            </div>

            {/* ── Detail table ───────────────────────────────────────────────── */}
            <div className="kt-card">
                <h3 className="kt-section-title">Receivables Detail</h3>
                {rows.length === 0 ? (
                    <div className="kt-empty">
                        <div className="kt-empty-icon">🎉</div>
                        <p>No outstanding receivables. All accepted quotations are settled.</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="kt-table">
                            <thead>
                                <tr>
                                    <th>Quotation</th>
                                    <th>Customer</th>
                                    <th style={{ textAlign: 'right' }}>Amount (NPR)</th>
                                    <th>Accepted On</th>
                                    <th style={{ textAlign: 'center' }}>Days Out</th>
                                    <th>Ageing</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => {
                                    const style = BUCKET_COLOR[r.ageing_bucket] || BUCKET_COLOR['90+ days']
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
                                            <td style={{ color: 'var(--kt-text-muted)', fontSize: 12 }}>
                                                {r.accepted_on?.slice(0, 10) || '—'}
                                            </td>
                                            <td style={{ textAlign: 'center', fontWeight: 700, color: style.text }}>
                                                {r.days_outstanding}d
                                            </td>
                                            <td>
                                                <span style={{
                                                    background: style.badge,
                                                    color: style.badgeText,
                                                    borderRadius: 12,
                                                    padding: '2px 10px',
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                    whiteSpace: 'nowrap',
                                                }}>{r.ageing_bucket}</span>
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

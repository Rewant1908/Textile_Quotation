/**
 * DealerAgeingStock.jsx
 * Shows slow/dead stock items from KT Impex warehouse as special offers with
 * auto-computed discount tiers. Shared catalogue — all dealers see the same data.
 * Data comes from GET /api/dealers/cockpit/ageing-stock.
 */
import { useCallback, useEffect, useState } from 'react'
import API from '../api'

const fmt = (n, dec = 2) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: dec })

const SPEED_STYLE = {
    slow: { bg: '#fffbeb', border: '#fde68a', badge: '#fef9c3', badgeText: '#92400e', label: 'Slow Moving' },
    dead: { bg: '#fef2f2', border: '#fecaca', badge: '#fee2e2', badgeText: '#991b1b', label: 'Clearance' },
}

export default function DealerAgeingStock() {
    const [rows, setRows]       = useState([])
    const [filter, setFilter]   = useState('all')   // 'all' | 'slow' | 'dead'
    const [loading, setLoading] = useState(true)
    const [error, setError]     = useState(null)

    const load = useCallback(async () => {
        setLoading(true); setError(null)
        try {
            const res = await API.get('/dealers/cockpit/ageing-stock')
            setRows(res.data?.rows || [])
        } catch { setError('Could not load ageing stock.') }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { load() }, [load])

    const visible = filter === 'all' ? rows : rows.filter(r => r.movement_speed === filter)
    const deadCount = rows.filter(r => r.movement_speed === 'dead').length
    const slowCount = rows.filter(r => r.movement_speed === 'slow').length

    if (loading) return <div className="kt-card"><p style={{ textAlign: 'center', padding: 40, color: 'var(--kt-text-muted)' }}>Loading stock offers…</p></div>
    if (error)   return <div className="kt-toast kt-toast-error">{error} <button onClick={load} style={{ marginLeft: 10, cursor: 'pointer', background: 'none', border: '1px solid currentColor', borderRadius: 4, padding: '2px 8px' }}>Retry</button></div>

    return (
        <div>
            {/* ── Summary + filter bar ────────────────────────────────────────── */}
            <div className="kt-stats-grid">
                <div className="kt-stat-card">
                    <span className="kt-stat-label">Total Offers</span>
                    <span className="kt-stat-value">{rows.length}</span>
                    <span className="kt-stat-sub">Items on special offer</span>
                </div>
                <div className="kt-stat-card" style={{ borderTop: '3px solid #fde68a', background: '#fffbeb' }}>
                    <span className="kt-stat-label" style={{ color: '#b45309' }}>Slow Moving</span>
                    <span className="kt-stat-value" style={{ color: '#b45309' }}>{slowCount}</span>
                    <span className="kt-stat-sub">10% off standard price</span>
                </div>
                <div className="kt-stat-card" style={{ borderTop: '3px solid #fecaca', background: '#fef2f2' }}>
                    <span className="kt-stat-label" style={{ color: '#b91c1c' }}>Clearance</span>
                    <span className="kt-stat-value" style={{ color: '#b91c1c' }}>{deadCount}</span>
                    <span className="kt-stat-sub">15–25% off</span>
                </div>
            </div>

            {/* Offer explanation banner */}
            <div style={{
                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
                padding: '12px 18px', marginBottom: 16, fontSize: 13, color: '#166534'
            }}>
                💡 <strong>Special Offers:</strong> These items are discounted to help clear inventory.
                Slow-moving stock has <strong>10% off</strong>. Clearance stock (idle {'>'} 60 days)
                has up to <strong>25% off</strong>. Contact KT Impex to place an order.
            </div>

            {/* Filter buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {['all', 'slow', 'dead'].map(f => (
                    <button key={f}
                        onClick={() => setFilter(f)}
                        style={{
                            padding: '6px 16px', borderRadius: 20, border: '1px solid var(--kt-border)',
                            background: filter === f ? 'var(--kt-primary)' : 'var(--kt-surface)',
                            color: filter === f ? '#fff' : 'var(--kt-text)',
                            cursor: 'pointer', fontWeight: 600, fontSize: 13,
                        }}
                    >
                        {f === 'all' ? `All (${rows.length})` : f === 'slow' ? `Slow (${slowCount})` : `Clearance (${deadCount})`}
                    </button>
                ))}
            </div>

            {/* ── Stock cards grid ────────────────────────────────────────────── */}
            {visible.length === 0 ? (
                <div className="kt-card">
                    <div className="kt-empty">
                        <div className="kt-empty-icon">🎉</div>
                        <p>No {filter === 'all' ? '' : filter} stock items available right now.</p>
                    </div>
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: 14
                }}>
                    {visible.map(r => {
                        const ss = SPEED_STYLE[r.movement_speed] || SPEED_STYLE.slow
                        return (
                            <div key={r.than_id} style={{
                                background: ss.bg,
                                border: `1px solid ${ss.border}`,
                                borderRadius: 10,
                                padding: 16,
                                position: 'relative',
                            }}>
                                {/* Discount badge */}
                                <div style={{
                                    position: 'absolute', top: 12, right: 12,
                                    background: ss.badge, color: ss.badgeText,
                                    borderRadius: 20, padding: '3px 10px',
                                    fontWeight: 700, fontSize: 12,
                                }}>
                                    {r.discount_pct}% OFF
                                </div>

                                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                                    {r.than_code}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--kt-text-muted)', marginBottom: 8 }}>
                                    {[r.fabric_type, r.color, r.design].filter(Boolean).join(' · ')}
                                    {r.gsm ? ` · ${r.gsm} GSM` : ''}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontSize: 12, color: 'var(--kt-text-muted)' }}>Stock</span>
                                    <span style={{ fontWeight: 600, fontSize: 13 }}>{fmt(r.remaining_stock, 0)} m</span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                    <div>
                                        <div style={{ fontSize: 11, color: 'var(--kt-text-muted)', textDecoration: 'line-through' }}>
                                            NPR {fmt(r.selling_price)}/m
                                        </div>
                                        <div style={{ fontWeight: 700, fontSize: 16, color: ss.badgeText }}>
                                            NPR {fmt(r.offer_price)}/m
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 11, color: 'var(--kt-text-muted)' }}>Idle</div>
                                        <div style={{ fontWeight: 600, color: ss.badgeText, fontSize: 13 }}>{r.days_idle}d</div>
                                    </div>
                                </div>

                                {r.warehouse_location && (
                                    <div style={{ fontSize: 11, color: 'var(--kt-text-muted)', marginTop: 8 }}>
                                        📍 {r.warehouse_location}
                                    </div>
                                )}

                                <div style={{
                                    marginTop: 8,
                                    background: ss.badge, color: ss.badgeText,
                                    borderRadius: 6, padding: '3px 8px',
                                    display: 'inline-block', fontSize: 11, fontWeight: 600,
                                }}>
                                    {ss.label}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import API from '../api'

const money  = (v) => `NPR ${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`
const meters = (v) => `${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} m`
const pct    = (v, d = 1) => `${Number(v || 0).toFixed(d)}%`

// ── Pill helpers ──────────────────────────────────────────────────────────────────
function paymentPillClass(pattern) {
    if (pattern === 'net_60') return 'mini-pill warning'
    if (pattern === 'credit') return 'mini-pill danger'
    if (pattern === 'net_30') return 'mini-pill warning'
    return 'mini-pill'
}
function marginPillClass(p) {
    const n = Number(p || 0)
    if (n >= 20) return 'mini-pill'
    if (n >= 10) return 'mini-pill warning'
    return 'mini-pill danger'
}

// ── Shared sub-components ────────────────────────────────────────────────────────
function KPI({ label, value, accent }) {
    return (
        <div className="metric-card">
            <span>{label}</span>
            <strong style={{
                color: accent === 'danger'  ? 'var(--red)'
                     : accent === 'warning' ? 'var(--gold)'
                     : undefined
            }}>{value}</strong>
        </div>
    )
}
function EmptyState({ msg }) { return <p className="empty-state">{msg}</p> }

// ── Tab config ────────────────────────────────────────────────────────────────────
const VIEWS = [
    { id: 'top-retailers',   label: 'Top Retailers' },
    { id: 'margin-supplier', label: 'Margin / Supplier' },
    { id: 'margin-retailer', label: 'Margin / Retailer' },
    { id: 'payment-aging',   label: 'Payment Aging' },
    { id: 'monthly-pnl',     label: 'Monthly P&L' },
    { id: 'dead-stock-map',  label: 'Dead Stock Map' },
]

// ── Monthly P&L bar chart ───────────────────────────────────────────────────────
function PnLBarChart({ rows }) {
    const [hover, setHover] = useState(null)
    const maxVal = useMemo(() => Math.max(...rows.map(r => Number(r.revenue || 0)), 1), [rows])
    const BAR_H  = 140
    return (
        <div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12, color: 'var(--color-text-muted,#888)' }}>
                <span><span style={{ display:'inline-block', width:10, height:10, borderRadius:2, background:'var(--teal,#01696f)', marginRight:4 }} />Revenue</span>
                <span><span style={{ display:'inline-block', width:10, height:10, borderRadius:2, background:'var(--green,#437a22)', marginRight:4 }} />Gross Profit</span>
            </div>
            <div style={{ display:'flex', alignItems:'flex-end', gap:6, height: BAR_H + 32, overflowX:'auto', paddingBottom:4 }}>
                {rows.map((r, i) => {
                    const rev    = Number(r.revenue      || 0)
                    const profit = Number(r.gross_profit || 0)
                    const revH   = Math.round((rev    / maxVal) * BAR_H)
                    const profH  = Math.round((profit / maxVal) * BAR_H)
                    const isH    = hover === i
                    const label  = r.month ? new Date(r.month + '-01').toLocaleDateString('en-IN', { month:'short', year:'2-digit' }) : r.month
                    return (
                        <div key={i} style={{ flex:'0 0 auto', minWidth:40, display:'flex', flexDirection:'column', alignItems:'center', position:'relative' }}
                            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                            {isH && (
                                <div style={{ position:'absolute', bottom: BAR_H+10, left:'50%', transform:'translateX(-50%)', background:'var(--color-text,#28251d)', color:'#fff', borderRadius:6, padding:'6px 10px', fontSize:11, whiteSpace:'nowrap', zIndex:10, boxShadow:'0 2px 8px rgba(0,0,0,0.18)', lineHeight:1.7 }}>
                                    <div style={{ fontWeight:700 }}>{label}</div>
                                    <div>Rev: {money(rev)}</div>
                                    <div>Profit: {money(profit)}</div>
                                    <div>Margin: {pct(r.margin_pct)}</div>
                                </div>
                            )}
                            <div style={{ display:'flex', alignItems:'flex-end', gap:2, height: BAR_H }}>
                                <div style={{ width:14, height: revH,  background: isH ? '#0c4e54' : 'var(--teal,#01696f)',  borderRadius:'3px 3px 0 0', transition:'all 150ms ease' }} />
                                <div style={{ width:14, height: profH, background: isH ? '#2e5c10' : 'var(--green,#437a22)', borderRadius:'3px 3px 0 0', transition:'all 150ms ease' }} />
                            </div>
                            <div style={{ fontSize:9, color:'var(--color-text-muted,#888)', marginTop:4, transform:'rotate(-35deg)', transformOrigin:'center top', height:22, whiteSpace:'nowrap' }}>{label}</div>
                        </div>
                    )
                })}
            </div>
            <div style={{ display:'flex', gap:24, marginTop:12, paddingTop:12, borderTop:'1px solid var(--color-divider,#dcd9d5)', flexWrap:'wrap' }}>
                {[['Total Revenue', money(rows.reduce((s,r)=>s+Number(r.revenue||0),0))],
                  ['Total Profit',  money(rows.reduce((s,r)=>s+Number(r.gross_profit||0),0))],
                  ['Avg Margin',    pct(rows.reduce((s,r)=>s+Number(r.margin_pct||0),0)/Math.max(rows.length,1))],
                  ['Transactions',  rows.reduce((s,r)=>s+Number(r.transactions||0),0)],
                ].map(([label, val]) => (
                    <div key={label}>
                        <div style={{ fontSize:11, color:'var(--color-text-muted,#888)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:2 }}>{label}</div>
                        <div className="price-accent" style={{ fontSize:16, fontWeight:700 }}>{val}</div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ── Dead stock heatmap cards ───────────────────────────────────────────────────
function DeadStockHeatmap({ rows }) {
    const maxCap = useMemo(() => Math.max(...rows.map(r => Number(r.locked_capital || 0)), 1), [rows])
    const total  = useMemo(() => rows.reduce((s, r) => s + Number(r.locked_capital || 0), 0), [rows])
    function heatBg(ratio) {
        if (ratio < 0.25) return 'var(--color-success-highlight,#d4dfcc)'
        if (ratio < 0.50) return 'var(--color-gold-highlight,#e9e0c6)'
        if (ratio < 0.75) return 'var(--color-warning-highlight,#ddcfc6)'
        return 'var(--color-error-highlight,#e0ced7)'
    }
    function heatText(ratio) {
        if (ratio < 0.25) return 'var(--green,#437a22)'
        if (ratio < 0.50) return 'var(--gold,#d19900)'
        if (ratio < 0.75) return 'var(--orange,#da7101)'
        return 'var(--red,#a12c7b)'
    }
    if (!rows.length) return <EmptyState msg="✅ No slow/dead stock found. All inventory is moving well." />
    return (
        <div>
            <p className="muted-copy" style={{ marginBottom:12 }}>Total locked capital: <strong className="risk-text">{money(total)}</strong></p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                {rows.map(r => {
                    const ratio = Number(r.locked_capital || 0) / maxCap
                    const days  = Math.round(Number(r.avg_idle_days || 0))
                    return (
                        <div key={r.location} style={{ flex:'1 1 150px', minWidth:140, maxWidth:210, background: heatBg(ratio), borderRadius:8, padding:'0.875rem 1rem', border:`1px solid ${heatText(ratio)}33` }}>
                            <div style={{ fontSize:12, fontWeight:700, marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={r.location}>{r.location}</div>
                            <div style={{ fontSize:18, fontWeight:800, color: heatText(ratio), fontVariantNumeric:'tabular-nums' }}>{money(r.locked_capital)}</div>
                            <div style={{ fontSize:11, color:'var(--color-text-muted,#888)', marginTop:3 }}>{r.than_count} thans · {meters(r.total_meters)}</div>
                            <div style={{ fontSize:11, marginTop:2, fontWeight: days>30?600:400, color: days>60?'var(--red,#a12c7b)':days>30?'var(--gold,#d19900)':'var(--color-text-muted,#888)' }}>Idle ~{days}d</div>
                            <div style={{ marginTop:8, height:4, borderRadius:99, background:'rgba(0,0,0,0.1)' }}>
                                <div style={{ width:`${Math.round(ratio*100)}%`, height:'100%', borderRadius:99, background: heatText(ratio), transition:'width 400ms ease' }} />
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ── Main export ───────────────────────────────────────────────────────────────────
export default function AnalyticsDashboard({ user }) {
    const [view,         setView]         = useState('top-retailers')
    const [topRetailers, setTopRetailers] = useState([])
    const [margSupplier, setMargSupplier] = useState([])
    const [margRetailer, setMargRetailer] = useState([])
    const [aging,        setAging]        = useState([])
    const [pnl,          setPnl]          = useState([])
    const [heatmap,      setHeatmap]      = useState([])
    const [balePerf,     setBalePerf]     = useState({ best: [], worst: [] })
    const [baleMode,     setBaleMode]     = useState('best')
    const [loading,      setLoading]      = useState(true)
    const [toast,        setToast]        = useState(null)

    const authHeader = useCallback(
        () => ({ 'x-user-id': String(user.user_id), 'x-user-role': user.role }),
        [user.user_id, user.role]
    )

    const showToast = (msg, type) => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3500)
    }

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const [trR, msR, mrR, agR, pnlR, hmR, bbR, bwR] = await Promise.all([
                API.get('/analytics/top-retailers',         { headers: authHeader() }),
                API.get('/analytics/margin-per-supplier',   { headers: authHeader() }),
                API.get('/analytics/margin-per-retailer',   { headers: authHeader() }),
                API.get('/analytics/payment-aging',         { headers: authHeader() }),
                API.get('/analytics/monthly-pnl',           { headers: authHeader() }),
                API.get('/analytics/dead-stock-by-location',{ headers: authHeader() }),
                API.get('/analytics/bale-performance',      { headers: authHeader(), params: { mode: 'best',  limit: 5 } }),
                API.get('/analytics/bale-performance',      { headers: authHeader(), params: { mode: 'worst', limit: 5 } }),
            ])
            setTopRetailers(Array.isArray(trR.data)     ? trR.data  : [])
            setMargSupplier(Array.isArray(msR.data)     ? msR.data  : [])
            setMargRetailer(Array.isArray(mrR.data)     ? mrR.data  : [])
            setAging(        Array.isArray(agR.data)    ? agR.data  : [])
            setPnl(          Array.isArray(pnlR.data)   ? pnlR.data : [])
            setHeatmap(      Array.isArray(hmR.data)    ? hmR.data  : [])
            setBalePerf({
                best:  Array.isArray(bbR.data?.rows) ? bbR.data.rows : [],
                worst: Array.isArray(bwR.data?.rows) ? bwR.data.rows : [],
            })
        } catch (err) {
            showToast(err?.response?.data?.error || err.message || 'Failed to load analytics', 'error')
        } finally {
            setLoading(false)
        }
    }, [authHeader])

    useEffect(() => { load() }, [load])

    const totalRevenue  = useMemo(() => topRetailers.reduce((s,r) => s + Number(r.revenue  || 0), 0), [topRetailers])
    const totalMargin   = useMemo(() => topRetailers.reduce((s,r) => s + Number(r.margin   || 0), 0), [topRetailers])
    const totalOutstand = useMemo(() => topRetailers.reduce((s,r) => s + Number(r.outstanding_balance || 0), 0), [topRetailers])
    const agingTotal    = useMemo(() => aging.reduce((s,r) => s + Number(r.outstanding_balance || 0), 0), [aging])
    const aging60plus   = useMemo(() => aging.reduce((s,r) => s + Number(r.bucket_60_plus  || 0), 0), [aging])

    if (loading) return <div className="loading">Loading analytics dashboard…</div>

    const baleRows = baleMode === 'best' ? balePerf.best : balePerf.worst

    return (
        <div className="ops-page">
            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

            {/* ── Hero */}
            <section className="card ops-hero">
                <div>
                    <p className="eyebrow">Revenue Intelligence</p>
                    <h2>Analytics Dashboard</h2>
                    <p>Retailer rankings, supplier margin, payment aging, monthly P&amp;L, and dead-stock geography — all in one place.</p>
                </div>
                <div className={`ops-risk ${aging60plus > 0 ? 'risk-high' : totalOutstand > 0 ? 'risk-mid' : 'risk-low'}`}>
                    <span>Outstanding receivables</span>
                    <strong>{money(agingTotal)}</strong>
                    <small>{money(aging60plus)} overdue 60+ days</small>
                    <small>{aging.length} retailer{aging.length !== 1 ? 's' : ''} with open balances</small>
                </div>
            </section>

            {/* ── KPI strip */}
            <section className="metric-grid">
                <KPI label="Total Revenue"     value={money(totalRevenue)} />
                <KPI label="Total Margin"      value={money(totalMargin)} />
                <KPI label="Outstanding"       value={money(totalOutstand)}  accent={totalOutstand  > 0 ? 'warning' : ''} />
                <KPI label="60+ Day Overdue"   value={money(aging60plus)}    accent={aging60plus    > 0 ? 'danger'  : ''} />
                <KPI label="Retailers Tracked" value={topRetailers.length} />
                <KPI label="Suppliers Tracked" value={margSupplier.length} />
            </section>

            {/* ── View tabs */}
            <div className="ds-controls" style={{ marginBottom: '1.25rem' }}>
                <div className="ds-filter-chips">
                    {VIEWS.map(v => (
                        <button key={v.id} className={`ds-chip ${view === v.id ? 'ds-chip--active' : ''}`} onClick={() => setView(v.id)}>
                            {v.label}
                        </button>
                    ))}
                </div>
                <button className="btn btn-secondary" onClick={load} style={{ marginLeft: 'auto' }}>↻ Refresh</button>
            </div>

            {/* ── Top Retailers */}
            {view === 'top-retailers' && (
                <section className="card compact-panel">
                    <h2>Top Retailers by Revenue</h2>
                    <p className="muted-copy">All-time · ranked by total revenue · top 10</p>
                    {topRetailers.length ? (
                        <table style={{ marginTop: 12 }}>
                            <thead>
                                <tr><th>#</th><th>Shop</th><th>Location</th><th>Payment</th><th>Orders</th><th>Meters</th><th>Revenue</th><th>Margin</th><th>Margin %</th><th>Outstanding</th></tr>
                            </thead>
                            <tbody>
                                {topRetailers.map((r, i) => (
                                    <tr key={r.retailer_id}>
                                        <td className="price-accent">#{i + 1}</td>
                                        <td>
                                            <strong>{r.shop_name}</strong>
                                            {r.preferred_categories && <><br /><small style={{ color:'var(--color-text-muted,#888)' }}>{r.preferred_categories}</small></>}
                                        </td>
                                        <td>{r.market_location || '—'}</td>
                                        <td><span className={paymentPillClass(r.payment_pattern)}>{r.payment_pattern?.replace('_',' ') || '—'}</span></td>
                                        <td>{Number(r.order_count || 0)}</td>
                                        <td>{meters(r.meters_bought)}</td>
                                        <td className="price-accent">{money(r.revenue)}</td>
                                        <td className="price-accent">{money(r.margin)}</td>
                                        <td><span className={marginPillClass(r.margin_pct)}>{pct(r.margin_pct)}</span></td>
                                        <td className={Number(r.outstanding_balance) > 0 ? 'risk-text' : ''}>{money(r.outstanding_balance)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : <EmptyState msg="No sales data yet. Record transactions to see top retailers." />}
                </section>
            )}

            {/* ── Margin per Supplier */}
            {view === 'margin-supplier' && (
                <section className="card compact-panel">
                    <h2>Margin per Supplier</h2>
                    <p className="muted-copy">Realized margin, ₹/meter efficiency, and capital utilisation</p>
                    {margSupplier.length ? (
                        <table style={{ marginTop: 12 }}>
                            <thead>
                                <tr><th>Supplier</th><th>Quality</th><th>Delay</th><th>Bales</th><th>Thans</th><th>Meters Sold</th><th>Margin ₹</th><th>₹/Meter</th><th>Capital Eff.</th></tr>
                            </thead>
                            <tbody>
                                {margSupplier.map(s => (
                                    <tr key={s.supplier_id}>
                                        <td>
                                            <strong>{s.supplier_name}</strong>
                                            {s.trend_alignment && <><br /><small style={{ color:'var(--color-text-muted,#888)' }}>{s.trend_alignment}</small></>}
                                        </td>
                                        <td>{Number(s.quality_rating || 0).toFixed(1)}/5</td>
                                        <td><span className="mini-pill">{s.delay_frequency || '—'}</span></td>
                                        <td>{Number(s.bales_received || 0)}</td>
                                        <td>{Number(s.thans_created  || 0)}</td>
                                        <td>{meters(s.meters_sold)}</td>
                                        <td className="price-accent">{money(s.realized_margin)}</td>
                                        <td className="price-accent">{money(s.margin_per_meter)}/m</td>
                                        <td><span className={`mini-pill ${Number(s.capital_efficiency_pct) >= 30 ? '' : 'warning'}`}>{pct(s.capital_efficiency_pct)}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : <EmptyState msg="No supplier transaction data yet." />}
                </section>
            )}

            {/* ── Margin per Retailer */}
            {view === 'margin-retailer' && (
                <section className="card compact-panel">
                    <h2>Margin per Retailer</h2>
                    <p className="muted-copy">Credit risk & margin breakdown · top 15 by margin</p>
                    {margRetailer.length ? (
                        <table style={{ marginTop: 12 }}>
                            <thead>
                                <tr><th>#</th><th>Shop</th><th>Location</th><th>Payment</th><th>Orders</th><th>Revenue</th><th>Total Margin</th><th>Margin %</th><th>Avg/Order</th><th>Outstanding</th></tr>
                            </thead>
                            <tbody>
                                {margRetailer.map((r, i) => (
                                    <tr key={r.retailer_id}>
                                        <td className="price-accent">#{i + 1}</td>
                                        <td>
                                            <strong>{r.shop_name}</strong>
                                            {r.preferred_categories && <><br /><small style={{ color:'var(--color-text-muted,#888)' }}>{r.preferred_categories}</small></>}
                                        </td>
                                        <td>{r.market_location || '—'}</td>
                                        <td><span className={paymentPillClass(r.payment_pattern)}>{r.payment_pattern?.replace('_',' ') || '—'}</span></td>
                                        <td>{Number(r.order_count || 0)}</td>
                                        <td>{money(r.revenue)}</td>
                                        <td className="price-accent">{money(r.total_margin)}</td>
                                        <td><span className={marginPillClass(r.margin_pct)}>{pct(r.margin_pct)}</span></td>
                                        <td className="price-accent">{money(r.avg_margin_per_order)}</td>
                                        <td className={Number(r.outstanding_balance) > 0 ? 'risk-text' : ''}>{money(r.outstanding_balance)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : <EmptyState msg="No transaction data yet." />}
                </section>
            )}

            {/* ── Payment Aging */}
            {view === 'payment-aging' && (
                <section className="card compact-panel">
                    <h2>Retailer Payment Aging</h2>
                    <p className="muted-copy">Unpaid & partial transactions bucketed by days outstanding</p>
                    {aging.length > 0 && (
                        <section className="metric-grid" style={{ marginTop: 12, marginBottom: 4 }}>
                            <KPI label="0–30 Days"           value={money(aging.reduce((s,r)=>s+Number(r.bucket_0_30||0),0))} />
                            <KPI label="31–60 Days"          value={money(aging.reduce((s,r)=>s+Number(r.bucket_31_60||0),0))} accent="warning" />
                            <KPI label="60+ Days (Overdue)"  value={money(aging60plus)} accent={aging60plus > 0 ? 'danger' : ''} />
                            <KPI label="Total Outstanding"   value={money(agingTotal)}  accent={agingTotal  > 0 ? 'warning' : ''} />
                        </section>
                    )}
                    {aging.length ? (
                        <table style={{ marginTop: 12 }}>
                            <thead>
                                <tr><th>Shop</th><th>Location</th><th>Payment</th><th>0–30 d</th><th>31–60 d</th><th>60+ d</th><th>Outstanding</th><th>Unpaid Txns</th><th>Last Sale</th></tr>
                            </thead>
                            <tbody>
                                {aging.map(r => {
                                    const b60 = Number(r.bucket_60_plus || 0)
                                    const b31 = Number(r.bucket_31_60   || 0)
                                    return (
                                        <tr key={r.retailer_id}>
                                            <td>
                                                <strong>{r.shop_name}</strong>
                                                {b60 > 0 && <><br /><span style={{ fontSize:10, color:'var(--red,#a12c7b)', fontWeight:700 }}>OVERDUE</span></>}
                                            </td>
                                            <td>{r.market_location || '—'}</td>
                                            <td><span className={paymentPillClass(r.payment_pattern)}>{r.payment_pattern?.replace('_',' ') || '—'}</span></td>
                                            <td>{Number(r.bucket_0_30 || 0) > 0 ? money(r.bucket_0_30) : '—'}</td>
                                            <td className={b31 > 0 ? 'price-accent' : ''}>{b31 > 0 ? money(b31) : '—'}</td>
                                            <td className={b60 > 0 ? 'risk-text' : ''}><strong>{b60 > 0 ? money(b60) : '—'}</strong></td>
                                            <td className="risk-text"><strong>{money(r.outstanding_balance)}</strong></td>
                                            <td style={{ textAlign:'center' }}><span className="mini-pill danger">{r.unpaid_count}</span></td>
                                            <td>{r.last_transaction ? new Date(r.last_transaction).toLocaleDateString('en-IN') : '—'}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    ) : <EmptyState msg="✅ All retailers are fully paid up." />}
                </section>
            )}

            {/* ── Monthly P&L */}
            {view === 'monthly-pnl' && (
                <section className="ops-grid two">
                    <section className="card compact-panel">
                        <h2>Monthly P&amp;L Chart</h2>
                        <p className="muted-copy">Last 12 months · revenue vs gross profit</p>
                        <div style={{ marginTop: 12 }}>
                            {pnl.length ? <PnLBarChart rows={pnl} /> : <EmptyState msg="No transaction data yet." />}
                        </div>
                    </section>
                    <section className="card compact-panel">
                        <h2>Month-by-Month Breakdown</h2>
                        {pnl.length ? (
                            <table style={{ marginTop: 12 }}>
                                <thead>
                                    <tr><th>Month</th><th>Txns</th><th>Revenue</th><th>COGS</th><th>Gross Profit</th><th>Margin %</th></tr>
                                </thead>
                                <tbody>
                                    {[...pnl].reverse().map(r => (
                                        <tr key={r.month}>
                                            <td>{r.month ? new Date(r.month+'-01').toLocaleDateString('en-IN',{month:'short',year:'numeric'}) : r.month}</td>
                                            <td>{Number(r.transactions || 0)}</td>
                                            <td>{money(r.revenue)}</td>
                                            <td>{money(r.cogs)}</td>
                                            <td className="price-accent">{money(r.gross_profit)}</td>
                                            <td><span className={marginPillClass(r.margin_pct)}>{pct(r.margin_pct)}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : <EmptyState msg="No transaction data yet." />}
                    </section>
                </section>
            )}

            {/* ── Dead Stock Map */}
            {view === 'dead-stock-map' && (
                <section className="card compact-panel">
                    <h2>Dead Stock Heatmap by Warehouse</h2>
                    <p className="muted-copy">Slow-moving & dead inventory · locked capital per location</p>
                    <div style={{ marginTop: 12 }}><DeadStockHeatmap rows={heatmap} /></div>
                </section>
            )}

            {/* ── Bale Performance (persistent) */}
            <section className="card compact-panel">
                <div className="section-heading inline" style={{ marginBottom: '1rem' }}>
                    <h2>Bale Performance</h2>
                    <div style={{ display:'flex', gap:'0.5rem' }}>
                        <button className={`btn ${baleMode==='best'  ? 'btn-primary' : 'btn-outline'}`} onClick={() => setBaleMode('best')}>🏆 Best</button>
                        <button className={`btn ${baleMode==='worst' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setBaleMode('worst')}>⚠ Worst</button>
                    </div>
                </div>
                {baleRows.length ? (
                    <table>
                        <thead>
                            <tr><th>Bale</th><th>Supplier</th><th>Thans</th><th>Meters Sold</th><th>Remaining</th><th>Revenue</th><th>Total Margin</th><th>Margin %</th><th>Sell-Through</th><th>Days Old</th></tr>
                        </thead>
                        <tbody>
                            {baleRows.map(row => (
                                <tr key={row.bale_id}>
                                    <td>{row.bale_code}</td>
                                    <td>{row.supplier_name || '—'}</td>
                                    <td>{Number(row.than_count || 0)}</td>
                                    <td>{meters(row.meters_sold)}</td>
                                    <td>{meters(row.meters_remaining)}</td>
                                    <td>{money(row.revenue)}</td>
                                    <td className="price-accent">{money(row.total_margin)}</td>
                                    <td><span className={`mini-pill ${Number(row.margin_pct)>=25?'':Number(row.margin_pct)>=12?'warning':'danger'}`}>{row.margin_pct != null ? pct(row.margin_pct) : '—'}</span></td>
                                    <td><span className={`mini-pill ${Number(row.sell_through_pct)>=70?'':'warning'}`}>{row.sell_through_pct != null ? pct(row.sell_through_pct) : '—'}</span></td>
                                    <td>{row.days_since_arrival != null ? `${row.days_since_arrival}d` : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : <EmptyState msg={baleMode==='best' ? 'No bale sales data yet.' : 'No underperforming bales found.'} />}
            </section>
        </div>
    )
}

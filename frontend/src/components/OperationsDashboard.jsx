import { useCallback, useEffect, useMemo, useState } from 'react'
import API from '../api'

const money  = (v) => `NPR ${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`
const meters = (v) => `${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} m`

function idlePillClass(days, speed) {
    if (speed === 'dead' || Number(days) >= 60) return 'mini-pill danger'
    if (Number(days) >= 30)                     return 'mini-pill warning'
    return 'mini-pill'
}

const speedLabel = { new: 'New', slow: 'Slow', medium: 'Mid', fast: 'Fast', dead: 'Dead' }

export default function OperationsDashboard({ user }) {
    const [dashboard,      setDashboard]      = useState(null)
    const [inventory,      setInventory]      = useState([])
    const [topRetailers,   setTopRetailers]   = useState([])
    const [marginSupplier, setMarginSupplier] = useState([])
    const [query,          setQuery]          = useState('')
    const [maxPrice,       setMaxPrice]       = useState('')
    const [loading,        setLoading]        = useState(true)
    const [searching,      setSearching]      = useState(false)
    const [searchDone,     setSearchDone]     = useState(false)
    const [toast,          setToast]          = useState(null)

    const authHeader = useCallback(
        () => ({ 'x-user-id': String(user.user_id), 'x-user-role': user.role }),
        [user.user_id, user.role]
    )

    const showToast = (msg, type) => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3500)
    }

    const loadDashboard = useCallback(async () => {
        setLoading(true)
        try {
            const [dashRes, retailersRes, marginsRes] = await Promise.all([
                API.get('/operations/dashboard',           { headers: authHeader() }),
                API.get('/analytics/top-retailers',        { headers: authHeader() }),
                API.get('/analytics/margin-per-supplier',  { headers: authHeader() }),
            ])
            setDashboard(dashRes.data)
            setTopRetailers(Array.isArray(retailersRes.data)  ? retailersRes.data  : [])
            setMarginSupplier(Array.isArray(marginsRes.data)  ? marginsRes.data    : [])
        } catch (err) {
            showToast(err?.response?.data?.error || err.message || 'Could not load dashboard', 'error')
        } finally {
            setLoading(false)
        }
    }, [authHeader])

    const searchInventory = useCallback(async () => {
        setSearching(true)
        const params = {}
        if (query.trim()) params.q = query.trim()
        if (maxPrice)     params.max_price = maxPrice
        try {
            const res = await API.get('/inventory/search', { params, headers: authHeader() })
            setInventory(Array.isArray(res.data) ? res.data : [])
            setSearchDone(true)
        } catch (err) {
            showToast(err?.response?.data?.error || err.message || 'Search failed', 'error')
        } finally {
            setSearching(false)
        }
    }, [query, maxPrice, authHeader])

    useEffect(() => { loadDashboard() }, [loadDashboard])

    const summary   = useMemo(() => dashboard?.summary || {}, [dashboard])
    const riskRatio = useMemo(() => {
        const total = Number(summary.stock_cost_value || 0)
        if (!total) return 0
        return Math.round((Number(summary.dead_stock_value || 0) / total) * 100)
    }, [summary])

    const riskClass = riskRatio >= 20 ? 'risk-high' : riskRatio >= 10 ? 'risk-mid' : 'risk-low'

    if (loading) return <div className="loading">Loading operations dashboard…</div>

    return (
        <div className="ops-page">
            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <section className="card ops-hero">
                <div>
                    <p className="eyebrow">Wholesale intelligence</p>
                    <h2>Inventory Operating System</h2>
                    <p>
                        Bale-to-Than visibility, retailer memory, stock movement,
                        margin signals, and procurement intelligence in one operating view.
                    </p>
                </div>
                <div className={`ops-risk ${riskClass}`}>
                    <span>Dead stock risk</span>
                    <strong>{riskRatio}%</strong>
                    <small>{money(summary.dead_stock_value)} blocked cost value</small>
                    <small>{summary.dead_than_count || 0} than(s) flagged dead</small>
                </div>
            </section>

            {/* ── Metric strip ──────────────────────────────────────────────── */}
            <section className="metric-grid">
                <Metric label="Bales"            value={summary.total_bales || 0} />
                <Metric label="Thans"            value={summary.total_thans || 0} />
                <Metric label="Available Meters" value={meters(summary.available_meters)} />
                <Metric label="Stock Cost"        value={money(summary.stock_cost_value)} />
                <Metric label="Retail Value"      value={money(summary.stock_retail_value)} />
                <Metric label="Unrealized Margin" value={money(summary.unrealized_margin)} />
            </section>

            {/* ── Category + Supplier ───────────────────────────────────────── */}
            <section className="ops-grid two">
                <Panel title="Category Movement">
                    {dashboard?.categoryMovement?.length ? (
                        <table>
                            <thead>
                                <tr><th>Category</th><th>Sold</th><th>Remaining</th><th>Sell-Through</th><th>Margin</th></tr>
                            </thead>
                            <tbody>
                                {dashboard.categoryMovement.map(row => (
                                    <tr key={row.category}>
                                        <td>{row.category}</td>
                                        <td>{meters(row.sold_meters)}</td>
                                        <td>{meters(row.remaining_meters)}</td>
                                        <td>{Math.round(Number(row.sell_through_rate || 0) * 100)}%</td>
                                        <td className="price-accent">{money(row.realized_margin)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : <p className="empty-state">No category data yet. Add thans to see movement.</p>}
                </Panel>

                <Panel title="Supplier Signals">
                    {dashboard?.supplierSignals?.length ? (
                        <table>
                            <thead>
                                <tr><th>Supplier</th><th>Quality</th><th>Delay</th><th>Sold</th><th>Margin</th></tr>
                            </thead>
                            <tbody>
                                {dashboard.supplierSignals.map(row => (
                                    <tr key={row.supplier_id}>
                                        <td>{row.supplier_name}</td>
                                        <td>{Number(row.quality_rating || 0).toFixed(1)}/5</td>
                                        <td><span className="mini-pill">{row.delay_frequency}</span></td>
                                        <td>{meters(row.meters_sold)}</td>
                                        <td className="price-accent">{money(row.realized_margin)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : <p className="empty-state">No suppliers linked yet.</p>}
                </Panel>
            </section>

            {/* ── Dead Stock + Retailer Memory ─────────────────────────────── */}
            <section className="ops-grid two">
                <Panel title="Dead Stock Watchlist">
                    {dashboard?.deadStock?.length ? (
                        <table>
                            <thead>
                                <tr>
                                    <th>Than</th><th>Fabric</th><th>Stock</th>
                                    <th>Cost Value</th><th>Location</th><th>Speed</th><th>Idle Days</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dashboard.deadStock.map(row => (
                                    <tr key={row.than_id}>
                                        <td>{row.than_code}</td>
                                        <td>{[row.color, row.design, row.fabric_type].filter(Boolean).join(' / ')}</td>
                                        <td>{meters(row.remaining_stock)}</td>
                                        <td className="price-accent">{money(row.cost_value)}</td>
                                        <td>{row.warehouse_location || '—'}</td>
                                        <td>
                                            <span className={`mini-pill ${
                                                row.movement_speed === 'dead' ? 'danger'
                                                : row.movement_speed === 'slow' ? 'warning' : ''
                                            }`}>
                                                {speedLabel[row.movement_speed] || row.movement_speed}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={idlePillClass(row.days_without_movement, row.movement_speed)}>
                                                {row.days_without_movement ?? '—'}d
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="empty-state">✅ No dead or slow stock detected. All thans are moving.</p>
                    )}
                </Panel>

                <Panel title="Retailer Memory">
                    {dashboard?.retailerSignals?.length ? (
                        <table>
                            <thead>
                                <tr><th>Retailer</th><th>Prefers</th><th>Payment</th><th>Revenue</th><th>Balance</th></tr>
                            </thead>
                            <tbody>
                                {dashboard.retailerSignals.map(row => (
                                    <tr key={row.retailer_id}>
                                        <td>{row.shop_name}<br /><small>{row.market_location || '—'}</small></td>
                                        <td>{row.preferred_categories || '—'}</td>
                                        <td><span className="mini-pill">{row.payment_pattern}</span></td>
                                        <td>{money(row.revenue)}</td>
                                        <td className={Number(row.outstanding_balance) > 0 ? 'risk-text' : ''}>
                                            {money(row.outstanding_balance)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : <p className="empty-state">No retailers added yet.</p>}
                </Panel>
            </section>

            {/* ── TOP RETAILERS + MARGIN-PER-SUPPLIER ──────────────────────── */}
            <section className="ops-grid two">
                <Panel title="Top Retailers by Revenue">
                    {topRetailers.length ? (
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Shop</th>
                                    <th>Location</th>
                                    <th>Orders</th>
                                    <th>Revenue</th>
                                    <th>Margin %</th>
                                    <th>Balance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topRetailers.map((row, i) => (
                                    <tr key={row.retailer_id}>
                                        <td className="price-accent">#{i + 1}</td>
                                        <td>
                                            {row.shop_name}
                                            {row.preferred_categories && (
                                                <><br /><small style={{ color: 'var(--color-text-muted, #888)' }}>{row.preferred_categories}</small></>
                                            )}
                                        </td>
                                        <td>{row.market_location || '—'}</td>
                                        <td>{Number(row.order_count || 0)}</td>
                                        <td className="price-accent">{money(row.revenue)}</td>
                                        <td>
                                            <span className={`mini-pill ${
                                                Number(row.margin_pct) >= 20 ? '' : 'warning'
                                            }`}>
                                                {row.margin_pct != null ? `${row.margin_pct}%` : '—'}
                                            </span>
                                        </td>
                                        <td className={Number(row.outstanding_balance) > 0 ? 'risk-text' : ''}>
                                            {money(row.outstanding_balance)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="empty-state">No retailer transactions yet. Record a sale to see rankings.</p>
                    )}
                </Panel>

                <Panel title="Margin per Supplier">
                    {marginSupplier.length ? (
                        <table>
                            <thead>
                                <tr>
                                    <th>Supplier</th>
                                    <th>Quality</th>
                                    <th>Delay</th>
                                    <th>Margin/m</th>
                                    <th>Total Margin</th>
                                    <th>Capital Eff.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {marginSupplier.map(row => (
                                    <tr key={row.supplier_id}>
                                        <td>
                                            {row.supplier_name}
                                            {row.trend_alignment && (
                                                <><br /><small style={{ color: 'var(--color-text-muted, #888)' }}>{row.trend_alignment}</small></>
                                            )}
                                        </td>
                                        <td>{Number(row.quality_rating || 0).toFixed(1)}/5</td>
                                        <td><span className="mini-pill">{row.delay_frequency || '—'}</span></td>
                                        <td className="price-accent">
                                            {row.margin_per_meter != null ? money(row.margin_per_meter) + '/m' : '—'}
                                        </td>
                                        <td className="price-accent">{money(row.realized_margin)}</td>
                                        <td>
                                            <span className={`mini-pill ${
                                                Number(row.capital_efficiency_pct) >= 30 ? '' : 'warning'
                                            }`}>
                                                {row.capital_efficiency_pct != null ? `${row.capital_efficiency_pct}%` : '—'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="empty-state">No supplier data yet. Add bales from suppliers to see margins.</p>
                    )}
                </Panel>
            </section>

            {/* ── Inventory Search ─────────────────────────────────────────── */}
            <section className="card">
                <div className="section-heading inline">
                    <div>
                        <h2>Inventory Search</h2>
                        <p className="muted-copy">Search by fabric, colour, design, category, than code, or warehouse location.</p>
                    </div>
                </div>
                <div className="search-row">
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchInventory()}
                        placeholder="e.g. black floral cotton"
                    />
                    <input
                        type="number"
                        min="0"
                        value={maxPrice}
                        onChange={e => setMaxPrice(e.target.value)}
                        placeholder="Max price/m"
                    />
                    <button className="btn btn-primary" onClick={searchInventory} disabled={searching}>
                        {searching ? 'Searching…' : 'Search'}
                    </button>
                </div>

                {searchDone && (
                    inventory.length ? (
                        <table>
                            <thead>
                                <tr><th>Than</th><th>Fabric</th><th>Stock</th><th>Price/m</th><th>Margin/m</th><th>Location</th><th>Speed</th></tr>
                            </thead>
                            <tbody>
                                {inventory.map(row => (
                                    <tr key={row.than_id}>
                                        <td>{row.than_code}</td>
                                        <td>{[row.color, row.design, row.fabric_type].filter(Boolean).join(' / ')}</td>
                                        <td>{meters(row.remaining_stock)}</td>
                                        <td>{money(row.selling_price)}</td>
                                        <td className="price-accent">{money(row.margin_per_meter)}</td>
                                        <td>{row.warehouse_location || '—'}</td>
                                        <td>
                                            <span className={`mini-pill ${
                                                row.movement_speed === 'dead' ? 'danger'
                                                : row.movement_speed === 'slow' ? 'warning' : ''
                                            }`}>
                                                {speedLabel[row.movement_speed] || row.movement_speed}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="empty-state">No matching thans found.</p>
                    )
                )}
                {!searchDone && (
                    <p className="muted-copy" style={{ marginTop: '0.75rem' }}>
                        Enter a term above and press Search.
                    </p>
                )}
            </section>
        </div>
    )
}

function Metric({ label, value }) {
    return (
        <div className="metric-card">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    )
}

function Panel({ title, children }) {
    return (
        <section className="card compact-panel">
            <h2>{title}</h2>
            {children}
        </section>
    )
}

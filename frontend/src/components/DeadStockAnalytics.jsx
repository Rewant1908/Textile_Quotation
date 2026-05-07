import { useCallback, useEffect, useMemo, useState } from 'react'
import API from '../api'

const money  = (v) => `NPR ${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`
const meters = (v) => `${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} m`

const SPEED_LABEL = { dead: 'Dead', slow: 'Slow', medium: 'Mid', fast: 'Fast', new: 'New' }
const SPEED_ORDER = { dead: 0, slow: 1, new: 2, medium: 3, fast: 4 }

function speedPillClass(speed) {
    if (speed === 'dead') return 'ds-pill ds-pill--dead'
    if (speed === 'slow') return 'ds-pill ds-pill--slow'
    if (speed === 'new')  return 'ds-pill ds-pill--new'
    return 'ds-pill'
}

function idlePillClass(days, speed) {
    if (speed === 'dead' || Number(days) >= 60) return 'ds-pill ds-pill--dead'
    if (Number(days) >= 30) return 'ds-pill ds-pill--slow'
    return 'ds-pill'
}

export default function DeadStockAnalytics({ user }) {
    const [dashboard, setDashboard] = useState(null)
    const [loading,   setLoading]   = useState(true)
    const [toast,     setToast]     = useState(null)

    // Filters & sorting
    const [filterSpeed, setFilterSpeed] = useState('all')     // all | dead | slow | new
    const [sortKey,     setSortKey]     = useState('idle')     // idle | cost | stock
    const [sortDir,     setSortDir]     = useState('desc')
    const [search,      setSearch]      = useState('')
    const [page,        setPage]        = useState(1)
    const PAGE_SIZE = 10

    const authHeader = useCallback(
        () => ({ 'x-user-id': String(user.user_id), 'x-user-role': user.role }),
        [user.user_id, user.role]
    )

    const showToast = (msg, type) => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 4000)
    }

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await API.get('/operations/dashboard', { headers: authHeader() })
            setDashboard(res.data)
        } catch (err) {
            showToast(err?.response?.data?.error || err.message || 'Failed to load dead stock data', 'error')
        } finally {
            setLoading(false)
        }
    }, [authHeader])

    useEffect(() => { load() }, [load])

    // ── Derived KPIs ──────────────────────────────────────────────────────────
    const summary = useMemo(() => dashboard?.summary || {}, [dashboard])

    const allDeadItems = useMemo(() => {
        if (!dashboard?.deadStock) return []
        return dashboard.deadStock
    }, [dashboard])

    const deadCount  = useMemo(() => allDeadItems.filter(r => r.movement_speed === 'dead').length, [allDeadItems])
    const slowCount  = useMemo(() => allDeadItems.filter(r => r.movement_speed === 'slow').length, [allDeadItems])
    const deadValue  = useMemo(() => allDeadItems
        .filter(r => r.movement_speed === 'dead')
        .reduce((s, r) => s + Number(r.cost_value || 0), 0), [allDeadItems])
    const totalLockedValue = useMemo(() => allDeadItems
        .reduce((s, r) => s + Number(r.cost_value || 0), 0), [allDeadItems])
    const riskRatio = useMemo(() => {
        const total = Number(summary.stock_cost_value || 0)
        if (!total) return 0
        return Math.round((Number(summary.dead_stock_value || 0) / total) * 100)
    }, [summary])

    const avgIdleDays = useMemo(() => {
        const items = allDeadItems.filter(r => r.days_without_movement != null)
        if (!items.length) return 0
        return Math.round(items.reduce((s, r) => s + Number(r.days_without_movement), 0) / items.length)
    }, [allDeadItems])

    // ── Filtered + sorted list ────────────────────────────────────────────────
    const filtered = useMemo(() => {
        let list = [...allDeadItems]

        if (filterSpeed !== 'all')
            list = list.filter(r => r.movement_speed === filterSpeed)

        if (search.trim()) {
            const q = search.trim().toLowerCase()
            list = list.filter(r =>
                [r.than_code, r.fabric_type, r.color, r.design, r.warehouse_location]
                    .filter(Boolean).some(v => v.toLowerCase().includes(q))
            )
        }

        list.sort((a, b) => {
            let av, bv
            if (sortKey === 'idle') {
                av = Number(a.days_without_movement ?? -1)
                bv = Number(b.days_without_movement ?? -1)
            } else if (sortKey === 'cost') {
                av = Number(a.cost_value || 0)
                bv = Number(b.cost_value || 0)
            } else if (sortKey === 'stock') {
                av = Number(a.remaining_stock || 0)
                bv = Number(b.remaining_stock || 0)
            } else if (sortKey === 'speed') {
                av = SPEED_ORDER[a.movement_speed] ?? 99
                bv = SPEED_ORDER[b.movement_speed] ?? 99
            } else {
                av = 0; bv = 0
            }
            return sortDir === 'desc' ? bv - av : av - bv
        })

        return list
    }, [allDeadItems, filterSpeed, search, sortKey, sortDir])

    const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    const pageItems   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    const toggleSort = (key) => {
        if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
        else { setSortKey(key); setSortDir('desc') }
        setPage(1)
    }

    // ── Category dead-stock breakdown ─────────────────────────────────────────
    const categoryBreakdown = useMemo(() => {
        const map = {}
        allDeadItems.forEach(r => {
            const cat = r.fabric_type || 'Unknown'
            if (!map[cat]) map[cat] = { category: cat, count: 0, value: 0, meters: 0 }
            map[cat].count++
            map[cat].value  += Number(r.cost_value || 0)
            map[cat].meters += Number(r.remaining_stock || 0)
        })
        return Object.values(map).sort((a, b) => b.value - a.value)
    }, [allDeadItems])

    // ── Highest-risk items (top 5 by cost_value) ──────────────────────────────
    const criticalItems = useMemo(() =>
        [...allDeadItems]
            .filter(r => r.movement_speed === 'dead')
            .sort((a, b) => Number(b.cost_value) - Number(a.cost_value))
            .slice(0, 5)
    , [allDeadItems])

    if (loading) return <div className="loading">Loading dead stock analytics…</div>

    if (!dashboard) return (
        <div className="ds-error-state">
            <p>Could not load data. <button className="btn btn-primary" onClick={load}>Retry</button></p>
        </div>
    )

    const sortArrow = (key) => sortKey === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''

    return (
        <div className="ds-page">
            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

            {/* ── Header ──────────────────────────────────────────────────────── */}
            <section className="ds-header card">
                <div className="ds-header-copy">
                    <p className="eyebrow">Inventory Intelligence</p>
                    <h2>Dead Stock Analytics</h2>
                    <p className="muted-copy">
                        Track idle inventory, capital locked in dead &amp; slow-moving thans,
                        and make recovery decisions before stock becomes a write-off.
                    </p>
                </div>
                <div className={`ds-risk-gauge ${
                    riskRatio >= 20 ? 'gauge--high' : riskRatio >= 10 ? 'gauge--mid' : 'gauge--low'
                }`}>
                    <span>Portfolio risk</span>
                    <strong>{riskRatio}%</strong>
                    <small>of stock cost value is dead</small>
                    <div className="ds-gauge-bar">
                        <div className="ds-gauge-fill" style={{ width: `${Math.min(riskRatio, 100)}%` }} />
                    </div>
                    <button className="btn btn-secondary ds-refresh-btn" onClick={load}>↻ Refresh</button>
                </div>
            </section>

            {/* ── KPI strip ───────────────────────────────────────────────────── */}
            <section className="metric-grid">
                <KPI label="Dead Thans"      value={deadCount}          accent="danger" />
                <KPI label="Slow Thans"      value={slowCount}          accent="warning" />
                <KPI label="Capital Locked (Dead)" value={money(deadValue)} accent="danger" />
                <KPI label="Total Idle Value" value={money(totalLockedValue)} />
                <KPI label="Avg Idle Days"   value={`${avgIdleDays}d`} accent={avgIdleDays >= 60 ? 'danger' : avgIdleDays >= 30 ? 'warning' : ''} />
                <KPI label="Dead Stock Risk" value={`${riskRatio}%`}   accent={riskRatio >= 20 ? 'danger' : riskRatio >= 10 ? 'warning' : ''} />
            </section>

            {/* ── Category breakdown + Critical alerts ─────────────────────── */}
            <section className="ops-grid two">
                {/* Category breakdown */}
                <section className="card compact-panel">
                    <h2>Idle Stock by Category</h2>
                    {categoryBreakdown.length ? (
                        <>
                            {/* Mini bar chart */}
                            <div className="ds-bar-chart">
                                {categoryBreakdown.map(c => {
                                    const pct = totalLockedValue > 0
                                        ? Math.round((c.value / totalLockedValue) * 100) : 0
                                    return (
                                        <div key={c.category} className="ds-bar-row">
                                            <span className="ds-bar-label">{c.category}</span>
                                            <div className="ds-bar-track">
                                                <div className="ds-bar-fill" style={{ width: `${pct}%` }} />
                                            </div>
                                            <span className="ds-bar-value">{pct}%</span>
                                        </div>
                                    )
                                })}
                            </div>
                            <table style={{ marginTop: 16 }}>
                                <thead>
                                    <tr>
                                        <th>Category</th>
                                        <th>Thans</th>
                                        <th>Meters</th>
                                        <th>Locked Value</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {categoryBreakdown.map(c => (
                                        <tr key={c.category}>
                                            <td>{c.category}</td>
                                            <td>{c.count}</td>
                                            <td>{meters(c.meters)}</td>
                                            <td className="price-accent">{money(c.value)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    ) : <p className="empty-state">No idle stock to show.</p>}
                </section>

                {/* Critical 5 */}
                <section className="card compact-panel">
                    <h2>Critical Alerts — Top Dead Thans</h2>
                    {criticalItems.length ? (
                        <div className="ds-alert-list">
                            {criticalItems.map((r, i) => (
                                <div key={r.than_id} className="ds-alert-card">
                                    <div className="ds-alert-rank">#{i + 1}</div>
                                    <div className="ds-alert-body">
                                        <p className="ds-alert-code">{r.than_code}</p>
                                        <p className="ds-alert-desc">
                                            {[r.color, r.design, r.fabric_type].filter(Boolean).join(' / ')}
                                        </p>
                                        <p className="ds-alert-meta">
                                            {meters(r.remaining_stock)} &nbsp;·&nbsp;
                                            {r.warehouse_location || 'No location'} &nbsp;·&nbsp;
                                            <span style={{ color: 'var(--red)' }}>
                                                {r.days_without_movement ?? '?'}d idle
                                            </span>
                                        </p>
                                    </div>
                                    <div className="ds-alert-value">
                                        <strong>{money(r.cost_value)}</strong>
                                        <small>locked</small>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="empty-state">✅ No critically dead thans. Great work!</p>
                    )}
                </section>
            </section>

            {/* ── Full Dead Stock Register ─────────────────────────────────── */}
            <section className="card">
                <div className="section-heading inline" style={{ marginBottom: 16 }}>
                    <div>
                        <h2>Dead Stock Register</h2>
                        <p className="muted-copy">
                            {filtered.length} than{filtered.length !== 1 ? 's' : ''} matched
                            {filterSpeed !== 'all' ? ` · filter: ${SPEED_LABEL[filterSpeed]}` : ''}
                        </p>
                    </div>
                </div>

                {/* Controls */}
                <div className="ds-controls">
                    <div className="search-row" style={{ marginBottom: 0, flex: 1 }}>
                        <input
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1) }}
                            placeholder="Search than code, fabric, colour, location…"
                        />
                    </div>
                    <div className="ds-filter-chips">
                        {['all', 'dead', 'slow', 'new'].map(s => (
                            <button
                                key={s}
                                className={`ds-chip ${
                                    filterSpeed === s
                                        ? s === 'dead' ? 'ds-chip--active-dead'
                                        : s === 'slow' ? 'ds-chip--active-slow'
                                        : 'ds-chip--active'
                                        : ''
                                }`}
                                onClick={() => { setFilterSpeed(s); setPage(1) }}
                            >
                                {s === 'all' ? 'All' : SPEED_LABEL[s]}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Table */}
                {pageItems.length ? (
                    <div className="table-wrap" style={{ marginTop: 16 }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Than Code</th>
                                    <th>Fabric</th>
                                    <th
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => toggleSort('stock')}
                                    >Stock{sortArrow('stock')}</th>
                                    <th
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => toggleSort('cost')}
                                    >Locked Value{sortArrow('cost')}</th>
                                    <th>Location</th>
                                    <th
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => toggleSort('speed')}
                                    >Speed{sortArrow('speed')}</th>
                                    <th
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => toggleSort('idle')}
                                    >Idle Days{sortArrow('idle')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageItems.map(row => (
                                    <tr key={row.than_id}>
                                        <td style={{ fontWeight: 700 }}>{row.than_code}</td>
                                        <td>{[row.color, row.design, row.fabric_type].filter(Boolean).join(' / ')}</td>
                                        <td>{meters(row.remaining_stock)}</td>
                                        <td className="price-accent">{money(row.cost_value)}</td>
                                        <td>{row.warehouse_location || '—'}</td>
                                        <td><span className={speedPillClass(row.movement_speed)}>
                                            {SPEED_LABEL[row.movement_speed] || row.movement_speed}
                                        </span></td>
                                        <td>
                                            <span className={idlePillClass(row.days_without_movement, row.movement_speed)}>
                                                {row.days_without_movement ?? '—'}d
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="empty-state" style={{ marginTop: 16 }}>
                        {search || filterSpeed !== 'all'
                            ? 'No thans match the current filters.'
                            : '✅ No dead or slow stock detected. All thans are moving.'}
                    </p>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="ds-pagination">
                        <button
                            className="btn btn-secondary"
                            disabled={page === 1}
                            onClick={() => setPage(p => p - 1)}
                        >← Prev</button>
                        <span className="ds-page-info">Page {page} of {totalPages}</span>
                        <button
                            className="btn btn-secondary"
                            disabled={page === totalPages}
                            onClick={() => setPage(p => p + 1)}
                        >Next →</button>
                    </div>
                )}
            </section>
        </div>
    )
}

function KPI({ label, value, accent }) {
    return (
        <div className="metric-card">
            <span>{label}</span>
            <strong style={{
                color: accent === 'danger'  ? 'var(--red)'
                     : accent === 'warning' ? 'var(--gold)'
                     : 'var(--red-dark)'
            }}>{value}</strong>
        </div>
    )
}

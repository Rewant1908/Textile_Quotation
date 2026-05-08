import { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function getToken() {
    return localStorage.getItem('kt_impex_token') || '';
}

function authHeaders() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmt(n, decimals = 0) {
    const num = parseFloat(n);
    if (isNaN(num)) return '—';
    return new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(num);
}

function fmtRs(n) {
    const num = parseFloat(n);
    if (isNaN(num)) return '—';
    return '₹' + fmt(num, 0);
}

function badge(label, color) {
    return (
        <span style={{
            display: 'inline-block', padding: '2px 8px', borderRadius: 99,
            fontSize: 11, fontWeight: 600, letterSpacing: '0.03em',
            background: color + '22', color, border: `1px solid ${color}44`
        }}>{label}</span>
    );
}

function paymentBadge(pattern) {
    const map = {
        immediate: '#437a22',
        net_15:    '#006494',
        net_30:    '#d19900',
        net_60:    '#da7101',
        credit:    '#a12c7b',
    };
    const color = map[pattern] || '#7a7974';
    return badge(pattern?.replace('_', ' ') || '—', color);
}

function marginColor(pct) {
    const p = parseFloat(pct);
    if (isNaN(p)) return '#7a7974';
    if (p >= 20) return '#437a22';
    if (p >= 10) return '#006494';
    if (p >= 0)  return '#d19900';
    return '#a12c7b';
}

// ─── Skeleton row ───────────────────────────────────────────────────────────
function SkeletonRows({ cols, rows = 5 }) {
    return Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
            {Array.from({ length: cols }).map((__, j) => (
                <td key={j}>
                    <div style={{
                        height: 14, borderRadius: 4,
                        background: 'linear-gradient(90deg,var(--color-surface-offset,#f0eeea) 25%,var(--color-surface-dynamic,#e6e4df) 50%,var(--color-surface-offset,#f0eeea) 75%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 1.4s ease-in-out infinite',
                        width: j === 0 ? '80%' : '60%',
                    }} />
                </td>
            ))}
        </tr>
    ));
}

// ─── Section wrapper ────────────────────────────────────────────────────────
function Section({ title, subtitle, children, action }) {
    return (
        <div style={{
            background: 'var(--color-surface, #f9f8f5)',
            border: '1px solid var(--color-border, #d4d1ca)',
            borderRadius: 10, overflow: 'hidden',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            marginBottom: '1.5rem',
        }}>
            <div style={{
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                padding: '1rem 1.25rem 0.75rem', borderBottom: '1px solid var(--color-divider, #dcd9d5)',
            }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-text,#28251d)' }}>{title}</h3>
                    {subtitle && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted,#7a7974)' }}>{subtitle}</p>}
                </div>
                {action}
            </div>
            <div style={{ overflowX: 'auto' }}>{children}</div>
        </div>
    );
}

// ─── Table wrapper ──────────────────────────────────────────────────────────
function DataTable({ headers, children }) {
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
                <tr style={{ background: 'var(--color-surface-offset,#f3f0ec)' }}>
                    {headers.map((h, i) => (
                        <th key={i} style={{
                            padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right',
                            fontWeight: 600, fontSize: 11, letterSpacing: '0.04em',
                            color: 'var(--color-text-muted,#7a7974)',
                            textTransform: 'uppercase', whiteSpace: 'nowrap',
                            borderBottom: '1px solid var(--color-divider,#dcd9d5)',
                        }}>{h}</th>
                    ))}
                </tr>
            </thead>
            <tbody>{children}</tbody>
        </table>
    );
}

function Td({ children, right, muted }) {
    return (
        <td style={{
            padding: '9px 12px',
            textAlign: right ? 'right' : 'left',
            color: muted ? 'var(--color-text-muted,#7a7974)' : 'var(--color-text,#28251d)',
            borderBottom: '1px solid var(--color-divider,#dcd9d5)',
            whiteSpace: 'nowrap',
            fontVariantNumeric: right ? 'tabular-nums' : 'normal',
        }}>{children}</td>
    );
}

// ─── Top Retailers table ─────────────────────────────────────────────────────
function TopRetailersTable() {
    const [rows, setRows]   = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(`${API}/api/analytics/top-retailers`, { headers: authHeaders() });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setRows(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const headers = ['#', 'Shop', 'Location', 'Payment', 'Orders', 'Meters', 'Revenue', 'Margin', 'Margin %', 'Outstanding'];

    return (
        <Section
            title="Top Retailers by Revenue"
            subtitle="All-time, ranked by total revenue · top 10"
            action={
                <button onClick={load} title="Refresh"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary,#01696f)', fontSize: 18, lineHeight: 1, padding: '2px 4px' }}
                >↻</button>
            }
        >
            {error && (
                <div style={{ padding: '1rem', color: '#a12c7b', fontSize: 13 }}>Error: {error} <button onClick={load} style={{ marginLeft: 8, color: 'inherit', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button></div>
            )}
            <DataTable headers={headers}>
                {loading
                    ? <SkeletonRows cols={headers.length} />
                    : rows.length === 0
                        ? <tr><td colSpan={headers.length} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted,#7a7974)', fontSize: 13 }}>No sales data yet. Record transactions to see top retailers.</td></tr>
                        : rows.map((r, i) => (
                            <tr key={r.retailer_id}
                                style={{ background: i % 2 === 0 ? 'transparent' : 'var(--color-surface-offset,#f3f0ec)22' }}
                            >
                                <Td muted>{i + 1}</Td>
                                <Td><strong>{r.shop_name}</strong></Td>
                                <Td muted>{r.market_location || '—'}</Td>
                                <Td>{paymentBadge(r.payment_pattern)}</Td>
                                <Td right>{fmt(r.order_count)}</Td>
                                <Td right>{fmt(r.meters_bought)} m</Td>
                                <Td right><strong>{fmtRs(r.revenue)}</strong></Td>
                                <Td right>{fmtRs(r.margin)}</Td>
                                <Td right>
                                    <span style={{ color: marginColor(r.margin_pct), fontWeight: 600 }}>
                                        {fmt(r.margin_pct, 1)}%
                                    </span>
                                </Td>
                                <Td right>
                                    <span style={{ color: parseFloat(r.outstanding_balance) > 0 ? '#da7101' : '#437a22', fontWeight: 600 }}>
                                        {fmtRs(r.outstanding_balance)}
                                    </span>
                                </Td>
                            </tr>
                        ))
                }
            </DataTable>
        </Section>
    );
}

// ─── Margin per Supplier table ───────────────────────────────────────────────
function MarginPerSupplierTable() {
    const [rows, setRows]       = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(`${API}/api/analytics/margin-per-supplier`, { headers: authHeaders() });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setRows(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const headers = ['Supplier', 'Quality', 'Bales', 'Thans', 'Meters Sold', 'Margin ₹', '₹/Meter', 'Capital Eff.', 'Delays'];

    function qualityStars(rating) {
        const r = parseFloat(rating);
        if (isNaN(r)) return '—';
        const filled = Math.round(r);
        return '★'.repeat(filled) + '☆'.repeat(5 - filled);
    }

    function delayBadge(freq) {
        const map = { never: '#437a22', rarely: '#006494', sometimes: '#d19900', often: '#da7101', always: '#a12c7b' };
        const color = map[freq] || '#7a7974';
        return badge(freq || '—', color);
    }

    return (
        <Section
            title="Margin per Supplier"
            subtitle="Realized margin, ₹/meter efficiency, and capital utilisation"
            action={
                <button onClick={load} title="Refresh"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary,#01696f)', fontSize: 18, lineHeight: 1, padding: '2px 4px' }}
                >↻</button>
            }
        >
            {error && (
                <div style={{ padding: '1rem', color: '#a12c7b', fontSize: 13 }}>Error: {error} <button onClick={load} style={{ marginLeft: 8, color: 'inherit', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button></div>
            )}
            <DataTable headers={headers}>
                {loading
                    ? <SkeletonRows cols={headers.length} />
                    : rows.length === 0
                        ? <tr><td colSpan={headers.length} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted,#7a7974)', fontSize: 13 }}>No supplier transaction data yet.</td></tr>
                        : rows.map((s, i) => (
                            <tr key={s.supplier_id}
                                style={{ background: i % 2 === 0 ? 'transparent' : 'var(--color-surface-offset,#f3f0ec)22' }}
                            >
                                <Td><strong>{s.supplier_name}</strong></Td>
                                <Td>
                                    <span style={{ color: '#d19900', letterSpacing: 1 }} title={`${s.quality_rating}/5`}>
                                        {qualityStars(s.quality_rating)}
                                    </span>
                                </Td>
                                <Td right muted>{fmt(s.bales_received)}</Td>
                                <Td right muted>{fmt(s.thans_created)}</Td>
                                <Td right>{fmt(s.meters_sold)} m</Td>
                                <Td right><strong>{fmtRs(s.realized_margin)}</strong></Td>
                                <Td right>
                                    <span style={{ color: marginColor(parseFloat(s.margin_per_meter) * 5), fontWeight: 600 }}>
                                        {fmtRs(s.margin_per_meter)}
                                    </span>
                                </Td>
                                <Td right>
                                    <span style={{ color: marginColor(s.capital_efficiency_pct), fontWeight: 600 }}>
                                        {fmt(s.capital_efficiency_pct, 1)}%
                                    </span>
                                </Td>
                                <Td>{delayBadge(s.delay_frequency)}</Td>
                            </tr>
                        ))
                }
            </DataTable>
        </Section>
    );
}

// ─── Margin per Retailer table ───────────────────────────────────────────────
function MarginPerRetailerTable() {
    const [rows, setRows]       = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(`${API}/api/analytics/margin-per-retailer`, { headers: authHeaders() });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setRows(Array.isArray(data) ? data : []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const headers = ['Shop', 'Location', 'Payment', 'Orders', 'Revenue', 'Total Margin', 'Margin %', 'Avg/Order', 'Outstanding'];

    return (
        <Section
            title="Margin per Retailer"
            subtitle="Credit risk & margin breakdown · top 15 by margin"
            action={
                <button onClick={load} title="Refresh"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary,#01696f)', fontSize: 18, lineHeight: 1, padding: '2px 4px' }}
                >↻</button>
            }
        >
            {error && (
                <div style={{ padding: '1rem', color: '#a12c7b', fontSize: 13 }}>Error: {error} <button onClick={load} style={{ marginLeft: 8, color: 'inherit', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button></div>
            )}
            <DataTable headers={headers}>
                {loading
                    ? <SkeletonRows cols={headers.length} />
                    : rows.length === 0
                        ? <tr><td colSpan={headers.length} style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted,#7a7974)', fontSize: 13 }}>No transaction data yet.</td></tr>
                        : rows.map((r, i) => (
                            <tr key={r.retailer_id}
                                style={{ background: i % 2 === 0 ? 'transparent' : 'var(--color-surface-offset,#f3f0ec)22' }}
                            >
                                <Td><strong>{r.shop_name}</strong></Td>
                                <Td muted>{r.market_location || '—'}</Td>
                                <Td>{paymentBadge(r.payment_pattern)}</Td>
                                <Td right muted>{fmt(r.order_count)}</Td>
                                <Td right>{fmtRs(r.revenue)}</Td>
                                <Td right><strong>{fmtRs(r.total_margin)}</strong></Td>
                                <Td right>
                                    <span style={{ color: marginColor(r.margin_pct), fontWeight: 600 }}>
                                        {fmt(r.margin_pct, 1)}%
                                    </span>
                                </Td>
                                <Td right muted>{fmtRs(r.avg_margin_per_order)}</Td>
                                <Td right>
                                    <span style={{ color: parseFloat(r.outstanding_balance) > 0 ? '#da7101' : '#437a22', fontWeight: 600 }}>
                                        {fmtRs(r.outstanding_balance)}
                                    </span>
                                </Td>
                            </tr>
                        ))
                }
            </DataTable>
        </Section>
    );
}

// ─── Main export ─────────────────────────────────────────────────────────────
export default function AnalyticsDashboard({ user }) {
    const [activeView, setActiveView] = useState('top-retailers');

    const views = [
        { id: 'top-retailers',      label: 'Top Retailers' },
        { id: 'margin-supplier',    label: 'Margin / Supplier' },
        { id: 'margin-retailer',    label: 'Margin / Retailer' },
    ];

    return (
        <div style={{ padding: '1.25rem', maxWidth: 1100, margin: '0 auto' }}>
            {/* shimmer keyframe */}
            <style>{`@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}`}</style>

            <div style={{ marginBottom: '1.25rem' }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--color-text,#28251d)' }}>Analytics Dashboard</h2>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-muted,#7a7974)' }}>
                    Revenue intelligence · margin analysis · credit risk
                </p>
            </div>

            {/* Sub-navigation */}
            <div style={{
                display: 'flex', gap: 6, marginBottom: '1.25rem',
                background: 'var(--color-surface-offset,#f3f0ec)',
                borderRadius: 8, padding: 4, width: 'fit-content',
            }}>
                {views.map(v => (
                    <button
                        key={v.id}
                        onClick={() => setActiveView(v.id)}
                        style={{
                            padding: '6px 14px', borderRadius: 6,
                            border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                            background: activeView === v.id ? 'var(--color-surface,#f9f8f5)' : 'transparent',
                            color: activeView === v.id ? 'var(--color-primary,#01696f)' : 'var(--color-text-muted,#7a7974)',
                            boxShadow: activeView === v.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            transition: 'all 150ms ease',
                        }}
                    >{v.label}</button>
                ))}
            </div>

            {activeView === 'top-retailers'   && <TopRetailersTable />}
            {activeView === 'margin-supplier' && <MarginPerSupplierTable />}
            {activeView === 'margin-retailer' && <MarginPerRetailerTable />}
        </div>
    );
}

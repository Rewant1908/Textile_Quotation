import { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
function getToken() { return localStorage.getItem('kt_impex_token') || ''; }
function authHeaders() { return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }; }

// ─── Formatters ──────────────────────────────────────────────────────────────
function fmt(n, d = 0) {
    const v = parseFloat(n);
    if (isNaN(v)) return '—';
    return new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
}
function fmtRs(n) { const v = parseFloat(n); if (isNaN(v)) return '—'; return '₹' + fmt(v, 0); }
function fmtK(n) {
    const v = parseFloat(n);
    if (isNaN(v)) return '—';
    if (Math.abs(v) >= 10000000) return '₹' + fmt(v / 10000000, 2) + ' Cr';
    if (Math.abs(v) >= 100000)  return '₹' + fmt(v / 100000, 2) + ' L';
    if (Math.abs(v) >= 1000)    return '₹' + fmt(v / 1000, 1) + 'K';
    return '₹' + fmt(v, 0);
}
function marginColor(pct) {
    const p = parseFloat(pct);
    if (isNaN(p)) return 'var(--an-muted)';
    if (p >= 20) return '#437a22'; if (p >= 10) return '#006494';
    if (p >= 0)  return '#b07a00'; return '#a12c7b';
}
function marginBg(pct) {
    const p = parseFloat(pct);
    if (isNaN(p)) return 'transparent';
    if (p >= 20) return '#437a2218'; if (p >= 10) return '#00649418';
    if (p >= 0)  return '#b07a0018'; return '#a12c7b18';
}

// ─── Design tokens (scoped) ──────────────────────────────────────────────────
const STYLES = `
  .an-root {
    --an-bg:        #f7f6f2;
    --an-surface:   #ffffff;
    --an-surface2:  #f9f8f5;
    --an-border:    rgba(0,0,0,0.08);
    --an-divider:   rgba(0,0,0,0.06);
    --an-text:      #1a1916;
    --an-muted:     #6b6a67;
    --an-faint:     #b0afa9;
    --an-primary:   #01696f;
    --an-primary2:  #0c4e54;
    --an-green:     #437a22;
    --an-amber:     #b07a00;
    --an-orange:    #c55700;
    --an-red:       #a12c7b;
    --an-blue:      #006494;
    --an-shadow-sm: 0 1px 2px rgba(0,0,0,0.04), 0 1px 8px rgba(0,0,0,0.04);
    --an-shadow-md: 0 2px 4px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06);
    --an-r:    8px;
    --an-r-lg: 12px;
    font-family: -apple-system, 'Inter', 'Segoe UI', sans-serif;
    font-size: 13px;
    color: var(--an-text);
    background: var(--an-bg);
  }
  .an-root * { box-sizing: border-box; }
  .an-root table { border-collapse: collapse; width: 100%; }
  .an-root button { cursor: pointer; font: inherit; }

  /* Nav pill */
  .an-nav { display:flex; gap:2px; background:var(--an-surface2); border:1px solid var(--an-border); border-radius:10px; padding:3px; width:fit-content; flex-wrap:wrap; }
  .an-nav-btn { padding:6px 14px; border-radius:7px; border:none; background:transparent; color:var(--an-muted); font-size:12.5px; font-weight:500; transition:all 140ms ease; white-space:nowrap; }
  .an-nav-btn:hover { color:var(--an-text); background:rgba(0,0,0,0.04); }
  .an-nav-btn.active { background:var(--an-surface); color:var(--an-primary); font-weight:600;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.06); }

  /* Card */
  .an-card { background:var(--an-surface); border:1px solid var(--an-border); border-radius:var(--an-r-lg); overflow:hidden; box-shadow:var(--an-shadow-sm); }
  .an-card-header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px 12px; border-bottom:1px solid var(--an-divider); }
  .an-card-title { margin:0; font-size:14px; font-weight:650; color:var(--an-text); letter-spacing:-0.01em; }
  .an-card-sub { margin:2px 0 0; font-size:11.5px; color:var(--an-muted); }

  /* Table */
  .an-thead tr { background:var(--an-surface2); }
  .an-thead th { padding:8px 16px; font-size:10.5px; font-weight:650; letter-spacing:0.05em; color:var(--an-faint); text-transform:uppercase; text-align:right; white-space:nowrap; border-bottom:1px solid var(--an-divider); }
  .an-thead th:first-child { text-align:left; }
  .an-tbody tr { transition:background 100ms ease; }
  .an-tbody tr:hover { background:var(--an-surface2); }
  .an-td { padding:10px 16px; border-bottom:1px solid var(--an-divider); color:var(--an-text); white-space:nowrap; font-variant-numeric:tabular-nums; text-align:right; }
  .an-td:first-child { text-align:left; }
  .an-td.muted { color:var(--an-muted); }
  .an-tbody tr:last-child .an-td { border-bottom:none; }

  /* Rank chip */
  .an-rank { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:6px; font-size:11px; font-weight:700; background:var(--an-surface2); border:1px solid var(--an-border); color:var(--an-muted); }
  .an-rank.gold   { background:#fef3c7; border-color:#fbbf24; color:#92400e; }
  .an-rank.silver { background:#f1f5f9; border-color:#94a3b8; color:#475569; }
  .an-rank.bronze { background:#fef9f0; border-color:#d97706; color:#92400e; }

  /* Badge */
  .an-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:99px; font-size:11px; font-weight:600; letter-spacing:0.01em; }

  /* Margin pill in cell */
  .an-mpill { display:inline-block; padding:2px 7px; border-radius:5px; font-size:12px; font-weight:700; min-width:46px; text-align:right; }

  /* Revenue bar in cell */
  .an-revbar { display:flex; align-items:center; gap:8px; }
  .an-revbar-track { flex:1; height:4px; border-radius:99px; background:rgba(0,0,0,0.07); min-width:48px; max-width:80px; }
  .an-revbar-fill  { height:100%; border-radius:99px; background:var(--an-primary); }

  /* KPI strip */
  .an-kpi-strip { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); border-bottom:1px solid var(--an-divider); }
  .an-kpi-cell { padding:14px 20px; border-right:1px solid var(--an-divider); }
  .an-kpi-cell:last-child { border-right:none; }
  .an-kpi-label { font-size:10.5px; font-weight:650; color:var(--an-faint); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; }
  .an-kpi-val { font-size:20px; font-weight:750; letter-spacing:-0.02em; font-variant-numeric:tabular-nums; line-height:1; }

  /* Refresh btn */
  .an-refresh { display:inline-flex; align-items:center; gap:5px; padding:5px 10px; border-radius:6px; border:1px solid var(--an-border); background:var(--an-surface2); color:var(--an-muted); font-size:12px; font-weight:500; transition:all 120ms ease; }
  .an-refresh:hover { background:var(--an-surface); color:var(--an-text); box-shadow:var(--an-shadow-sm); }

  /* Skeleton */
  @keyframes an-shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
  .an-skel { background:linear-gradient(90deg,var(--an-surface2) 25%,rgba(0,0,0,0.05) 50%,var(--an-surface2) 75%); background-size:200% 100%; animation:an-shimmer 1.5s ease-in-out infinite; border-radius:4px; }

  /* Error / empty */
  .an-err   { padding:16px 20px; font-size:12.5px; color:var(--an-red); display:flex; align-items:center; gap:8px; }
  .an-empty { padding:40px 20px; text-align:center; color:var(--an-faint); font-size:13px; }
  .an-empty-icon { font-size:28px; margin-bottom:8px; }

  /* P&L chart */
  .an-chart-wrap { padding:20px; overflow-x:auto; }
  .an-chart-bars { display:flex; align-items:flex-end; gap:5px; height:180px; min-width:fit-content; }
  .an-bar-group { display:flex; align-items:flex-end; gap:2px; flex:1; min-width:32px; position:relative; }
  .an-bar { border-radius:3px 3px 0 0; transition:opacity 140ms ease; cursor:default; }
  .an-bar-group:hover .an-bar { opacity:0.8; }
  .an-bar-group.hov .an-bar { opacity:1; }
  .an-tooltip { position:absolute; bottom:calc(100% + 6px); left:50%; transform:translateX(-50%);
    background:var(--an-text); color:#fff; border-radius:7px; padding:8px 11px; font-size:11px;
    white-space:nowrap; z-index:20; box-shadow:0 4px 16px rgba(0,0,0,0.2); pointer-events:none; line-height:1.7; }
  .an-tooltip::after { content:''; position:absolute; top:100%; left:50%; transform:translateX(-50%);
    border:5px solid transparent; border-top-color:var(--an-text); }
  .an-chart-labels { display:flex; gap:5px; margin-top:6px; min-width:fit-content; }
  .an-bar-label { flex:1; min-width:32px; text-align:center; font-size:9.5px; color:var(--an-faint); }
  .an-yaxis { position:absolute; top:0; left:0; right:0; pointer-events:none; }

  /* Heatmap cards */
  .an-heat-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px; padding:20px; }
  .an-heat-card { border-radius:var(--an-r); padding:14px 16px; border:1px solid transparent; cursor:default;
    transition:transform 140ms ease, box-shadow 140ms ease; }
  .an-heat-card:hover { transform:translateY(-2px); box-shadow:var(--an-shadow-md); }
  .an-heat-loc { font-size:12px; font-weight:650; color:var(--an-text); margin-bottom:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .an-heat-val { font-size:22px; font-weight:800; letter-spacing:-0.02em; font-variant-numeric:tabular-nums; line-height:1.1; }
  .an-heat-meta { font-size:11px; color:var(--an-muted); margin-top:4px; }
  .an-heat-days { font-size:11px; margin-top:2px; font-weight:600; }
  .an-heat-bar-track { height:3px; border-radius:99px; background:rgba(0,0,0,0.1); margin-top:10px; }
  .an-heat-bar-fill  { height:100%; border-radius:99px; transition:width 500ms cubic-bezier(0.16,1,0.3,1); }

  /* Aging stacked bar */
  .an-aging-bar { display:flex; height:6px; border-radius:99px; overflow:hidden; width:80px; }
  .an-aging-seg { transition:flex 400ms ease; }

  /* Mobile */
  @media(max-width:640px) {
    .an-nav { width:100%; }
    .an-nav-btn { flex:1 1 calc(50% - 4px); text-align:center; }
    .an-kpi-strip { grid-template-columns:1fr 1fr; }
    .an-kpi-cell:nth-child(even) { border-right:none; }
    .an-heat-grid { grid-template-columns:1fr 1fr; }
    .an-revbar-track { display:none; }
    .an-chart-wrap { padding:12px; }
  }
`;

// ─── Primitives ──────────────────────────────────────────────────────────────
function Badge({ label, color }) {
    return (
        <span className="an-badge" style={{ background: color + '18', color, border: `1px solid ${color}30` }}>
            {label}
        </span>
    );
}
function PaymentBadge({ p }) {
    const MAP = { immediate: '#437a22', net_15: '#006494', net_30: '#b07a00', net_60: '#c55700', credit: '#a12c7b' };
    return <Badge label={(p || '—').replace('_', ' ')} color={MAP[p] || '#6b6a67'} />;
}
function MarginPill({ pct }) {
    const c = marginColor(pct); const bg = marginBg(pct);
    return <span className="an-mpill" style={{ color: c, background: bg }}>{fmt(pct, 1)}%</span>;
}
function RankChip({ n }) {
    const cls = n === 1 ? 'gold' : n === 2 ? 'silver' : n === 3 ? 'bronze' : '';
    return <span className={`an-rank ${cls}`}>{n}</span>;
}
function RefreshBtn({ onClick, loading }) {
    return (
        <button className="an-refresh" onClick={onClick} disabled={loading}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ transform: loading ? 'rotate(360deg)' : 'none', transition: loading ? 'transform 0.6s linear' : 'none' }}>
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
            </svg>
            Refresh
        </button>
    );
}
function ErrMsg({ msg, onRetry }) {
    return (
        <div className="an-err">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {msg}
            <button onClick={onRetry} style={{ marginLeft:4, color:'inherit', textDecoration:'underline', background:'none', border:'none', padding:0 }}>Retry</button>
        </div>
    );
}
function Empty({ icon = '📭', msg }) {
    return <div className="an-empty"><div className="an-empty-icon">{icon}</div><div>{msg}</div></div>;
}
function SkeletonRows({ cols, rows = 5 }) {
    return Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
            {Array.from({ length: cols }).map((__, j) => (
                <td key={j} className="an-td">
                    <div className="an-skel" style={{ height: 13, width: j === 0 ? '75%' : '55%', borderRadius: 4 }} />
                </td>
            ))}
        </tr>
    ));
}
function Card({ title, subtitle, action, children }) {
    return (
        <div className="an-card" style={{ marginBottom: 20 }}>
            <div className="an-card-header">
                <div>
                    <h3 className="an-card-title">{title}</h3>
                    {subtitle && <p className="an-card-sub">{subtitle}</p>}
                </div>
                {action}
            </div>
            {children}
        </div>
    );
}
function DataTable({ headers, children }) {
    return (
        <div style={{ overflowX: 'auto' }}>
            <table>
                <thead className="an-thead">
                    <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
                </thead>
                <tbody className="an-tbody">{children}</tbody>
            </table>
        </div>
    );
}
function Td({ children, muted, colSpan }) {
    return <td className={`an-td${muted ? ' muted' : ''}`} colSpan={colSpan}>{children}</td>;
}

// ─── Hook: fetch ─────────────────────────────────────────────────────────────
function useFetch(endpoint) {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const r = await fetch(`${API}${endpoint}`, { headers: authHeaders() });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const json = await r.json();
            setData(Array.isArray(json) ? json : json);
        } catch (e) { setError(e.message); } finally { setLoading(false); }
    }, [endpoint]);
    useEffect(() => { load(); }, [load]);
    return { data, loading, error, reload: load };
}

// ─── Revenue spark bar ────────────────────────────────────────────────────────
function RevBar({ val, max }) {
    const pct = max > 0 ? Math.round((val / max) * 100) : 0;
    return (
        <div className="an-revbar">
            <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtK(val)}</span>
            <div className="an-revbar-track"><div className="an-revbar-fill" style={{ width: pct + '%' }} /></div>
        </div>
    );
}

// ─── TOP RETAILERS ───────────────────────────────────────────────────────────
function TopRetailersTable() {
    const { data: rows, loading, error, reload } = useFetch('/api/analytics/top-retailers');
    const maxRev = Math.max(...rows.map(r => parseFloat(r.revenue) || 0), 1);
    const H = ['Rank', 'Retailer', 'Location', 'Terms', 'Orders', 'Meters', 'Revenue', 'Margin %', 'Outstanding'];
    return (
        <Card
            title="Top Retailers by Revenue"
            subtitle="All-time · top 10 ranked by total revenue"
            action={<RefreshBtn onClick={reload} loading={loading} />}
        >
            {error && <ErrMsg msg={error} onRetry={reload} />}
            <DataTable headers={H}>
                {loading ? <SkeletonRows cols={H.length} />
                : rows.length === 0 ? <tr><td colSpan={H.length}><Empty icon="🏪" msg="No sales data yet. Record a transaction to see rankings." /></td></tr>
                : rows.map((r, i) => (
                    <tr key={r.retailer_id}>
                        <Td><RankChip n={i + 1} /></Td>
                        <Td>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{r.shop_name}</div>
                        </Td>
                        <Td muted>{r.market_location || '—'}</Td>
                        <Td><PaymentBadge p={r.payment_pattern} /></Td>
                        <Td muted>{fmt(r.order_count)}</Td>
                        <Td muted>{fmt(r.meters_bought)} m</Td>
                        <Td><RevBar val={parseFloat(r.revenue) || 0} max={maxRev} /></Td>
                        <Td><MarginPill pct={r.margin_pct} /></Td>
                        <Td>
                            <span style={{ fontWeight: 600, color: parseFloat(r.outstanding_balance) > 0 ? 'var(--an-orange)' : 'var(--an-green)' }}>
                                {fmtRs(r.outstanding_balance)}
                            </span>
                        </Td>
                    </tr>
                ))}
            </DataTable>
        </Card>
    );
}

// ─── MARGIN / SUPPLIER ────────────────────────────────────────────────────────
function MarginPerSupplierTable() {
    const { data: rows, loading, error, reload } = useFetch('/api/analytics/margin-per-supplier');
    const H = ['Supplier', 'Quality', 'Bales', 'Thans', 'Meters', 'Margin ₹', '₹ / m', 'Cap Eff.', 'Delays'];
    function stars(r) { const n = Math.round(parseFloat(r) || 0); return '★'.repeat(n) + '☆'.repeat(5 - n); }
    const delayMap = { never: '#437a22', rarely: '#006494', sometimes: '#b07a00', often: '#c55700', always: '#a12c7b' };
    return (
        <Card title="Margin per Supplier" subtitle="Realized margin · ₹/meter efficiency · capital utilisation"
            action={<RefreshBtn onClick={reload} loading={loading} />}>
            {error && <ErrMsg msg={error} onRetry={reload} />}
            <DataTable headers={H}>
                {loading ? <SkeletonRows cols={H.length} />
                : rows.length === 0 ? <tr><td colSpan={H.length}><Empty icon="🏭" msg="No supplier data yet." /></td></tr>
                : rows.map((s, i) => (
                    <tr key={s.supplier_id}>
                        <Td><span style={{ fontWeight: 600 }}>{s.supplier_name}</span></Td>
                        <Td><span style={{ color: '#b07a00', letterSpacing: 1, fontSize: 12 }} title={`${s.quality_rating}/5`}>{stars(s.quality_rating)}</span></Td>
                        <Td muted>{fmt(s.bales_received)}</Td>
                        <Td muted>{fmt(s.thans_created)}</Td>
                        <Td muted>{fmt(s.meters_sold)} m</Td>
                        <Td><span style={{ fontWeight: 700 }}>{fmtK(s.realized_margin)}</span></Td>
                        <Td><MarginPill pct={parseFloat(s.margin_per_meter) * 5} /></Td>
                        <Td><MarginPill pct={s.capital_efficiency_pct} /></Td>
                        <Td><Badge label={s.delay_frequency || '—'} color={delayMap[s.delay_frequency] || '#6b6a67'} /></Td>
                    </tr>
                ))}
            </DataTable>
        </Card>
    );
}

// ─── MARGIN / RETAILER ────────────────────────────────────────────────────────
function MarginPerRetailerTable() {
    const { data: rows, loading, error, reload } = useFetch('/api/analytics/margin-per-retailer');
    const maxMargin = Math.max(...rows.map(r => parseFloat(r.total_margin) || 0), 1);
    const H = ['Retailer', 'Location', 'Terms', 'Orders', 'Revenue', 'Margin ₹', 'Margin %', 'Avg / Order', 'Outstanding'];
    return (
        <Card title="Margin per Retailer" subtitle="Credit risk & profitability · top 15 by margin"
            action={<RefreshBtn onClick={reload} loading={loading} />}>
            {error && <ErrMsg msg={error} onRetry={reload} />}
            <DataTable headers={H}>
                {loading ? <SkeletonRows cols={H.length} />
                : rows.length === 0 ? <tr><td colSpan={H.length}><Empty icon="📊" msg="No transaction data yet." /></td></tr>
                : rows.map((r, i) => (
                    <tr key={r.retailer_id}>
                        <Td><span style={{ fontWeight: 600 }}>{r.shop_name}</span></Td>
                        <Td muted>{r.market_location || '—'}</Td>
                        <Td><PaymentBadge p={r.payment_pattern} /></Td>
                        <Td muted>{fmt(r.order_count)}</Td>
                        <Td muted>{fmtRs(r.revenue)}</Td>
                        <Td><RevBar val={parseFloat(r.total_margin) || 0} max={maxMargin} /></Td>
                        <Td><MarginPill pct={r.margin_pct} /></Td>
                        <Td muted>{fmtRs(r.avg_margin_per_order)}</Td>
                        <Td>
                            <span style={{ fontWeight: 600, color: parseFloat(r.outstanding_balance) > 0 ? 'var(--an-orange)' : 'var(--an-green)' }}>
                                {fmtRs(r.outstanding_balance)}
                            </span>
                        </Td>
                    </tr>
                ))}
            </DataTable>
        </Card>
    );
}

// ─── PAYMENT AGING ────────────────────────────────────────────────────────────
function PaymentAgingTable() {
    const { data: rows, loading, error, reload } = useFetch('/api/analytics/payment-aging');
    const H = ['Retailer', 'Location', 'Terms', '0–30 days', '31–60 days', '60+ days', 'Aging Split', 'Outstanding', 'Unpaid', 'Last Sale'];

    const t0   = rows.reduce((s, r) => s + parseFloat(r.bucket_0_30   || 0), 0);
    const t31  = rows.reduce((s, r) => s + parseFloat(r.bucket_31_60  || 0), 0);
    const t60  = rows.reduce((s, r) => s + parseFloat(r.bucket_60_plus || 0), 0);
    const tOB  = rows.reduce((s, r) => s + parseFloat(r.outstanding_balance || 0), 0);
    const tTxn = rows.reduce((s, r) => s + parseInt(r.unpaid_count || 0), 0);

    return (
        <Card title="Retailer Payment Aging"
            subtitle="Unpaid & partial transactions bucketed by days outstanding"
            action={<RefreshBtn onClick={reload} loading={loading} />}>
            {error && <ErrMsg msg={error} onRetry={reload} />}

            {/* KPI strip */}
            {!loading && rows.length > 0 && (
                <div className="an-kpi-strip">
                    {[['0–30 days', t0, 'var(--an-green)'],
                      ['31–60 days', t31, 'var(--an-orange)'],
                      ['60+ days', t60, 'var(--an-red)'],
                      ['Total Outstanding', tOB, 'var(--an-text)'],
                      ['Unpaid Transactions', tTxn, 'var(--an-blue)', true]
                    ].map(([label, val, color, isCount]) => (
                        <div className="an-kpi-cell" key={label}>
                            <div className="an-kpi-label">{label}</div>
                            <div className="an-kpi-val" style={{ color }}>{isCount ? val : fmtK(val)}</div>
                        </div>
                    ))}
                </div>
            )}

            <DataTable headers={H}>
                {loading ? <SkeletonRows cols={H.length} />
                : rows.length === 0 ? <tr><td colSpan={H.length}><Empty icon="✅" msg="All retailers are fully paid up." /></td></tr>
                : rows.map((r, i) => {
                    const b0  = parseFloat(r.bucket_0_30   || 0);
                    const b31 = parseFloat(r.bucket_31_60  || 0);
                    const b60 = parseFloat(r.bucket_60_plus || 0);
                    const tot = b0 + b31 + b60 || 1;
                    const isOverdue = b60 > 0;
                    return (
                        <tr key={r.retailer_id}>
                            <Td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontWeight: 600 }}>{r.shop_name}</span>
                                    {isOverdue && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--an-red)', background: 'var(--an-red)18', border: '1px solid var(--an-red)30', borderRadius: 4, padding: '1px 5px' }}>OVERDUE</span>}
                                </div>
                            </Td>
                            <Td muted>{r.market_location || '—'}</Td>
                            <Td><PaymentBadge p={r.payment_pattern} /></Td>
                            <Td><span style={{ color: b0 > 0 ? 'var(--an-green)' : 'var(--an-faint)', fontWeight: b0 > 0 ? 600 : 400 }}>{b0 > 0 ? fmtRs(b0) : '—'}</span></Td>
                            <Td><span style={{ color: b31 > 0 ? 'var(--an-orange)' : 'var(--an-faint)', fontWeight: b31 > 0 ? 600 : 400 }}>{b31 > 0 ? fmtRs(b31) : '—'}</span></Td>
                            <Td><span style={{ color: b60 > 0 ? 'var(--an-red)' : 'var(--an-faint)', fontWeight: b60 > 0 ? 700 : 400 }}>{b60 > 0 ? fmtRs(b60) : '—'}</span></Td>
                            <Td>
                                <div className="an-aging-bar">
                                    {b0  > 0 && <div className="an-aging-seg" style={{ flex: b0/tot,  background: 'var(--an-green)' }} />}
                                    {b31 > 0 && <div className="an-aging-seg" style={{ flex: b31/tot, background: 'var(--an-orange)' }} />}
                                    {b60 > 0 && <div className="an-aging-seg" style={{ flex: b60/tot, background: 'var(--an-red)' }} />}
                                </div>
                            </Td>
                            <Td><span style={{ fontWeight: 700, color: 'var(--an-orange)' }}>{fmtRs(r.outstanding_balance)}</span></Td>
                            <Td>
                                <span style={{ background: 'var(--an-red)18', color: 'var(--an-red)', borderRadius: 99, padding: '2px 8px', fontWeight: 700, fontSize: 12 }}>{r.unpaid_count}</span>
                            </Td>
                            <Td muted>{r.last_transaction ? new Date(r.last_transaction).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}</Td>
                        </tr>
                    );
                })}
            </DataTable>
        </Card>
    );
}

// ─── MONTHLY P&L CHART ────────────────────────────────────────────────────────
function MonthlyPnLChart() {
    const { data: rows, loading, error, reload } = useFetch('/api/analytics/monthly-pnl');
    const [hov, setHov] = useState(null);
    const BAR_H = 180;
    const maxVal = Math.max(...rows.map(r => parseFloat(r.revenue) || 0), 1);

    const totalRev    = rows.reduce((s, r) => s + parseFloat(r.revenue       || 0), 0);
    const totalProfit = rows.reduce((s, r) => s + parseFloat(r.gross_profit  || 0), 0);
    const avgMargin   = rows.length ? rows.reduce((s, r) => s + parseFloat(r.margin_pct || 0), 0) / rows.length : 0;
    const totalTxns   = rows.reduce((s, r) => s + parseInt(r.transactions    || 0), 0);

    return (
        <Card title="Monthly P&L" subtitle="Last 12 months · revenue vs gross profit"
            action={<RefreshBtn onClick={reload} loading={loading} />}>
            {error && <ErrMsg msg={error} onRetry={reload} />}

            {/* KPI strip */}
            {!loading && rows.length > 0 && (
                <div className="an-kpi-strip">
                    {[['Total Revenue', fmtK(totalRev), 'var(--an-primary)'],
                      ['Gross Profit',  fmtK(totalProfit), 'var(--an-green)'],
                      ['Avg Margin',    fmt(avgMargin, 1) + '%', 'var(--an-blue)'],
                      ['Transactions',  totalTxns, 'var(--an-text)']
                    ].map(([label, val, color]) => (
                        <div className="an-kpi-cell" key={label}>
                            <div className="an-kpi-label">{label}</div>
                            <div className="an-kpi-val" style={{ color }}>{val}</div>
                        </div>
                    ))}
                </div>
            )}

            {loading ? (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: BAR_H + 32, padding: '20px 20px 0' }}>
                    {Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} className="an-skel" style={{ flex: 1, height: `${50 + i * 12}px`, borderRadius: '3px 3px 0 0' }} />
                    ))}
                </div>
            ) : rows.length === 0 ? <Empty icon="📈" msg="No transaction data yet." />
            : (
                <>
                    {/* Legend */}
                    <div style={{ display: 'flex', gap: 16, padding: '14px 20px 0', fontSize: 12, color: 'var(--an-muted)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--an-primary)', display: 'inline-block' }} />Revenue
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--an-green)', display: 'inline-block' }} />Gross Profit
                        </span>
                    </div>
                    <div className="an-chart-wrap">
                        {/* Y-axis grid lines */}
                        <div style={{ position: 'relative' }}>
                            {[0, 25, 50, 75, 100].map(pct => (
                                <div key={pct} style={{ position: 'absolute', bottom: `${pct / 100 * BAR_H}px`, left: 0, right: 0, borderTop: '1px dashed rgba(0,0,0,0.06)', pointerEvents: 'none' }} />
                            ))}
                            <div className="an-chart-bars">
                                {rows.map((r, i) => {
                                    const rev  = parseFloat(r.revenue)      || 0;
                                    const prof = parseFloat(r.gross_profit) || 0;
                                    const rH   = Math.max(Math.round(rev  / maxVal * BAR_H), 2);
                                    const pH   = Math.max(Math.round(prof / maxVal * BAR_H), 2);
                                    const lbl  = r.month ? new Date(r.month + '-01').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : r.month;
                                    const isH  = hov === i;
                                    return (
                                        <div key={i}
                                            className={`an-bar-group${isH ? ' hov' : ''}`}
                                            onMouseEnter={() => setHov(i)}
                                            onMouseLeave={() => setHov(null)}
                                        >
                                            {isH && (
                                                <div className="an-tooltip">
                                                    <div style={{ fontWeight: 700, marginBottom: 2 }}>{lbl}</div>
                                                    <div>Revenue: <strong>{fmtK(rev)}</strong></div>
                                                    <div>Profit: <strong style={{ color: '#6ee7b7' }}>{fmtK(prof)}</strong></div>
                                                    <div>Margin: <strong>{fmt(r.margin_pct, 1)}%</strong></div>
                                                    <div style={{ color: 'rgba(255,255,255,0.6)' }}>Txns: {r.transactions}</div>
                                                </div>
                                            )}
                                            <div className="an-bar" style={{ flex: 1, height: rH, background: isH ? 'var(--an-primary2)' : 'var(--an-primary)' }} />
                                            <div className="an-bar" style={{ flex: 1, height: pH, background: isH ? '#2e5c10' : 'var(--an-green)' }} />
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="an-chart-labels">
                                {rows.map((r, i) => {
                                    const lbl = r.month ? new Date(r.month + '-01').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : '';
                                    return <div key={i} className="an-bar-label">{lbl}</div>;
                                })}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </Card>
    );
}

// ─── DEAD STOCK HEATMAP ───────────────────────────────────────────────────────
function DeadStockHeatmap() {
    const { data: rows, loading, error, reload } = useFetch('/api/analytics/dead-stock-by-location');
    const maxCap  = Math.max(...rows.map(r => parseFloat(r.locked_capital) || 0), 1);
    const totalCap = rows.reduce((s, r) => s + parseFloat(r.locked_capital || 0), 0);

    function heatBg(pct) {
        if (pct < 0.2) return { bg: '#edf7e9', border: '#437a2230', text: '#437a22' };
        if (pct < 0.4) return { bg: '#fef9ec', border: '#b07a0030', text: '#b07a00' };
        if (pct < 0.6) return { bg: '#fff4ec', border: '#c5570030', text: '#c55700' };
        if (pct < 0.8) return { bg: '#fdf0f6', border: '#a12c7b30', text: '#a12c7b' };
        return { bg: '#fce8f3', border: '#a12c7b50', text: '#a12c7b' };
    }

    return (
        <Card title="Dead Stock Heatmap by Warehouse"
            subtitle="Slow-moving & dead inventory · locked capital per location"
            action={<RefreshBtn onClick={reload} loading={loading} />}>
            {error && <ErrMsg msg={error} onRetry={reload} />}

            {!loading && rows.length > 0 && (
                <div className="an-kpi-strip">
                    <div className="an-kpi-cell">
                        <div className="an-kpi-label">Locked Capital</div>
                        <div className="an-kpi-val" style={{ color: 'var(--an-red)' }}>{fmtK(totalCap)}</div>
                    </div>
                    <div className="an-kpi-cell">
                        <div className="an-kpi-label">Locations</div>
                        <div className="an-kpi-val" style={{ color: 'var(--an-text)' }}>{rows.length}</div>
                    </div>
                    <div className="an-kpi-cell">
                        <div className="an-kpi-label">Total Thans</div>
                        <div className="an-kpi-val" style={{ color: 'var(--an-text)' }}>{rows.reduce((s, r) => s + parseInt(r.than_count || 0), 0)}</div>
                    </div>
                    <div className="an-kpi-cell">
                        <div className="an-kpi-label">Total Meters</div>
                        <div className="an-kpi-val" style={{ color: 'var(--an-text)' }}>{fmt(rows.reduce((s, r) => s + parseFloat(r.total_meters || 0), 0))} m</div>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="an-heat-grid">
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="an-skel" style={{ height: 110, borderRadius: 8 }} />)}
                </div>
            ) : rows.length === 0 ? <Empty icon="✅" msg="No slow or dead stock found. All inventory is moving well." />
            : (
                <div className="an-heat-grid">
                    {rows.map(r => {
                        const cap  = parseFloat(r.locked_capital) || 0;
                        const pct  = cap / maxCap;
                        const days = Math.round(parseFloat(r.avg_idle_days) || 0);
                        const { bg, border, text } = heatBg(pct);
                        return (
                            <div key={r.location} className="an-heat-card"
                                style={{ background: bg, borderColor: border }}>
                                <div className="an-heat-loc" title={r.location}>
                                    <svg style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5, opacity: 0.5 }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                                    {r.location}
                                </div>
                                <div className="an-heat-val" style={{ color: text }}>{fmtK(cap)}</div>
                                <div className="an-heat-meta">{fmt(r.than_count)} thans · {fmt(r.total_meters)} m</div>
                                <div className="an-heat-days" style={{ color: days > 60 ? 'var(--an-red)' : days > 30 ? 'var(--an-orange)' : 'var(--an-muted)' }}>
                                    Idle ~{days} days
                                </div>
                                <div className="an-heat-bar-track">
                                    <div className="an-heat-bar-fill" style={{ width: Math.round(pct * 100) + '%', background: text }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
const VIEWS = [
    { id: 'top-retailers',   label: 'Top Retailers',    icon: '🏆' },
    { id: 'margin-supplier', label: 'By Supplier',      icon: '🏭' },
    { id: 'margin-retailer', label: 'By Retailer',      icon: '🏪' },
    { id: 'payment-aging',   label: 'Payment Aging',    icon: '⏱' },
    { id: 'monthly-pnl',     label: 'Monthly P&L',      icon: '📈' },
    { id: 'dead-stock',      label: 'Dead Stock',        icon: '📦' },
];

export default function AnalyticsDashboard({ user }) {
    const [view, setView] = useState('top-retailers');
    const now = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    return (
        <div className="an-root" style={{ padding: '20px 24px', minHeight: '100%' }}>
            <style>{STYLES}</style>

            {/* Page header */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 750, letterSpacing: '-0.025em', color: 'var(--an-text)' }}>Analytics</h2>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--an-muted)' }}>Revenue intelligence · margin analysis · payment aging · dead stock</p>
                </div>
                <div style={{ fontSize: 11, color: 'var(--an-faint)', fontWeight: 500 }}>{now}</div>
            </div>

            {/* Tab nav */}
            <div className="an-nav" style={{ marginBottom: 20 }}>
                {VIEWS.map(v => (
                    <button key={v.id} className={`an-nav-btn${view === v.id ? ' active' : ''}`} onClick={() => setView(v.id)}>
                        <span style={{ marginRight: 5 }}>{v.icon}</span>{v.label}
                    </button>
                ))}
            </div>

            {/* Views */}
            {view === 'top-retailers'   && <TopRetailersTable />}
            {view === 'margin-supplier' && <MarginPerSupplierTable />}
            {view === 'margin-retailer' && <MarginPerRetailerTable />}
            {view === 'payment-aging'   && <PaymentAgingTable />}
            {view === 'monthly-pnl'     && <MonthlyPnLChart />}
            {view === 'dead-stock'      && <DeadStockHeatmap />}
        </div>
    );
}

import { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function getToken() { return localStorage.getItem('kt_impex_token') || ''; }
function authHeaders() { return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }; }

// ── Helpers ──────────────────────────────────────────────────────────────────────
function fmt(n, d = 0) {
    const num = parseFloat(n);
    if (isNaN(num)) return '—';
    return new Intl.NumberFormat('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(num);
}
function fmtRs(n) {
    const num = parseFloat(n);
    if (isNaN(num)) return '—';
    return '₹' + fmt(num, 0);
}
function fmtK(n) {
    const num = parseFloat(n);
    if (isNaN(num)) return '—';
    if (Math.abs(num) >= 100000) return '₹' + fmt(num / 100000, 1) + 'L';
    if (Math.abs(num) >= 1000)   return '₹' + fmt(num / 1000, 1) + 'K';
    return '₹' + fmt(num, 0);
}
function marginColor(pct) {
    const p = parseFloat(pct);
    if (isNaN(p)) return '#7a7974';
    if (p >= 20) return '#437a22'; if (p >= 10) return '#006494';
    if (p >= 0)  return '#d19900'; return '#a12c7b';
}
function badge(label, color) {
    return <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:600, background:color+'22', color, border:`1px solid ${color}44` }}>{label}</span>;
}
function paymentBadge(p) {
    const map = { immediate:'#437a22', net_15:'#006494', net_30:'#d19900', net_60:'#da7101', credit:'#a12c7b' };
    return badge(p?.replace('_',' ') || '—', map[p] || '#7a7974');
}
function agingColor(bucket) {
    if (bucket === '0-30')  return '#437a22';
    if (bucket === '31-60') return '#da7101';
    return '#a12c7b';
}

// ── Skeleton ────────────────────────────────────────────────────────────────────
function SkeletonRows({ cols, rows = 5 }) {
    return Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>{Array.from({ length: cols }).map((__, j) => (
            <td key={j}><div style={{ height:14, borderRadius:4, background:'linear-gradient(90deg,var(--color-surface-offset,#f0eeea) 25%,var(--color-surface-dynamic,#e6e4df) 50%,var(--color-surface-offset,#f0eeea) 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s ease-in-out infinite', width: j===0?'80%':'60%' }} /></td>
        ))}</tr>
    ));
}

// ── Section ────────────────────────────────────────────────────────────────────
function Section({ title, subtitle, children, action }) {
    return (
        <div style={{ background:'var(--color-surface,#f9f8f5)', border:'1px solid var(--color-border,#d4d1ca)', borderRadius:10, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)', marginBottom:'1.5rem' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'1rem 1.25rem 0.75rem', borderBottom:'1px solid var(--color-divider,#dcd9d5)' }}>
                <div>
                    <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'var(--color-text,#28251d)' }}>{title}</h3>
                    {subtitle && <p style={{ margin:'2px 0 0', fontSize:12, color:'var(--color-text-muted,#7a7974)' }}>{subtitle}</p>}
                </div>
                {action}
            </div>
            <div style={{ overflowX:'auto' }}>{children}</div>
        </div>
    );
}

// ── Table ────────────────────────────────────────────────────────────────────────
function DataTable({ headers, children }) {
    return (
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
                <tr style={{ background:'var(--color-surface-offset,#f3f0ec)' }}>
                    {headers.map((h, i) => (
                        <th key={i} style={{ padding:'8px 12px', textAlign: i===0?'left':'right', fontWeight:600, fontSize:11, letterSpacing:'0.04em', color:'var(--color-text-muted,#7a7974)', textTransform:'uppercase', whiteSpace:'nowrap', borderBottom:'1px solid var(--color-divider,#dcd9d5)' }}>{h}</th>
                    ))}
                </tr>
            </thead>
            <tbody>{children}</tbody>
        </table>
    );
}
function Td({ children, right, muted, center }) {
    return (
        <td style={{ padding:'9px 12px', textAlign: center?'center':right?'right':'left', color: muted?'var(--color-text-muted,#7a7974)':'var(--color-text,#28251d)', borderBottom:'1px solid var(--color-divider,#dcd9d5)', whiteSpace:'nowrap', fontVariantNumeric: right?'tabular-nums':'normal' }}>{children}</td>
    );
}

function RefreshBtn({ onClick }) {
    return <button onClick={onClick} title="Refresh" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-primary,#01696f)', fontSize:18, lineHeight:1, padding:'2px 4px' }}>↻</button>;
}
function ErrMsg({ msg, onRetry }) {
    return <div style={{ padding:'1rem', color:'#a12c7b', fontSize:13 }}>Error: {msg} <button onClick={onRetry} style={{ marginLeft:8, color:'inherit', textDecoration:'underline', background:'none', border:'none', cursor:'pointer' }}>Retry</button></div>;
}
function Empty({ cols, msg }) {
    return <tr><td colSpan={cols} style={{ padding:'2rem', textAlign:'center', color:'var(--color-text-muted,#7a7974)', fontSize:13 }}>{msg}</td></tr>;
}

// ── Top Retailers ──────────────────────────────────────────────────────────────
function TopRetailersTable() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const r = await fetch(`${API}/api/analytics/top-retailers`, { headers: authHeaders() });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            setRows(await r.json());
        } catch (e) { setError(e.message); } finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);
    const H = ['#','Shop','Location','Payment','Orders','Meters','Revenue','Margin','Margin %','Outstanding'];
    return (
        <Section title="Top Retailers by Revenue" subtitle="All-time, ranked by total revenue · top 10" action={<RefreshBtn onClick={load}/>}>
            {error && <ErrMsg msg={error} onRetry={load}/>}
            <DataTable headers={H}>
                {loading ? <SkeletonRows cols={H.length}/>
                : rows.length===0 ? <Empty cols={H.length} msg="No sales data yet."/>
                : rows.map((r,i) => (
                    <tr key={r.retailer_id} style={{ background: i%2===0?'transparent':'var(--color-surface-offset,#f3f0ec)22' }}>
                        <Td muted>{i+1}</Td>
                        <Td><strong>{r.shop_name}</strong></Td>
                        <Td muted>{r.market_location||'—'}</Td>
                        <Td>{paymentBadge(r.payment_pattern)}</Td>
                        <Td right>{fmt(r.order_count)}</Td>
                        <Td right>{fmt(r.meters_bought)} m</Td>
                        <Td right><strong>{fmtRs(r.revenue)}</strong></Td>
                        <Td right>{fmtRs(r.margin)}</Td>
                        <Td right><span style={{ color:marginColor(r.margin_pct), fontWeight:600 }}>{fmt(r.margin_pct,1)}%</span></Td>
                        <Td right><span style={{ color:parseFloat(r.outstanding_balance)>0?'#da7101':'#437a22', fontWeight:600 }}>{fmtRs(r.outstanding_balance)}</span></Td>
                    </tr>
                ))}
            </DataTable>
        </Section>
    );
}

// ── Margin per Supplier ───────────────────────────────────────────────────────
function MarginPerSupplierTable() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const r = await fetch(`${API}/api/analytics/margin-per-supplier`, { headers: authHeaders() });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            setRows(await r.json());
        } catch (e) { setError(e.message); } finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);
    const H = ['Supplier','Quality','Bales','Thans','Meters Sold','Margin ₹','₹/Meter','Capital Eff.','Delays'];
    function stars(r) { const n=Math.round(parseFloat(r)||0); return '★'.repeat(n)+'☆'.repeat(5-n); }
    function delayBadge(f) {
        const m={never:'#437a22',rarely:'#006494',sometimes:'#d19900',often:'#da7101',always:'#a12c7b'};
        return badge(f||'—', m[f]||'#7a7974');
    }
    return (
        <Section title="Margin per Supplier" subtitle="Realized margin, ₹/meter efficiency, and capital utilisation" action={<RefreshBtn onClick={load}/>}>
            {error && <ErrMsg msg={error} onRetry={load}/>}
            <DataTable headers={H}>
                {loading ? <SkeletonRows cols={H.length}/>
                : rows.length===0 ? <Empty cols={H.length} msg="No supplier transaction data yet."/>
                : rows.map((s,i) => (
                    <tr key={s.supplier_id} style={{ background: i%2===0?'transparent':'var(--color-surface-offset,#f3f0ec)22' }}>
                        <Td><strong>{s.supplier_name}</strong></Td>
                        <Td><span style={{ color:'#d19900', letterSpacing:1 }} title={`${s.quality_rating}/5`}>{stars(s.quality_rating)}</span></Td>
                        <Td right muted>{fmt(s.bales_received)}</Td>
                        <Td right muted>{fmt(s.thans_created)}</Td>
                        <Td right>{fmt(s.meters_sold)} m</Td>
                        <Td right><strong>{fmtRs(s.realized_margin)}</strong></Td>
                        <Td right><span style={{ color:marginColor(parseFloat(s.margin_per_meter)*5), fontWeight:600 }}>{fmtRs(s.margin_per_meter)}</span></Td>
                        <Td right><span style={{ color:marginColor(s.capital_efficiency_pct), fontWeight:600 }}>{fmt(s.capital_efficiency_pct,1)}%</span></Td>
                        <Td>{delayBadge(s.delay_frequency)}</Td>
                    </tr>
                ))}
            </DataTable>
        </Section>
    );
}

// ── Margin per Retailer ───────────────────────────────────────────────────────
function MarginPerRetailerTable() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const r = await fetch(`${API}/api/analytics/margin-per-retailer`, { headers: authHeaders() });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            setRows(await r.json());
        } catch (e) { setError(e.message); } finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);
    const H = ['Shop','Location','Payment','Orders','Revenue','Total Margin','Margin %','Avg/Order','Outstanding'];
    return (
        <Section title="Margin per Retailer" subtitle="Credit risk & margin breakdown · top 15 by margin" action={<RefreshBtn onClick={load}/>}>
            {error && <ErrMsg msg={error} onRetry={load}/>}
            <DataTable headers={H}>
                {loading ? <SkeletonRows cols={H.length}/>
                : rows.length===0 ? <Empty cols={H.length} msg="No transaction data yet."/>
                : rows.map((r,i) => (
                    <tr key={r.retailer_id} style={{ background: i%2===0?'transparent':'var(--color-surface-offset,#f3f0ec)22' }}>
                        <Td><strong>{r.shop_name}</strong></Td>
                        <Td muted>{r.market_location||'—'}</Td>
                        <Td>{paymentBadge(r.payment_pattern)}</Td>
                        <Td right muted>{fmt(r.order_count)}</Td>
                        <Td right>{fmtRs(r.revenue)}</Td>
                        <Td right><strong>{fmtRs(r.total_margin)}</strong></Td>
                        <Td right><span style={{ color:marginColor(r.margin_pct), fontWeight:600 }}>{fmt(r.margin_pct,1)}%</span></Td>
                        <Td right muted>{fmtRs(r.avg_margin_per_order)}</Td>
                        <Td right><span style={{ color:parseFloat(r.outstanding_balance)>0?'#da7101':'#437a22', fontWeight:600 }}>{fmtRs(r.outstanding_balance)}</span></Td>
                    </tr>
                ))}
            </DataTable>
        </Section>
    );
}

// ── Payment Aging Table ────────────────────────────────────────────────────────
function PaymentAgingTable() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const r = await fetch(`${API}/api/analytics/payment-aging`, { headers: authHeaders() });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            setRows(await r.json());
        } catch (e) { setError(e.message); } finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const H = ['Shop','Location','Payment','0–30 days','31–60 days','60+ days','Outstanding','Unpaid Txns','Last Sale'];

    // Summary totals
    const total0_30   = rows.reduce((s,r) => s + parseFloat(r.bucket_0_30  ||0), 0);
    const total31_60  = rows.reduce((s,r) => s + parseFloat(r.bucket_31_60 ||0), 0);
    const total60plus = rows.reduce((s,r) => s + parseFloat(r.bucket_60_plus||0), 0);
    const totalOB     = rows.reduce((s,r) => s + parseFloat(r.outstanding_balance||0), 0);

    return (
        <Section
            title="Retailer Payment Aging"
            subtitle="Unpaid & partial transactions bucketed by days outstanding"
            action={<RefreshBtn onClick={load}/>}
        >
            {error && <ErrMsg msg={error} onRetry={load}/>}

            {/* Summary KPI bar */}
            {!loading && rows.length > 0 && (
                <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--color-divider,#dcd9d5)' }}>
                    {[['0–30 d', total0_30, '#437a22'], ['31–60 d', total31_60, '#da7101'], ['60+ d', total60plus, '#a12c7b'], ['Total Outstanding', totalOB, '#28251d']].map(([label, val, color]) => (
                        <div key={label} style={{ flex:1, padding:'0.75rem 1.25rem', borderRight:'1px solid var(--color-divider,#dcd9d5)' }}>
                            <div style={{ fontSize:11, color:'var(--color-text-muted,#7a7974)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:2 }}>{label}</div>
                            <div style={{ fontSize:16, fontWeight:700, color, fontVariantNumeric:'tabular-nums' }}>{fmtK(val)}</div>
                        </div>
                    ))}
                </div>
            )}

            <DataTable headers={H}>
                {loading ? <SkeletonRows cols={H.length}/>
                : rows.length===0 ? <Empty cols={H.length} msg="All retailers are fully paid up. ✅"/>
                : rows.map((r,i) => {
                    const b0   = parseFloat(r.bucket_0_30  ||0);
                    const b31  = parseFloat(r.bucket_31_60 ||0);
                    const b60  = parseFloat(r.bucket_60_plus||0);
                    const worst = b60>0 ? '60+' : b31>0 ? '31-60' : '0-30';
                    return (
                        <tr key={r.retailer_id} style={{ background: i%2===0?'transparent':'var(--color-surface-offset,#f3f0ec)22' }}>
                            <Td>
                                <strong>{r.shop_name}</strong>
                                {worst==='60+' && <span style={{ marginLeft:6, fontSize:10, color:'#a12c7b', fontWeight:700 }}>OVERDUE</span>}
                            </Td>
                            <Td muted>{r.market_location||'—'}</Td>
                            <Td>{paymentBadge(r.payment_pattern)}</Td>
                            <Td right><span style={{ color: b0>0?'#437a22':'var(--color-text-muted,#7a7974)' }}>{b0>0?fmtRs(b0):'—'}</span></Td>
                            <Td right><span style={{ color: b31>0?'#da7101':'var(--color-text-muted,#7a7974)' }}>{b31>0?fmtRs(b31):'—'}</span></Td>
                            <Td right><span style={{ color: b60>0?'#a12c7b':'var(--color-text-muted,#7a7974)', fontWeight: b60>0?700:400 }}>{b60>0?fmtRs(b60):'—'}</span></Td>
                            <Td right><strong style={{ color:'#da7101' }}>{fmtRs(r.outstanding_balance)}</strong></Td>
                            <Td right center><span style={{ background:'#a12c7b22', color:'#a12c7b', borderRadius:99, padding:'1px 8px', fontSize:12, fontWeight:600 }}>{r.unpaid_count}</span></Td>
                            <Td muted>{r.last_transaction ? new Date(r.last_transaction).toLocaleDateString('en-IN') : '—'}</Td>
                        </tr>
                    );
                })}
            </DataTable>
        </Section>
    );
}

// ── Monthly P&L Chart ──────────────────────────────────────────────────────────
function MonthlyPnLChart() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [hover, setHover] = useState(null);
    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const r = await fetch(`${API}/api/analytics/monthly-pnl`, { headers: authHeaders() });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            setRows(await r.json());
        } catch (e) { setError(e.message); } finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const maxRev = Math.max(...rows.map(r => parseFloat(r.revenue)||0), 1);
    const maxProfit = Math.max(...rows.map(r => parseFloat(r.gross_profit)||0), 1);
    const maxVal = Math.max(maxRev, maxProfit, 1);

    const W = 100 / Math.max(rows.length, 1);
    const BAR_H = 160;

    return (
        <Section title="Monthly P&L" subtitle="Last 12 months · revenue vs gross profit" action={<RefreshBtn onClick={load}/>}>
            {error && <ErrMsg msg={error} onRetry={load}/>}
            {loading ? (
                <div style={{ padding:'2rem', display:'flex', gap:8, alignItems:'flex-end', height: BAR_H+60 }}>
                    {Array.from({length:8}).map((_,i) => (
                        <div key={i} style={{ flex:1, height:`${40+i*15}px`, borderRadius:'4px 4px 0 0', background:'linear-gradient(90deg,var(--color-surface-offset,#f0eeea) 25%,var(--color-surface-dynamic,#e6e4df) 50%,var(--color-surface-offset,#f0eeea) 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s ease-in-out infinite' }} />
                    ))}
                </div>
            ) : rows.length===0 ? (
                <div style={{ padding:'2rem', textAlign:'center', color:'var(--color-text-muted,#7a7974)', fontSize:13 }}>No transaction data yet.</div>
            ) : (
                <div style={{ padding:'1.25rem' }}>
                    {/* Legend */}
                    <div style={{ display:'flex', gap:16, marginBottom:12, fontSize:12 }}>
                        <span><span style={{ display:'inline-block', width:12, height:12, borderRadius:2, background:'#01696f', marginRight:4 }}/>Revenue</span>
                        <span><span style={{ display:'inline-block', width:12, height:12, borderRadius:2, background:'#437a22', marginRight:4 }}/>Gross Profit</span>
                    </div>
                    {/* Chart */}
                    <div style={{ position:'relative', height: BAR_H+40, overflowX:'auto' }}>
                        <div style={{ display:'flex', alignItems:'flex-end', gap:4, height: BAR_H, minWidth: rows.length*44 }}>
                            {rows.map((r, i) => {
                                const rev    = parseFloat(r.revenue)||0;
                                const profit = parseFloat(r.gross_profit)||0;
                                const revH   = Math.round((rev    / maxVal) * BAR_H);
                                const profH  = Math.round((profit / maxVal) * BAR_H);
                                const isH    = hover===i;
                                const month  = r.month ? r.month.slice(0,7) : '';
                                const label  = month ? new Date(month+'-01').toLocaleDateString('en-IN',{month:'short',year:'2-digit'}) : month;
                                return (
                                    <div key={i}
                                        onMouseEnter={() => setHover(i)}
                                        onMouseLeave={() => setHover(null)}
                                        style={{ flex:1, minWidth:36, display:'flex', flexDirection:'column', alignItems:'center', gap:2, cursor:'default', position:'relative' }}
                                    >
                                        {isH && (
                                            <div style={{ position:'absolute', bottom: Math.max(revH,profH)+8, left:'50%', transform:'translateX(-50%)', background:'var(--color-text,#28251d)', color:'var(--color-text-inverse,#f9f8f4)', borderRadius:6, padding:'6px 10px', fontSize:11, whiteSpace:'nowrap', zIndex:10, boxShadow:'0 2px 8px rgba(0,0,0,0.15)', lineHeight:1.6 }}>
                                                <div style={{fontWeight:700}}>{label}</div>
                                                <div>Rev: {fmtK(rev)}</div>
                                                <div>Profit: {fmtK(profit)}</div>
                                                <div>Margin: {fmt(r.margin_pct,1)}%</div>
                                            </div>
                                        )}
                                        <div style={{ display:'flex', alignItems:'flex-end', gap:2, height: BAR_H }}>
                                            <div style={{ width:14, height: revH, background: isH?'#0c4e54':'#01696f', borderRadius:'3px 3px 0 0', transition:'all 150ms ease' }}/>
                                            <div style={{ width:14, height: profH, background: isH?'#2e5c10':'#437a22', borderRadius:'3px 3px 0 0', transition:'all 150ms ease' }}/>
                                        </div>
                                        <div style={{ fontSize:10, color:'var(--color-text-muted,#7a7974)', marginTop:4, textAlign:'center', whiteSpace:'nowrap', transform:'rotate(-30deg)', transformOrigin:'center top', height:20 }}>{label}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    {/* Summary row */}
                    <div style={{ display:'flex', gap:16, marginTop:16, paddingTop:12, borderTop:'1px solid var(--color-divider,#dcd9d5)', flexWrap:'wrap' }}>
                        {[['Total Revenue', rows.reduce((s,r)=>s+parseFloat(r.revenue||0),0), '#01696f'],
                          ['Total Profit',  rows.reduce((s,r)=>s+parseFloat(r.gross_profit||0),0), '#437a22'],
                          ['Avg Margin',    (rows.reduce((s,r)=>s+parseFloat(r.margin_pct||0),0)/Math.max(rows.length,1)).toFixed(1)+'%', '#006494'],
                          ['Transactions',  rows.reduce((s,r)=>s+parseInt(r.transactions||0),0), '#28251d']
                        ].map(([label, val, color]) => (
                            <div key={label} style={{ minWidth:100 }}>
                                <div style={{ fontSize:11, color:'var(--color-text-muted,#7a7974)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>{label}</div>
                                <div style={{ fontSize:18, fontWeight:700, color, fontVariantNumeric:'tabular-nums' }}>{typeof val === 'number' ? fmtK(val) : val}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </Section>
    );
}

// ── Dead Stock Heatmap ─────────────────────────────────────────────────────────
function DeadStockHeatmap() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const r = await fetch(`${API}/api/analytics/dead-stock-by-location`, { headers: authHeaders() });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            setRows(await r.json());
        } catch (e) { setError(e.message); } finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const maxCapital = Math.max(...rows.map(r => parseFloat(r.locked_capital)||0), 1);
    const totalCapital = rows.reduce((s,r) => s+parseFloat(r.locked_capital||0), 0);

    function heatColor(pct) {
        // green (low) → yellow → red (high)
        if (pct < 0.2) return '#d4dfcc';
        if (pct < 0.4) return '#e9e0c6';
        if (pct < 0.6) return '#e7d7c4';
        if (pct < 0.8) return '#ddc8c0';
        return '#e0ced7';
    }
    function heatTextColor(pct) {
        if (pct < 0.4) return '#437a22';
        if (pct < 0.6) return '#da7101';
        return '#a12c7b';
    }

    return (
        <Section
            title="Dead Stock Heatmap by Warehouse"
            subtitle="Slow-moving & dead inventory · locked capital per location"
            action={<RefreshBtn onClick={load}/>}
        >
            {error && <ErrMsg msg={error} onRetry={load}/>}
            {loading ? (
                <div style={{ padding:'1.25rem', display:'flex', flexWrap:'wrap', gap:12 }}>
                    {Array.from({length:6}).map((_,i) => (
                        <div key={i} style={{ flex:'1 1 160px', height:100, borderRadius:8, background:'linear-gradient(90deg,var(--color-surface-offset,#f0eeea) 25%,var(--color-surface-dynamic,#e6e4df) 50%,var(--color-surface-offset,#f0eeea) 75%)', backgroundSize:'200% 100%', animation:'shimmer 1.4s ease-in-out infinite' }}/>
                    ))}
                </div>
            ) : rows.length===0 ? (
                <div style={{ padding:'2rem', textAlign:'center', color:'var(--color-text-muted,#7a7974)', fontSize:13 }}>No slow/dead stock found. All inventory is moving well. ✅</div>
            ) : (
                <div style={{ padding:'1.25rem' }}>
                    {totalCapital > 0 && (
                        <div style={{ marginBottom:12, fontSize:13, color:'var(--color-text-muted,#7a7974)' }}>
                            Total locked capital: <strong style={{ color:'#a12c7b' }}>{fmtRs(totalCapital)}</strong>
                        </div>
                    )}
                    <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                        {rows.map(r => {
                            const cap  = parseFloat(r.locked_capital)||0;
                            const pct  = cap / maxCapital;
                            const days = Math.round(parseFloat(r.avg_idle_days)||0);
                            return (
                                <div key={r.location} style={{
                                    flex:'1 1 160px', minWidth:140, maxWidth:220,
                                    background: heatColor(pct),
                                    borderRadius:8, padding:'0.875rem 1rem',
                                    border:`1px solid ${heatTextColor(pct)}33`,
                                    transition:'transform 150ms ease, box-shadow 150ms ease',
                                }}
                                    onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}
                                >
                                    <div style={{ fontSize:12, fontWeight:700, color:'var(--color-text,#28251d)', marginBottom:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={r.location}>{r.location}</div>
                                    <div style={{ fontSize:20, fontWeight:800, color: heatTextColor(pct), fontVariantNumeric:'tabular-nums' }}>{fmtK(cap)}</div>
                                    <div style={{ fontSize:11, color:'var(--color-text-muted,#7a7974)', marginTop:4 }}>{fmt(r.than_count)} thans · {fmt(r.total_meters)} m</div>
                                    <div style={{ fontSize:11, color: days>60?'#a12c7b':days>30?'#da7101':'var(--color-text-muted,#7a7974)', marginTop:2, fontWeight: days>60?700:400 }}>
                                        Idle ~{days} days
                                    </div>
                                    {/* Capital bar */}
                                    <div style={{ marginTop:8, height:4, borderRadius:99, background:'rgba(0,0,0,0.1)' }}>
                                        <div style={{ width:`${Math.round(pct*100)}%`, height:'100%', borderRadius:99, background: heatTextColor(pct), transition:'width 400ms ease' }}/>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </Section>
    );
}

// ── Main export ───────────────────────────────────────────────────────────────────
const VIEWS = [
    { id:'top-retailers',    label:'Top Retailers' },
    { id:'margin-supplier',  label:'Margin / Supplier' },
    { id:'margin-retailer',  label:'Margin / Retailer' },
    { id:'payment-aging',    label:'Payment Aging' },
    { id:'monthly-pnl',      label:'Monthly P&L' },
    { id:'dead-stock',       label:'Dead Stock Map' },
];

export default function AnalyticsDashboard({ user }) {
    const [activeView, setActiveView] = useState('top-retailers');

    return (
        <div style={{ padding:'1.25rem', maxWidth:1100, margin:'0 auto' }}>
            <style>{`
                @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
                @media(max-width:640px){
                    .analytics-nav { flex-wrap:wrap !important; width:100% !important; }
                    .analytics-nav button { flex:1 1 calc(50% - 6px); font-size:12px !important; padding:6px 8px !important; }
                }
            `}</style>

            <div style={{ marginBottom:'1.25rem' }}>
                <h2 style={{ margin:0, fontSize:20, fontWeight:700, color:'var(--color-text,#28251d)' }}>Analytics Dashboard</h2>
                <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--color-text-muted,#7a7974)' }}>
                    Revenue intelligence · margin analysis · payment aging · dead stock
                </p>
            </div>

            {/* Sub-navigation */}
            <div className="analytics-nav" style={{ display:'flex', gap:6, marginBottom:'1.25rem', background:'var(--color-surface-offset,#f3f0ec)', borderRadius:8, padding:4, width:'fit-content', flexWrap:'wrap' }}>
                {VIEWS.map(v => (
                    <button
                        key={v.id}
                        onClick={() => setActiveView(v.id)}
                        style={{ padding:'6px 14px', borderRadius:6, border:'none', cursor:'pointer', fontSize:13, fontWeight:500,
                            background: activeView===v.id ? 'var(--color-surface,#f9f8f5)' : 'transparent',
                            color: activeView===v.id ? 'var(--color-primary,#01696f)' : 'var(--color-text-muted,#7a7974)',
                            boxShadow: activeView===v.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            transition:'all 150ms ease',
                        }}
                    >{v.label}</button>
                ))}
            </div>

            {activeView==='top-retailers'   && <TopRetailersTable/>}
            {activeView==='margin-supplier' && <MarginPerSupplierTable/>}
            {activeView==='margin-retailer' && <MarginPerRetailerTable/>}
            {activeView==='payment-aging'   && <PaymentAgingTable/>}
            {activeView==='monthly-pnl'     && <MonthlyPnLChart/>}
            {activeView==='dead-stock'      && <DeadStockHeatmap/>}
        </div>
    );
}

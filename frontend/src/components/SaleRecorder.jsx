import { useCallback, useEffect, useRef, useState } from 'react'
import API from '../api'

const money = v => `NPR ${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const emptyForm = {
    than_id: '', retailer_id: '', quantity: '',
    price: '', discount: '0', payment_status: 'paid',
    sale_date: new Date().toISOString().slice(0, 10), notes: ''
}

export default function SaleRecorder({ user }) {
    const [thans, setThans]               = useState([])
    const [retailers, setRetailers]       = useState([])
    const [sales, setSales]               = useState([])
    const [form, setForm]                 = useState(emptyForm)
    const [selectedThan, setSelectedThan] = useState(null)
    const [error, setError]               = useState('')
    const [success, setSuccess]           = useState('')
    const [saving, setSaving]             = useState(false)
    const [loading, setLoading]           = useState(true)
    const [search, setSearch]             = useState('')
    const [showDropdown, setShowDropdown] = useState(false)
    const [fetchError, setFetchError]     = useState('')
    const wrapRef = useRef(null)

    const authHeader = useCallback(
        () => ({ 'x-user-id': String(user.user_id), 'x-user-role': user.role }),
        [user.user_id, user.role]
    )

    const loadAll = useCallback(async () => {
        setLoading(true); setFetchError('')
        try {
            // Fetch inventory and retailers — these are required for the form
            const [thanRes, retailerRes] = await Promise.all([
                API.get('/inventory/search', { params: { q: '' } }),
                API.get('/retailers'),
            ])
            setThans(Array.isArray(thanRes.data) ? thanRes.data : [])
            setRetailers(Array.isArray(retailerRes.data) ? retailerRes.data : [])
        } catch (e) {
            setFetchError(e?.response?.data?.error || e?.message || 'Failed to load inventory/retailers')
        } finally {
            setLoading(false)
        }

        // Fetch recent sales separately — failure here should not block the form
        try {
            const salesRes = await API.get('/transactions', { headers: authHeader() })
            setSales(Array.isArray(salesRes.data) ? salesRes.data : [])
        } catch {
            setSales([])  // non-fatal: form still works, just no history shown
        }
    }, [authHeader])

    useEffect(() => { loadAll() }, [loadAll])

    // Close dropdown when clicking outside
    useEffect(() => {
        const handler = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowDropdown(false) }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const selectThan = t => {
        setSelectedThan(t)
        setSearch(`${t.than_code} — ${[t.color, t.design, t.fabric_type].filter(Boolean).join(' / ')}`)
        setForm(f => ({ ...f, than_id: String(t.than_id), price: t.selling_price }))
        setShowDropdown(false)
    }

    const clearThan = () => {
        setSelectedThan(null)
        setSearch('')
        setForm(f => ({ ...f, than_id: '', price: '' }))
        setShowDropdown(false)
    }

    const handleSearchChange = e => {
        setSearch(e.target.value)
        setShowDropdown(true)
        if (selectedThan) { setSelectedThan(null); setForm(f => ({ ...f, than_id: '', price: '' })) }
    }

    const filteredThans = thans.filter(t => {
        if (!search.trim() || selectedThan) return true
        const q = search.toLowerCase()
        return (
            t.than_code?.toLowerCase().includes(q) ||
            t.fabric_type?.toLowerCase().includes(q) ||
            t.color?.toLowerCase().includes(q) ||
            t.design?.toLowerCase().includes(q)
        )
    })

    const handleChange = e => {
        const { name, value } = e.target
        setForm(f => ({ ...f, [name]: value }))
    }

    const previewMargin = () => {
        if (!selectedThan || !form.quantity || !form.price) return null
        return (Number(form.price) - Number(selectedThan.cost_per_meter)) * Number(form.quantity) - Number(form.discount || 0)
    }

    const handleSubmit = async e => {
        e.preventDefault(); setError(''); setSuccess('')
        if (!form.than_id) return setError('Select a Than from the dropdown')
        if (!form.quantity || Number(form.quantity) <= 0) return setError('Quantity must be > 0')
        if (!form.price || Number(form.price) <= 0) return setError('Price must be > 0')
        if (selectedThan && Number(form.quantity) > Number(selectedThan.remaining_stock))
            return setError(`Only ${selectedThan.remaining_stock}m available`)
        setSaving(true)
        try {
            const res = await API.post('/transactions', form, { headers: authHeader() })
            setSuccess(`✓ Sale recorded — Margin: ${money(res.data.margin)}`)
            setForm(emptyForm); setSelectedThan(null); setSearch(''); loadAll()
        } catch (e) { setError(e?.response?.data?.error || 'Sale failed') }
        finally { setSaving(false) }
    }

    const margin = previewMargin()

    if (loading) return <div className="loading">Loading sale recorder...</div>

    const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4 }
    const capStyle   = { fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 1rem 2rem' }}>
            <h2 style={{ marginBottom: '1.2rem' }}>Record a Sale</h2>

            {fetchError && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: 8, background: '#fef2f2', border: '1px solid #fca5a5', fontSize: 14, color: '#b91c1c' }}>
                    ⚠ Could not load data: {fetchError} —{' '}
                    <button onClick={loadAll} style={{ textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 14 }}>Retry</button>
                </div>
            )}

            <section className="card" style={{ marginBottom: '2rem' }}>
                <form onSubmit={handleSubmit}>

                    {/* ── Row 1: Than autocomplete ── */}
                    <div style={{ marginBottom: '1rem' }} ref={wrapRef}>
                        <div style={labelStyle}>
                            <span style={capStyle}>Search &amp; Select Than *</span>

                            <div style={{ position: 'relative' }}>
                                <input
                                    value={search}
                                    onChange={handleSearchChange}
                                    onFocus={() => !selectedThan && setShowDropdown(true)}
                                    placeholder="Type code, fabric, colour, design…"
                                    className="input"
                                    autoComplete="off"
                                    style={{ paddingRight: selectedThan ? '2.2rem' : undefined }}
                                />
                                {selectedThan && (
                                    <button
                                        type="button"
                                        onClick={clearThan}
                                        title="Clear selection"
                                        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--color-text-muted)', lineHeight: 1 }}
                                    >×</button>
                                )}
                            </div>

                            {showDropdown && !selectedThan && (
                                <div style={{ position: 'relative' }}>
                                    <div style={{
                                        position: 'absolute', top: 2, left: 0, right: 0, zIndex: 100,
                                        background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                                        borderRadius: 8, boxShadow: '0 8px 24px oklch(0.2 0.01 80 / 0.12)',
                                        maxHeight: 260, overflowY: 'auto'
                                    }}>
                                        {thans.length === 0 ? (
                                            <div style={{ padding: '0.75rem 1rem', fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>
                                                No thans in stock. Go to <strong>Bale Intake</strong> first.
                                            </div>
                                        ) : filteredThans.length === 0 ? (
                                            <div style={{ padding: '0.75rem 1rem', fontSize: 13, color: 'var(--color-text-muted)' }}>
                                                No thans match "{search}"
                                            </div>
                                        ) : (
                                            filteredThans.map((t, i) => (
                                                <div
                                                    key={t.than_id}
                                                    onClick={() => selectThan(t)}
                                                    style={{
                                                        padding: '0.6rem 1rem', cursor: 'pointer', fontSize: 13,
                                                        borderBottom: i < filteredThans.length - 1 ? '1px solid var(--color-divider)' : 'none',
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-offset)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <span>
                                                        <strong style={{ fontFamily: 'monospace' }}>{t.than_code}</strong>
                                                        <span style={{ color: 'var(--color-text-muted)', marginLeft: 8 }}>
                                                            {[t.color, t.design, t.fabric_type].filter(Boolean).join(' / ')}
                                                        </span>
                                                    </span>
                                                    <span style={{ whiteSpace: 'nowrap', color: 'var(--color-text-muted)', fontSize: 12 }}>
                                                        {Number(t.remaining_stock).toFixed(1)}m · NPR {Number(t.selling_price).toFixed(0)}/m
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Row 2: Selected than info + key fields ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: selectedThan ? '240px 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem', alignItems: 'start' }}>

                        {selectedThan && (
                            <div style={{ background: 'var(--color-surface-offset)', borderRadius: 8, padding: '0.75rem 1rem', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 5, borderLeft: '3px solid var(--color-primary)' }}>
                                <strong style={{ fontSize: 14 }}>{selectedThan.than_code}</strong>
                                <span style={{ color: 'var(--color-text-muted)' }}>{[selectedThan.color, selectedThan.design, selectedThan.fabric_type].filter(Boolean).join(' / ')}</span>
                                <span>Stock: <b>{Number(selectedThan.remaining_stock).toFixed(1)} m</b></span>
                                <span>Cost/m: <b>NPR {Number(selectedThan.cost_per_meter).toFixed(2)}</b></span>
                                <span>Sell/m: <b>NPR {Number(selectedThan.selling_price).toFixed(2)}</b></span>
                            </div>
                        )}

                        <label style={labelStyle}>
                            <span style={capStyle}>Retailer</span>
                            <select name="retailer_id" value={form.retailer_id} onChange={handleChange} className="input">
                                <option value="">Walk-in / Unknown</option>
                                {retailers.map(r => <option key={r.retailer_id} value={r.retailer_id}>{r.shop_name}{r.market_location ? ` — ${r.market_location}` : ''}</option>)}
                            </select>
                        </label>

                        <label style={labelStyle}>
                            <span style={capStyle}>Quantity (meters) *</span>
                            <input name="quantity" type="number" step="0.01" min="0.01" value={form.quantity} onChange={handleChange} className="input" placeholder="e.g. 10.5" />
                        </label>

                        <label style={labelStyle}>
                            <span style={capStyle}>Price / meter (NPR) *</span>
                            <input name="price" type="number" step="0.01" min="0.01" value={form.price} onChange={handleChange} className="input" placeholder="Auto-filled from Than" />
                        </label>
                    </div>

                    {/* ── Row 3: Secondary fields ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                        <label style={labelStyle}>
                            <span style={capStyle}>Discount (NPR)</span>
                            <input name="discount" type="number" step="0.01" min="0" value={form.discount} onChange={handleChange} className="input" placeholder="0" />
                        </label>
                        <label style={labelStyle}>
                            <span style={capStyle}>Payment Status</span>
                            <select name="payment_status" value={form.payment_status} onChange={handleChange} className="input">
                                <option value="paid">Paid</option>
                                <option value="pending">Pending</option>
                                <option value="partial">Partial</option>
                            </select>
                        </label>
                        <label style={labelStyle}>
                            <span style={capStyle}>Sale Date</span>
                            <input name="sale_date" type="date" value={form.sale_date} onChange={handleChange} className="input" />
                        </label>
                        <label style={labelStyle}>
                            <span style={capStyle}>Notes</span>
                            <input name="notes" value={form.notes} onChange={handleChange} className="input" placeholder="Optional" />
                        </label>
                    </div>

                    {/* ── Margin preview ── */}
                    {margin !== null && (
                        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: 8, background: margin >= 0 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${margin >= 0 ? '#86efac' : '#fca5a5'}`, fontSize: 14 }}>
                            <strong>Margin preview: </strong>
                            <span style={{ color: margin >= 0 ? '#15803d' : '#b91c1c', fontWeight: 700 }}>{money(margin)}</span>
                            {selectedThan && form.quantity && (
                                <span style={{ color: 'var(--color-text-muted)', marginLeft: 12 }}>
                                    ({money(Number(form.price) - Number(selectedThan.cost_per_meter))}/m × {form.quantity}m)
                                </span>
                            )}
                        </div>
                    )}

                    {error   && <p style={{ color: 'var(--color-error)',   marginBottom: '.6rem', fontSize: 14 }}>{error}</p>}
                    {success && <p style={{ color: 'var(--color-success)', marginBottom: '.6rem', fontSize: 14 }}>{success}</p>}

                    <button type="submit" className="btn btn-primary" disabled={saving || thans.length === 0}>
                        {saving ? 'Recording…' : 'Record Sale'}
                    </button>
                </form>
            </section>

            {/* ── Recent Sales ── */}
            <section>
                <h3 style={{ marginBottom: '1rem' }}>Recent Sales ({sales.length})</h3>
                {sales.length === 0
                    ? <p style={{ color: 'var(--color-text-muted)' }}>No sales recorded yet.</p>
                    : <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--color-surface-offset)', textAlign: 'left' }}>
                                    {['Date','Than','Fabric','Retailer','Qty','Price/m','Discount','Margin','Payment'].map(h =>
                                        <th key={h} style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{h}</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {sales.map(s => (
                                    <tr key={s.transaction_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ padding: '7px 10px' }}>{s.sale_date?.slice(0,10)}</td>
                                        <td style={{ padding: '7px 10px', fontWeight: 600 }}>{s.than_code}</td>
                                        <td style={{ padding: '7px 10px' }}>{[s.color, s.design, s.fabric_type].filter(Boolean).join(' / ')}</td>
                                        <td style={{ padding: '7px 10px' }}>{s.shop_name || 'Walk-in'}</td>
                                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{Number(s.quantity).toFixed(1)} m</td>
                                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>NPR {Number(s.price).toFixed(2)}</td>
                                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{Number(s.discount) > 0 ? money(s.discount) : '-'}</td>
                                        <td style={{ padding: '7px 10px', textAlign: 'right', color: Number(s.margin) >= 0 ? 'var(--color-success)' : 'var(--color-error)', fontWeight: 600 }}>{money(s.margin)}</td>
                                        <td style={{ padding: '7px 10px' }}>
                                            <span style={{ borderRadius: 10, padding: '2px 8px', fontSize: 12, fontWeight: 600, background: s.payment_status === 'paid' ? '#dcfce7' : s.payment_status === 'pending' ? '#fef9c3' : '#e0f2fe', color: '#374151' }}>
                                                {s.payment_status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                }
            </section>
        </div>
    )
}

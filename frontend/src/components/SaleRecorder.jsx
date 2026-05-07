import { useCallback, useEffect, useState } from 'react'
import API from '../api'

const money = v => `NPR ${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const emptyForm = {
    than_id: '', retailer_id: '', quantity: '',
    price: '', discount: '0', payment_status: 'paid',
    sale_date: new Date().toISOString().slice(0, 10), notes: ''
}

export default function SaleRecorder({ user }) {
    const [thans, setThans]         = useState([])
    const [retailers, setRetailers] = useState([])
    const [sales, setSales]         = useState([])
    const [form, setForm]           = useState(emptyForm)
    const [selectedThan, setSelectedThan] = useState(null)
    const [error, setError]         = useState('')
    const [success, setSuccess]     = useState('')
    const [saving, setSaving]       = useState(false)
    const [loading, setLoading]     = useState(true)
    const [search, setSearch]       = useState('')
    const [fetchError, setFetchError] = useState('')

    const authHeader = useCallback(
        () => ({ 'x-user-id': String(user.user_id), 'x-user-role': user.role }),
        [user.user_id, user.role]
    )

    const loadAll = useCallback(async () => {
        setLoading(true)
        setFetchError('')
        try {
            const [thanRes, retailerRes, salesRes] = await Promise.all([
                API.get('/inventory/search', { params: { q: '' } }),
                API.get('/retailers'),
                API.get('/transactions', { headers: authHeader() })
            ])
            setThans(Array.isArray(thanRes.data) ? thanRes.data : [])
            setRetailers(Array.isArray(retailerRes.data) ? retailerRes.data : [])
            setSales(Array.isArray(salesRes.data) ? salesRes.data : [])
        } catch (e) {
            console.error('SaleRecorder loadAll error:', e?.response?.status, e?.response?.data, e?.message)
            setFetchError(e?.response?.data?.error || e?.message || 'Failed to load data')
        }
        finally { setLoading(false) }
    }, [authHeader])

    useEffect(() => { loadAll() }, [loadAll])

    const handleChange = e => {
        const { name, value } = e.target
        setForm(f => ({ ...f, [name]: value }))
        if (name === 'than_id') {
            const t = thans.find(t => String(t.than_id) === String(value))
            setSelectedThan(t || null)
            if (t) setForm(f => ({ ...f, than_id: value, price: t.selling_price }))
        }
    }

    const previewMargin = () => {
        if (!selectedThan || !form.quantity || !form.price) return null
        return (Number(form.price) - Number(selectedThan.cost_per_meter)) * Number(form.quantity) - Number(form.discount || 0)
    }

    const handleSubmit = async e => {
        e.preventDefault()
        setError('')
        setSuccess('')
        if (!form.than_id) return setError('Select a Than')
        if (!form.quantity || Number(form.quantity) <= 0) return setError('Quantity must be > 0')
        if (!form.price || Number(form.price) <= 0) return setError('Price must be > 0')
        if (selectedThan && Number(form.quantity) > Number(selectedThan.remaining_stock))
            return setError(`Only ${selectedThan.remaining_stock}m available`)
        setSaving(true)
        try {
            const res = await API.post('/transactions', form, { headers: authHeader() })
            setSuccess(`✓ Sale recorded — Margin: ${money(res.data.margin)}`)
            setForm(emptyForm)
            setSelectedThan(null)
            setSearch('')
            loadAll()
        } catch (e) { setError(e?.response?.data?.error || 'Sale failed') }
        finally { setSaving(false) }
    }

    const filteredThans = thans.filter(t => {
        if (!search.trim()) return true
        const q = search.toLowerCase()
        return (
            t.than_code?.toLowerCase().includes(q) ||
            t.fabric_type?.toLowerCase().includes(q) ||
            t.color?.toLowerCase().includes(q) ||
            t.design?.toLowerCase().includes(q)
        )
    })

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

                    {/* ── Row 1: Than search + select (full width) ── */}
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={labelStyle}>
                            <span style={capStyle}>Search &amp; Select Than *</span>
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Filter by code, fabric, color, design…"
                                className="input"
                                style={{ marginBottom: 6 }}
                            />
                            {thans.length === 0 && !fetchError ? (
                                <div style={{ padding: '0.75rem 1rem', borderRadius: 8, background: 'var(--color-surface-offset)', border: '1px solid var(--color-border)', fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>
                                    No thans in stock yet.{' '}
                                    <strong style={{ color: 'var(--color-text)' }}>Go to Bale Intake → open a bale → add thans first.</strong>
                                </div>
                            ) : (
                                <select
                                    name="than_id"
                                    value={form.than_id}
                                    onChange={handleChange}
                                    className="input"
                                    size={5}
                                    style={{ height: 'auto', width: '100%', fontFamily: 'monospace', fontSize: 13 }}
                                >
                                    <option value="">-- select --</option>
                                    {filteredThans.length === 0 && thans.length > 0
                                        ? <option disabled>No thans match "{search}"</option>
                                        : filteredThans.map(t => (
                                            <option key={t.than_id} value={t.than_id}>
                                                {t.than_code.padEnd(9)} | {[t.color, t.design, t.fabric_type].filter(Boolean).join(' / ').padEnd(40)} | {Number(t.remaining_stock).toFixed(1)}m | NPR {Number(t.selling_price).toFixed(2)}/m
                                            </option>
                                        ))
                                    }
                                </select>
                            )}
                        </label>
                    </div>

                    {/* ── Row 2: Selected than info card + 3 key fields ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: selectedThan ? '260px 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem', alignItems: 'start' }}>

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

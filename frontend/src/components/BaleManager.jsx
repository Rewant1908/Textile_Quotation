import { useEffect, useState, useCallback } from 'react'
import API from '../api'

const SPEED_COLORS = { fast: '#22c55e', medium: '#f59e0b', slow: '#ef4444', new: '#6366f1', dead: '#9ca3af' }

const emptyBaleForm = {
    bale_code: '', supplier_id: '', factory_name: '', arrival_date: '',
    purchase_cost: '', transport_cost: '', total_rolls: '',
    fabric_category: '', purchase_invoice: ''
}

const emptyThanRow = () => ({
    than_code: '', fabric_type: '', color: '', design: '', gsm: '',
    meter_length: '', cost_per_meter: '', selling_price: '',
    warehouse_location: '', product_id: ''
})

function marginPct(cost, sell) {
    const c = Number(cost), s = Number(sell)
    if (!c || !s || c <= 0) return null
    return ((s - c) / c * 100).toFixed(1)
}

export default function BaleManager({ user }) {
    const [bales, setBales]                   = useState([])
    const [suppliers, setSuppliers]           = useState([])
    const [products, setProducts]             = useState([])
    const [baleForm, setBaleForm]             = useState(emptyBaleForm)
    const [baleError, setBaleError]           = useState('')
    const [baleSuccess, setBaleSuccess]       = useState('')
    const [submittingBale, setSubmittingBale] = useState(false)

    const [expandedBale, setExpandedBale]     = useState(null)
    const [baleThans, setBaleThans]           = useState({})
    const [thanRows, setThanRows]             = useState([emptyThanRow()])
    const [thanError, setThanError]           = useState('')
    const [thanSuccess, setThanSuccess]       = useState('')
    const [submittingThan, setSubmittingThan] = useState(false)
    const [loadingThans, setLoadingThans]     = useState(false)

    // authHeader MUST be defined before fetchBales useCallback
    const authHeader = useCallback(
        () => ({ 'x-user-id': user.user_id, 'x-user-role': user.role }),
        [user]
    )

    const fetchBales = useCallback(async () => {
        try {
            const res = await API.get('/bales', { headers: authHeader() })
            setBales(res.data)
        } catch (e) { console.error(e) }
    }, [authHeader])

    useEffect(() => {
        fetchBales()
        API.get('/suppliers').then(r => setSuppliers(r.data)).catch(() => {})
        API.get('/products').then(r => setProducts(r.data)).catch(() => {})
    }, [fetchBales])

    const handleBaleChange = e => {
        const { name, value } = e.target
        setBaleForm(prev => ({ ...prev, [name]: value }))
    }

    const handleBaleSubmit = async e => {
        e.preventDefault()
        setBaleError('')
        setBaleSuccess('')
        if (!baleForm.bale_code.trim()) return setBaleError('Bale code is required')
        if (!baleForm.arrival_date)      return setBaleError('Arrival date is required')
        if (!baleForm.purchase_cost || Number(baleForm.purchase_cost) <= 0)
            return setBaleError('Purchase cost must be > 0')
        if (!baleForm.total_rolls || !Number.isInteger(Number(baleForm.total_rolls)) || Number(baleForm.total_rolls) < 1)
            return setBaleError('Total rolls must be a positive integer')
        if (!baleForm.fabric_category.trim()) return setBaleError('Fabric category is required')
        setSubmittingBale(true)
        try {
            await API.post('/bales', baleForm, { headers: authHeader() })
            setBaleSuccess(`Bale "${baleForm.bale_code}" registered!`)
            setBaleForm(emptyBaleForm)
            fetchBales()
        } catch (e) {
            setBaleError(e?.response?.data?.error || 'Failed to register bale')
        } finally {
            setSubmittingBale(false)
        }
    }

    const toggleExpand = async (baleId) => {
        if (expandedBale === baleId) { setExpandedBale(null); return }
        setExpandedBale(baleId)
        setThanRows([emptyThanRow()])
        setThanError('')
        setThanSuccess('')
        if (!baleThans[baleId]) {
            setLoadingThans(true)
            try {
                const res = await API.get(`/bales/${baleId}/thans`, { headers: authHeader() })
                setBaleThans(prev => ({ ...prev, [baleId]: res.data }))
            } catch (e) { console.error(e) }
            finally { setLoadingThans(false) }
        }
    }

    const handleThanChange = (idx, field, value) => {
        setThanRows(prev => {
            const updated = [...prev]
            updated[idx] = { ...updated[idx], [field]: value }
            return updated
        })
    }

    const addThanRow    = () => setThanRows(prev => [...prev, emptyThanRow()])
    const removeThanRow = idx => setThanRows(prev => prev.filter((_, i) => i !== idx))

    const handleSubmitThans = async (baleId) => {
        setThanError('')
        setThanSuccess('')
        for (let i = 0; i < thanRows.length; i++) {
            const t = thanRows[i]
            if (!t.than_code.trim() || !t.fabric_type.trim())
                return setThanError(`Row ${i + 1}: than_code and fabric_type are required`)
            if (!t.cost_per_meter || Number(t.cost_per_meter) <= 0)
                return setThanError(`Row ${i + 1}: cost_per_meter must be > 0`)
            if (!t.selling_price || Number(t.selling_price) <= 0)
                return setThanError(`Row ${i + 1}: selling_price must be > 0`)
            if (!t.meter_length || Number(t.meter_length) <= 0)
                return setThanError(`Row ${i + 1}: meter_length must be > 0`)
        }
        setSubmittingThan(true)
        try {
            const res = await API.post(
                `/bales/${baleId}/thans`,
                { thans: thanRows.map(t => ({ ...t, product_id: t.product_id || null, gsm: t.gsm ? Number(t.gsm) : null })) },
                { headers: authHeader() }
            )
            setThanSuccess(`✓ ${res.data.inserted} than(s) added successfully`)
            setThanRows([emptyThanRow()])
            const thanRes = await API.get(`/bales/${baleId}/thans`, { headers: authHeader() })
            setBaleThans(prev => ({ ...prev, [baleId]: thanRes.data }))
            fetchBales()
        } catch (e) {
            setThanError(e?.response?.data?.error || 'Failed to add thans')
        } finally {
            setSubmittingThan(false)
        }
    }

    const speedBadge = (speed) => (
        <span style={{ background: SPEED_COLORS[speed] || '#9ca3af', color: '#fff', borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>
            {speed || 'new'}
        </span>
    )

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 1rem 2rem' }}>
            <h2 style={{ marginBottom: '1.2rem' }}>Bale Intake</h2>

            <section className="card" style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>Register New Bale</h3>
                <form onSubmit={handleBaleSubmit}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                        {[['bale_code','Bale Code *','text','e.g. B2026-001'],['arrival_date','Arrival Date *','date',''],['fabric_category','Fabric Category *','text','Cotton, Silk...'],['factory_name','Factory (override)','text','Optional'],['purchase_cost','Purchase Cost (NPR) *','number','0.00'],['transport_cost','Transport Cost (NPR)','number','0.00'],['total_rolls','Total Rolls *','number','12'],['purchase_invoice','Invoice #','text','Optional']].map(([name, label, type, ph]) => (
                            <label key={name} className="form-group">
                                <span>{label}</span>
                                <input name={name} type={type} value={baleForm[name]} onChange={handleBaleChange}
                                    placeholder={ph} step={type==='number'?'0.01':undefined} className="input" />
                            </label>
                        ))}
                        <label className="form-group">
                            <span>Supplier</span>
                            <select name="supplier_id" value={baleForm.supplier_id} onChange={handleBaleChange} className="input">
                                <option value="">-- Select supplier --</option>
                                {suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}{s.factory_name ? ` (${s.factory_name})` : ''}</option>)}
                            </select>
                        </label>
                    </div>
                    {baleError   && <p style={{ color: 'var(--color-error)',   marginBottom: '.6rem' }}>{baleError}</p>}
                    {baleSuccess && <p style={{ color: 'var(--color-success)', marginBottom: '.6rem' }}>{baleSuccess}</p>}
                    <button type="submit" className="btn btn-primary" disabled={submittingBale}>
                        {submittingBale ? 'Registering...' : 'Register Bale'}
                    </button>
                </form>
            </section>

            <section>
                <h3 style={{ marginBottom: '1rem' }}>All Bales ({bales.length})</h3>
                {bales.length === 0
                    ? <p style={{ color: 'var(--color-text-muted)' }}>No bales registered yet.</p>
                    : bales.map(bale => (
                        <div key={bale.bale_id} className="card" style={{ marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <strong style={{ fontSize: '1.05rem' }}>{bale.bale_code}</strong>
                                    <span style={{ marginLeft: 8, color: 'var(--color-text-muted)', fontSize: 13 }}>
                                        {bale.fabric_category} &mdash; {bale.factory_name || bale.supplier_name || 'No supplier'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: 13 }}>
                                    <span>📅 {bale.arrival_date?.slice(0,10)}</span>
                                    <span>📦 {bale.thans_created} thans</span>
                                    <span>🧵 {Number(bale.total_remaining).toFixed(1)} m left</span>
                                    <span>💰 NPR {Number(bale.purchase_cost).toLocaleString()}</span>
                                    <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: bale.status==='opened'?'#22c55e22':'#6366f122', color: bale.status==='opened'?'#16a34a':'#4f46e5' }}>{bale.status}</span>
                                </div>
                                <button className="btn btn-secondary" style={{ fontSize: 13, padding: '4px 14px' }} onClick={() => toggleExpand(bale.bale_id)}>
                                    {expandedBale === bale.bale_id ? 'Collapse ▲' : 'View / Add Thans ▼'}
                                </button>
                            </div>

                            {expandedBale === bale.bale_id && (
                                <div style={{ marginTop: '1.2rem' }}>
                                    {loadingThans ? <p style={{ color: 'var(--color-text-muted)' }}>Loading thans...</p>
                                    : baleThans[bale.bale_id]?.length > 0 ? (
                                        <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
                                            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                                                <thead><tr style={{ background: 'var(--color-surface-offset)', textAlign: 'left' }}>
                                                    {['Code','Type','Color','Design','Meters','Cost/m','Sell/m','Margin%','Location','Speed'].map(h => <th key={h} style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{h}</th>)}
                                                </tr></thead>
                                                <tbody>
                                                    {baleThans[bale.bale_id].map(t => {
                                                        const mp = marginPct(t.cost_per_meter, t.selling_price)
                                                        return (
                                                            <tr key={t.than_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                                <td style={{ padding: '5px 8px' }}>{t.than_code}</td>
                                                                <td style={{ padding: '5px 8px' }}>{t.fabric_type}</td>
                                                                <td style={{ padding: '5px 8px' }}>{t.color||'-'}</td>
                                                                <td style={{ padding: '5px 8px' }}>{t.design||'-'}</td>
                                                                <td style={{ padding: '5px 8px', textAlign:'right' }}>{Number(t.remaining_stock).toFixed(1)}</td>
                                                                <td style={{ padding: '5px 8px', textAlign:'right' }}>{Number(t.cost_per_meter).toFixed(2)}</td>
                                                                <td style={{ padding: '5px 8px', textAlign:'right' }}>{Number(t.selling_price).toFixed(2)}</td>
                                                                <td style={{ padding: '5px 8px', textAlign:'right', color: Number(mp)>=20?'#16a34a':Number(mp)<10?'#ef4444':'#b45309' }}>{mp!==null?`${mp}%`:'-'}</td>
                                                                <td style={{ padding: '5px 8px' }}>{t.warehouse_location||'-'}</td>
                                                                <td style={{ padding: '5px 8px' }}>{speedBadge(t.movement_speed)}</td>
                                                            </tr>
                                                        )
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>No thans added yet.</p>}

                                    <h4 style={{ marginBottom: '.7rem' }}>Add Thans</h4>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', minWidth: 900 }}>
                                            <thead><tr style={{ background: 'var(--color-surface-offset)' }}>
                                                {['Code *','Type *','Color','Design','GSM','Meters *','Cost/m *','Sell/m *','Margin%','Loc','Product',''].map(h => <th key={h} style={{ padding: '6px 6px', textAlign:'left', whiteSpace:'nowrap' }}>{h}</th>)}
                                            </tr></thead>
                                            <tbody>
                                                {thanRows.map((row, idx) => {
                                                    const mp = marginPct(row.cost_per_meter, row.selling_price)
                                                    const inp = (field, ph, type='text') => (
                                                        <td style={{ padding: '4px 4px' }}>
                                                            <input type={type} step={type==='number'?'0.01':undefined} value={row[field]}
                                                                onChange={e => handleThanChange(idx, field, e.target.value)}
                                                                placeholder={ph}
                                                                style={{ width: '100%', minWidth: type==='number'?70:75, padding: '4px 6px', border: '1px solid var(--color-border)', borderRadius: 4, background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 13 }} />
                                                        </td>
                                                    )
                                                    return (
                                                        <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                            {inp('than_code','TC-001')}
                                                            {inp('fabric_type','Cotton')}
                                                            {inp('color','White')}
                                                            {inp('design','Plain')}
                                                            {inp('gsm','180','number')}
                                                            {inp('meter_length','50','number')}
                                                            {inp('cost_per_meter','0.00','number')}
                                                            {inp('selling_price','0.00','number')}
                                                            <td style={{ padding: '4px 4px', textAlign:'center', fontWeight:600, color: mp!==null?(Number(mp)>=20?'#16a34a':Number(mp)<10?'#ef4444':'#b45309'):'var(--color-text-muted)' }}>
                                                                {mp!==null?`${mp}%`:'-'}
                                                            </td>
                                                            {inp('warehouse_location','A1')}
                                                            <td style={{ padding: '4px 4px' }}>
                                                                <select value={row.product_id} onChange={e => handleThanChange(idx,'product_id',e.target.value)}
                                                                    style={{ width:'100%', minWidth:90, padding:'4px 4px', border:'1px solid var(--color-border)', borderRadius:4, background:'var(--color-surface)', color:'var(--color-text)', fontSize:12 }}>
                                                                    <option value="">-- none --</option>
                                                                    {products.map(p => <option key={p.product_id} value={p.product_id}>{p.product_name}</option>)}
                                                                </select>
                                                            </td>
                                                            <td style={{ padding: '4px 4px' }}>
                                                                {thanRows.length > 1 && <button onClick={() => removeThanRow(idx)} style={{ color:'#ef4444', background:'none', border:'none', cursor:'pointer', fontSize:16 }} title="Remove">×</button>}
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div style={{ marginTop: '.8rem', display: 'flex', gap: '.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <button className="btn btn-secondary" style={{ fontSize:13 }} onClick={addThanRow}>+ Add Row</button>
                                        <button className="btn btn-primary" style={{ fontSize:13 }} onClick={() => handleSubmitThans(bale.bale_id)} disabled={submittingThan}>
                                            {submittingThan ? 'Saving...' : `Save ${thanRows.length} Than(s)`}
                                        </button>
                                    </div>
                                    {thanError   && <p style={{ color:'var(--color-error)',   marginTop:'.6rem' }}>{thanError}</p>}
                                    {thanSuccess && <p style={{ color:'var(--color-success)', marginTop:'.6rem' }}>{thanSuccess}</p>}
                                </div>
                            )}
                        </div>
                    ))
                }
            </section>
        </div>
    )
}

import { useEffect, useState } from 'react'
import API from '../api'

const EMPTY = {
    supplier_name: '', factory_name: '', product_specialization: '',
    quality_rating: '', delay_frequency: 'medium', price_range: '',
    popular_categories: '', return_issues: '', trend_alignment: 'average'
}

export default function SupplierManager() {
    const [suppliers, setSuppliers] = useState([])
    const [form, setForm]           = useState(EMPTY)
    const [editId, setEditId]       = useState(null)
    const [toast, setToast]         = useState(null)
    const [loading, setLoading]     = useState(false)

    const load = () =>
        API.get('/suppliers/full').then(r => setSuppliers(r.data)).catch(() => {})

    useEffect(() => { load() }, [])

    const showToast = (msg, type) => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3500)
    }

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

    const handleSave = async () => {
        if (!form.supplier_name.trim())
            return showToast('Supplier name is required', 'error')
        setLoading(true)
        try {
            const payload = {
                ...form,
                quality_rating: form.quality_rating ? parseFloat(form.quality_rating) : null
            }
            const res = editId
                ? await API.put(`/suppliers/${editId}`, payload)
                : await API.post('/suppliers', payload)
            if (res.data.success || res.data.supplier_id) {
                showToast(editId ? 'Supplier updated!' : 'Supplier added!', 'success')
                setForm(EMPTY)
                setEditId(null)
                load()
            } else showToast(res.data.error || 'Failed', 'error')
        } catch (err) {
            showToast(err.response?.data?.error || 'Request failed', 'error')
        } finally { setLoading(false) }
    }

    const handleEdit = (s) => {
        setEditId(s.supplier_id)
        setForm({
            supplier_name:          s.supplier_name || '',
            factory_name:           s.factory_name || '',
            product_specialization: s.product_specialization || '',
            quality_rating:         s.quality_rating ?? '',
            delay_frequency:        s.delay_frequency || 'medium',
            price_range:            s.price_range || '',
            popular_categories:     s.popular_categories || '',
            return_issues:          s.return_issues || '',
            trend_alignment:        s.trend_alignment || 'average'
        })
    }

    const handleDelete = async (id) => {
        if (!confirm('Delete this supplier? This cannot be undone.')) return
        try {
            await API.delete(`/suppliers/${id}`)
            showToast('Supplier deleted', 'success')
            load()
        } catch (err) {
            const msg = err.response?.data?.error || 'Delete failed'
            showToast(msg.includes('foreign key') ? 'Cannot delete: supplier has linked bales.' : msg, 'error')
        }
    }

    const ratingColor = (r) => {
        if (!r) return ''
        if (r >= 4.5) return '#15803d'
        if (r >= 3.5) return '#ca8a04'
        return '#dc2626'
    }

    return (
        <div className="card">
            <h2>Supplier Intelligence</h2>
            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

            {/* ── Form ── */}
            <div style={{ background: 'var(--color-surface, #f9f9f9)', border: '1px solid #e2e8f0', borderRadius: 8, padding: '18px 20px', marginBottom: 24 }}>
                <h3 style={{ marginBottom: 14, fontSize: 15 }}>{editId ? 'Edit Supplier' : 'Add New Supplier'}</h3>
                <div className="form-grid">
                    <div className="form-group">
                        <label>Supplier Name *</label>
                        <input value={form.supplier_name} placeholder="e.g. Surat Premium Looms"
                            onChange={e => set('supplier_name', e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label>Factory Name</label>
                        <input value={form.factory_name} placeholder="e.g. SPL Unit 4"
                            onChange={e => set('factory_name', e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label>Specialization</label>
                        <input value={form.product_specialization} placeholder="e.g. Cotton prints and shirting"
                            onChange={e => set('product_specialization', e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label>Price Range</label>
                        <input value={form.price_range} placeholder="e.g. NPR 55-120/m"
                            onChange={e => set('price_range', e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label>Quality Rating (0–5)</label>
                        <input type="number" min="0" max="5" step="0.1" value={form.quality_rating}
                            placeholder="e.g. 4.3"
                            onChange={e => set('quality_rating', e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label>Delay Frequency</label>
                        <select value={form.delay_frequency} onChange={e => set('delay_frequency', e.target.value)}>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Trend Alignment</label>
                        <select value={form.trend_alignment} onChange={e => set('trend_alignment', e.target.value)}>
                            <option value="weak">Weak</option>
                            <option value="average">Average</option>
                            <option value="strong">Strong</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Popular Categories</label>
                        <input value={form.popular_categories} placeholder="e.g. Cotton, Shirting"
                            onChange={e => set('popular_categories', e.target.value)} />
                    </div>
                </div>
                <div className="form-group" style={{ marginTop: 8 }}>
                    <label>Return Issues</label>
                    <input value={form.return_issues} placeholder="e.g. Low shrinkage complaints"
                        onChange={e => set('return_issues', e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                        {loading ? 'Saving…' : editId ? 'Update Supplier' : 'Add Supplier'}
                    </button>
                    {editId && (
                        <button className="btn btn-logout" onClick={() => { setEditId(null); setForm(EMPTY) }}>Cancel</button>
                    )}
                </div>
            </div>

            {/* ── Table ── */}
            <table>
                <thead>
                    <tr>
                        <th>Supplier</th><th>Factory</th><th>Specialization</th>
                        <th>Quality</th><th>Delays</th><th>Trend</th><th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {suppliers.length === 0 && (
                        <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>No suppliers yet. Add one above.</td></tr>
                    )}
                    {suppliers.map(s => (
                        <tr key={s.supplier_id}>
                            <td><strong>{s.supplier_name}</strong></td>
                            <td>{s.factory_name || '—'}</td>
                            <td style={{ fontSize: 13, color: '#64748b' }}>{s.product_specialization || '—'}</td>
                            <td style={{ color: ratingColor(s.quality_rating), fontWeight: 600 }}>
                                {s.quality_rating ? `${Number(s.quality_rating).toFixed(1)} / 5` : '—'}
                            </td>
                            <td><span className={`badge badge-${s.delay_frequency}`}>{s.delay_frequency}</span></td>
                            <td><span className={`badge badge-${s.trend_alignment}`}>{s.trend_alignment}</span></td>
                            <td style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-accept" onClick={() => handleEdit(s)}>Edit</button>
                                <button className="btn btn-decline" onClick={() => handleDelete(s.supplier_id)}>Delete</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

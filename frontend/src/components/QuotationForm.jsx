/**
 * QuotationForm.jsx — Create Quotation
 * Added: preview modal (slide-in), polished dealer theme, inline toast.
 * Logic (API calls, VAT, WhatsApp) unchanged.
 */
import { useEffect, useState } from 'react'
import API from '../api'

export default function QuotationForm({ user }) {
    const [products, setProducts]     = useState([])
    const [retailers, setRetailers]   = useState([])
    const [retailerId, setRetailerId] = useState('')
    const [items, setItems]           = useState([{ product_id: '', product_name: '', quantity: '', unit_price: 0 }])
    const [toast, setToast]           = useState(null)
    const [loading, setLoading]       = useState(false)
    const [preview, setPreview]       = useState(false)   // ← preview modal

    useEffect(() => {
        API.get('/products').then(r => setProducts(r.data)).catch(() => {})
        API.get('/retailers').then(r => setRetailers(r.data)).catch(() => {})
    }, [])

    const showToast = (msg, type) => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 4500)
    }

    const addItem    = () => setItems([...items, { product_id: '', product_name: '', quantity: '', unit_price: 0 }])
    const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i))
    const updateItem = (i, field, value) => {
        const updated = [...items]
        updated[i][field] = value
        if (field === 'product_id') {
            const p = products.find(p => String(p.product_id) === String(value))
            if (p) {
                updated[i].unit_price   = Number(p.base_price)
                updated[i].product_name = p.product_name
            }
        }
        setItems(updated)
    }

    const subtotal   = items.reduce((sum, i) => sum + (i.unit_price * (parseFloat(i.quantity) || 0)), 0)
    const vat        = subtotal * 0.13
    const grandTotal = subtotal + vat

    const selectedRetailer = retailers.find(r => String(r.retailer_id) === String(retailerId))
    const contact_phone    = selectedRetailer?.phone || selectedRetailer?.contact_phone || null
    const validItems       = items.filter(i => i.product_id && parseFloat(i.quantity) > 0)

    const handlePreview = (e) => {
        e.preventDefault()
        if (!retailerId)       return showToast('Please select a customer / dealer.', 'error')
        if (!validItems.length) return showToast('Add at least one product with quantity.', 'error')
        setPreview(true)
    }

    const handleSubmit = async () => {
        const customer_name = selectedRetailer?.shop_name || `Customer #${retailerId}`
        setLoading(true)
        setPreview(false)
        try {
            const res = await API.post('/quotations', {
                user_id:       user?.user_id ?? null,
                customer_name,
                contact_phone,
                grand_total:   grandTotal,
                items: validItems.map(i => ({
                    product_id:         Number(i.product_id),
                    product_name:       i.product_name,
                    quantity:           parseFloat(i.quantity),
                    unit_price_at_time: i.unit_price,
                    unit_price:         i.unit_price,
                    line_total:         i.unit_price * parseFloat(i.quantity),
                }))
            })
            if (res.data.success) {
                const waMsg = contact_phone
                    ? ` WhatsApp notification sent to ${contact_phone}.`
                    : ' (No phone — WhatsApp skipped.)'
                showToast(`✅ Quotation ${res.data.quotation_number} created!${waMsg}`, 'success')
                setRetailerId('')
                setItems([{ product_id: '', product_name: '', quantity: '', unit_price: 0 }])
            } else {
                showToast(res.data.error || 'Something went wrong.', 'error')
            }
        } catch (err) {
            if (err?.response?.status === 401) return showToast('Session expired — please log in again.', 'error')
            if (err?.response?.status === 403) return showToast('You do not have permission to create quotations.', 'error')
            showToast(err?.response?.data?.error || 'Could not connect to server.', 'error')
        }
        setLoading(false)
    }

    return (
        <div className="kt-card">
            <h2 style={{ color: 'var(--kt-primary)', marginTop: 0, marginBottom: 6 }}>Create Quotation</h2>
            <p style={{ color: 'var(--kt-text-muted)', fontSize: 13, marginBottom: 24 }}>
                Select a dealer and add fabric products to generate a quotation.
            </p>

            {toast && <div className={`kt-toast kt-toast-${toast.type}`}>{toast.msg}</div>}

            <form onSubmit={handlePreview}>
                {/* Customer select */}
                <div className="kt-form-group" style={{ maxWidth: 400 }}>
                    <label>Customer / Dealer <span style={{ color: 'var(--kt-danger)' }}>*</span></label>
                    <select value={retailerId} onChange={e => setRetailerId(e.target.value)}>
                        <option value="">Select customer…</option>
                        {retailers.map(r => (
                            <option key={r.retailer_id} value={r.retailer_id}>
                                {r.shop_name}{r.phone ? ` — ${r.phone}` : ''}
                            </option>
                        ))}
                    </select>
                    {retailerId && (
                        <p style={{ fontSize: 12, marginTop: 4, color: contact_phone ? 'var(--kt-success)' : 'var(--kt-danger)' }}>
                            {contact_phone
                                ? `✅ WhatsApp will be sent to ${contact_phone}`
                                : '⚠️ No phone number — WhatsApp notification will be skipped'}
                        </p>
                    )}
                </div>

                {/* Product rows */}
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--kt-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Products</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                    {items.map((item, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <select
                                style={{ flex: '2 1 200px', border: '1.5px solid var(--kt-border)', borderRadius: 'var(--kt-radius-sm)', padding: '9px 12px', fontSize: 14, color: 'var(--kt-text)', background: 'var(--kt-surface)', outline: 'none' }}
                                value={item.product_id}
                                onChange={e => updateItem(i, 'product_id', e.target.value)}
                            >
                                <option value="">Select Product</option>
                                {products.map(p => (
                                    <option key={p.product_id} value={p.product_id}>
                                        {p.product_name} — NPR {Number(p.base_price).toFixed(2)}/m
                                    </option>
                                ))}
                            </select>
                            <input
                                type="number"
                                placeholder="Qty (metres)"
                                value={item.quantity}
                                min="0"
                                step="0.5"
                                onChange={e => updateItem(i, 'quantity', e.target.value)}
                                style={{ flex: '1 1 120px', border: '1.5px solid var(--kt-border)', borderRadius: 'var(--kt-radius-sm)', padding: '9px 12px', fontSize: 14, color: 'var(--kt-text)', background: 'var(--kt-surface)', outline: 'none' }}
                            />
                            {item.unit_price > 0 && item.quantity > 0 && (
                                <span style={{ fontSize: 13, color: 'var(--kt-text-muted)', minWidth: 100 }}>
                                    NPR {(item.unit_price * parseFloat(item.quantity)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                            )}
                            {items.length > 1 && (
                                <button type="button" className="kt-btn kt-btn-sm" onClick={() => removeItem(i)}
                                    style={{ background: '#fdf2f2', color: 'var(--kt-danger)', border: '1px solid #f5b7b1', borderRadius: 'var(--kt-radius-sm)' }}>
                                    ✕ Remove
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                <button type="button" className="kt-btn kt-btn-secondary kt-btn-sm" onClick={addItem} style={{ marginBottom: 20 }}>
                    + Add Product
                </button>

                {/* Amount summary */}
                {subtotal > 0 && (
                    <div style={{ background: 'var(--kt-surface-2)', border: '1px solid var(--kt-border)', borderRadius: 'var(--kt-radius-md)', padding: '16px 20px', maxWidth: 320, marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--kt-text-muted)', marginBottom: 8 }}>
                            <span>Subtotal</span>
                            <span>NPR {subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--kt-text-muted)', marginBottom: 10 }}>
                            <span>VAT (13%)</span>
                            <span>NPR {vat.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, color: 'var(--kt-primary)', borderTop: '1px solid var(--kt-border)', paddingTop: 10 }}>
                            <span>Grand Total</span>
                            <span>NPR {grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>
                )}

                <button className="kt-btn kt-btn-primary" type="submit" disabled={loading}>
                    {loading ? '⏳ Creating…' : '👁 Preview & Generate'}
                </button>
            </form>

            {/* ── Preview Modal ──────────────────────────────────────── */}
            {preview && (
                <div className="kt-modal-overlay" onClick={() => setPreview(false)}>
                    <div className="kt-modal" onClick={e => e.stopPropagation()}>
                        <div className="kt-modal-header">
                            <h3>Quotation Preview</h3>
                            <button className="kt-modal-close" onClick={() => setPreview(false)}>✕</button>
                        </div>
                        <div className="kt-modal-body">
                            <p style={{ marginBottom: 12, fontSize: 14 }}>
                                <strong>Customer:</strong> {selectedRetailer?.shop_name}
                                {contact_phone && <span style={{ color: 'var(--kt-success)', marginLeft: 8 }}>📱 {contact_phone}</span>}
                            </p>
                            <table className="kt-table" style={{ marginBottom: 16 }}>
                                <thead>
                                    <tr><th>Product</th><th>Qty (m)</th><th>Unit Price</th><th>Line Total</th></tr>
                                </thead>
                                <tbody>
                                    {validItems.map((item, i) => (
                                        <tr key={i}>
                                            <td>{item.product_name}</td>
                                            <td>{item.quantity}</td>
                                            <td>NPR {Number(item.unit_price).toFixed(2)}</td>
                                            <td>NPR {(item.unit_price * parseFloat(item.quantity)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--kt-text-muted)' }}>
                                <div>Subtotal: NPR {subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                                <div>VAT (13%): NPR {vat.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--kt-primary)', marginTop: 6 }}>
                                    Grand Total: NPR {grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                        </div>
                        <div className="kt-modal-footer">
                            <button className="kt-btn kt-btn-secondary" onClick={() => setPreview(false)}>Edit</button>
                            <button className="kt-btn kt-btn-primary" onClick={handleSubmit} disabled={loading}>
                                {loading ? '⏳ Submitting…' : '✅ Confirm & Submit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

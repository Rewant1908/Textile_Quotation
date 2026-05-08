import { useEffect, useState } from 'react'
import API from '../api'

export default function QuotationForm({ user }) {
    const [products, setProducts]     = useState([])
    const [customerId, setCustomerId] = useState('')
    const [items, setItems]           = useState([{ product_id: '', quantity: '' }])
    const [toast, setToast]           = useState(null)
    const [loading, setLoading]       = useState(false)

    useEffect(() => {
        // Bug 1 fix: was `fetch(`${API}/api/products`)` — now using axios instance
        API.get('/products').then(r => setProducts(r.data)).catch(() => {})
    }, [])

    const showToast = (msg, type) => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 4000)
    }

    const addItem    = () => setItems([...items, { product_id: '', quantity: '' }])
    const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i))
    const updateItem = (i, field, value) => {
        const updated = [...items]
        updated[i][field] = value
        setItems(updated)
    }

    const getPrice = (product_id) => {
        const p = products.find(p => String(p.product_id) === String(product_id))
        return p ? Number(p.base_price) : 0
    }

    const subtotal   = items.reduce((sum, item) => sum + (getPrice(item.product_id) * (parseFloat(item.quantity) || 0)), 0)
    const vat        = subtotal * 0.13
    const grandTotal = subtotal + vat

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!customerId) return showToast('Customer ID is required.', 'error')
        const validItems = items.filter(i => i.product_id && i.quantity > 0)
        if (validItems.length === 0) return showToast('Add at least one product with quantity.', 'error')
        setLoading(true)
        try {
            // Bug 1 fix: was `fetch(`${API}/api/create-quotation`, ...)` — now using axios instance
            const res = await API.post('/create-quotation', {
                customer_id: Number(customerId),
                user_id:     user?.user_id ?? null,
                items:       validItems.map(i => ({
                    product_id: Number(i.product_id),
                    quantity:   parseFloat(i.quantity)
                }))
            })
            const data = res.data
            if (data.success) {
                showToast(`Quotation #${data.quotation_id} created! Status: Pending admin approval.`, 'success')
                setCustomerId('')
                setItems([{ product_id: '', quantity: '' }])
            } else {
                showToast(data.error || 'Something went wrong.', 'error')
            }
        } catch (err) {
            showToast(err?.response?.data?.error || 'Could not connect to server.', 'error')
        }
        setLoading(false)
    }

    return (
        <div className="card">
            <h2>Create Quotation</h2>
            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
            <form onSubmit={handleSubmit}>
                <div className="form-group" style={{ marginBottom: '20px', maxWidth: '300px' }}>
                    <label>Customer ID *</label>
                    <input
                        type="number"
                        placeholder="Enter Customer ID"
                        value={customerId}
                        onChange={e => setCustomerId(e.target.value)}
                    />
                </div>
                <label style={{ fontSize: '13px', color: '#94a3b8' }}>Products</label>
                <div className="items-list">
                    {items.map((item, i) => (
                        <div className="item-row" key={i}>
                            <select value={item.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)}>
                                <option value="">Select Product</option>
                                {products.map(p => (
                                    <option key={p.product_id} value={p.product_id}>
                                        {p.product_name} - NPR {Number(p.base_price).toFixed(2)}/m
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
                            />
                            {items.length > 1 && (
                                <button type="button" className="btn btn-danger" onClick={() => removeItem(i)}>Remove</button>
                            )}
                        </div>
                    ))}
                </div>
                <button type="button" className="btn-add" onClick={addItem}>+ Add Product</button>
                {subtotal > 0 && (
                    <div className="amount-box">
                        <div className="amount-row"><span>Subtotal</span><span>NPR {subtotal.toFixed(2)}</span></div>
                        <div className="amount-row"><span>VAT (13%)</span><span>NPR {vat.toFixed(2)}</span></div>
                        <div className="amount-row total"><span>Grand Total</span><span>NPR {grandTotal.toFixed(2)}</span></div>
                    </div>
                )}
                <div className="form-actions">
                    <button className="btn btn-primary" type="submit" disabled={loading}>
                        {loading ? 'Creating...' : 'Create Quotation'}
                    </button>
                </div>
            </form>
        </div>
    )
}

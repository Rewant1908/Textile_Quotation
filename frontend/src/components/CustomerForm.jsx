import { useState } from 'react'
import API from '../api'

export default function CustomerForm() {
    const [form, setForm] = useState({ shop_name: '', phone: '', email: '' })
    const [toast, setToast] = useState(null)
    const [loading, setLoading] = useState(false)

    const showToast = (msg, type) => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 4000)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.shop_name.trim()) return showToast('Dealer / Firm name is required.', 'error')
        setLoading(true)
        try {
            const res = await API.post('/retailers', {
                shop_name:    form.shop_name.trim(),
                phone:        form.phone.trim() || null,
                contact_person: null,
                market_location: null,
                notes:        form.email.trim() ? `Email: ${form.email.trim()}` : null,
            })
            const data = res.data
            if (data.success) {
                showToast(`Dealer registered! ID: ${data.retailer_id}`, 'success')
                setForm({ shop_name: '', phone: '', email: '' })
            } else {
                showToast(data.error || 'Something went wrong.', 'error')
            }
        } catch (err) {
            const msg = err?.response?.data?.error
            if (err?.response?.status === 401) return showToast('Session expired — please log in again.', 'error')
            if (err?.response?.status === 403) return showToast('You do not have permission to register dealers.', 'error')
            showToast(msg || 'Could not connect to server.', 'error')
        }
        setLoading(false)
    }

    return (
        <div className="card">
            <h2>Register Dealer</h2>
            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
            <form onSubmit={handleSubmit}>
                <div className="form-grid">
                    <div className="form-group full">
                        <label>Dealer / Firm Name *</label>
                        <input
                            type="text"
                            placeholder="e.g. Rajesh Textiles"
                            value={form.shop_name}
                            onChange={e => setForm({ ...form, shop_name: e.target.value })}
                        />
                    </div>
                    <div className="form-group">
                        <label>Contact Phone</label>
                        <input
                            type="text"
                            placeholder="e.g. 9876543210"
                            value={form.phone}
                            onChange={e => setForm({ ...form, phone: e.target.value })}
                        />
                    </div>
                    <div className="form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            placeholder="e.g. raj@example.com"
                            value={form.email}
                            onChange={e => setForm({ ...form, email: e.target.value })}
                        />
                    </div>
                </div>
                <div className="form-actions">
                    <button className="btn btn-primary" type="submit" disabled={loading}>
                        {loading ? 'Registering...' : 'Register Customer'}
                    </button>
                </div>
            </form>
        </div>
    )
}

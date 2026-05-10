/**
 * CustomerForm.jsx — Dealer Registration
 * Polished with dealer theme classes. Logic unchanged.
 */
import { useState } from 'react'
import API from '../api'

export default function CustomerForm() {
    const [form, setForm]     = useState({ shop_name: '', phone: '', email: '' })
    const [toast, setToast]   = useState(null)
    const [loading, setLoading] = useState(false)

    const showToast = (msg, type) => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 4500)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.shop_name.trim()) return showToast('Dealer / Firm name is required.', 'error')
        if (form.phone && !/^[0-9+\-\s]{7,15}$/.test(form.phone.trim()))
            return showToast('Enter a valid phone number (7–15 digits).', 'error')
        if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
            return showToast('Enter a valid email address.', 'error')

        setLoading(true)
        try {
            const res = await API.post('/retailers', {
                shop_name:       form.shop_name.trim(),
                phone:           form.phone.trim() || null,
                contact_person:  null,
                market_location: null,
                notes:           form.email.trim() ? `Email: ${form.email.trim()}` : null,
            })
            const data = res.data
            if (data.success) {
                showToast(`✅ Dealer registered! ID: ${data.retailer_id}`, 'success')
                setForm({ shop_name: '', phone: '', email: '' })
            } else {
                showToast(data.error || 'Something went wrong.', 'error')
            }
        } catch (err) {
            if (err?.response?.status === 401) return showToast('Session expired — please log in again.', 'error')
            if (err?.response?.status === 403) return showToast('You do not have permission to register dealers.', 'error')
            showToast(err?.response?.data?.error || 'Could not connect to server.', 'error')
        }
        setLoading(false)
    }

    return (
        <div className="kt-card">
            <h2 style={{ color: 'var(--kt-primary)', marginTop: 0, marginBottom: 6 }}>Dealer Registration</h2>
            <p style={{ color: 'var(--kt-text-muted)', fontSize: 13, marginBottom: 24 }}>
                Register a new dealer or retail firm to associate with quotations.
            </p>

            {toast && (
                <div className={`kt-toast kt-toast-${toast.type}`}>{toast.msg}</div>
            )}

            <form onSubmit={handleSubmit}>
                <div className="kt-form-group" style={{ maxWidth: 480 }}>
                    <label>Dealer / Firm Name <span style={{ color: 'var(--kt-danger)' }}>*</span></label>
                    <input
                        type="text"
                        placeholder="e.g. Rajesh Textiles"
                        value={form.shop_name}
                        onChange={e => setForm({ ...form, shop_name: e.target.value })}
                        autoFocus
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 480 }}>
                    <div className="kt-form-group">
                        <label>Contact Phone</label>
                        <input
                            type="tel"
                            placeholder="e.g. 9876543210"
                            value={form.phone}
                            onChange={e => setForm({ ...form, phone: e.target.value })}
                        />
                    </div>
                    <div className="kt-form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            placeholder="e.g. raj@example.com"
                            value={form.email}
                            onChange={e => setForm({ ...form, email: e.target.value })}
                        />
                    </div>
                </div>

                <div style={{ marginTop: 8 }}>
                    <button className="kt-btn kt-btn-primary" type="submit" disabled={loading}>
                        {loading ? '⏳ Registering…' : '✚ Register Dealer'}
                    </button>
                </div>
            </form>
        </div>
    )
}

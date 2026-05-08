import { useCallback, useEffect, useState } from 'react'
import API from '../api'

const STATUS_COLORS = {
    pending:  { bg: '#78350f44', color: '#fbbf24', border: '#f59e0b55' },
    accepted: { bg: '#06524444', color: '#34d399', border: '#10b98155' },
    declined: { bg: '#7f1d1d44', color: '#f87171', border: '#ef444455' },
}

export default function QuotationHistory({ user }) {
    const [quotations, setQuotations] = useState([])
    const [loading, setLoading]       = useState(true)
    const [selected, setSelected]     = useState(null)
    const [detail, setDetail]         = useState(null)
    const [declineId, setDeclineId]   = useState(null)
    const [reason, setReason]         = useState('')
    const [toast, setToast]           = useState(null)

    const isAdmin = user?.role === 'admin'

    const showToast = (msg, type) => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3500)
    }

    // Bug 1 fix: replaced all `fetch(`${API}/api/...`)` with API.get/patch — API is axios instance
    const load = useCallback(() => {
        API.get('/quotations', { params: { user_id: user.user_id } })
            .then(r => { setQuotations(Array.isArray(r.data) ? r.data : []); setLoading(false) })
            .catch(() => setLoading(false))
    }, [user.user_id])

    useEffect(() => { load() }, [load])

    const viewDetail = async (id) => {
        if (selected === id) { setSelected(null); setDetail(null); return }
        setSelected(id)
        try {
            const r = await API.get(`/quotations/${id}`)
            setDetail(r.data)
        } catch { setDetail(null) }
    }

    const updateStatus = async (id, status, decline_reason = null) => {
        try {
            const r = await API.patch(`/quotations/${id}/status`, {
                status,
                decline_reason,
                user_id: user?.user_id
            })
            if (r.data?.error) { showToast(r.data.error, 'error'); return }
        } catch (err) {
            showToast(err?.response?.data?.error || 'Action failed', 'error')
            return
        }
        setDeclineId(null)
        setReason('')
        load()
    }

    if (loading) return <div className="loading">Loading quotations...</div>

    return (
        <div className="card">
            <h2>{isAdmin ? 'All Quotation Requests' : 'My Quotations'}</h2>
            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
            <table>
                <thead>
                <tr>
                    <th>ID</th>
                    <th>Customer</th>
                    {isAdmin && <th>Raised By</th>}
                    <th>Phone</th>
                    <th>Subtotal</th>
                    <th>Grand Total</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th>Action</th>
                </tr>
                </thead>
                <tbody>
                {quotations.map(q => {
                    const s = STATUS_COLORS[q.status] || STATUS_COLORS.pending
                    return (
                        <>
                            <tr key={`row-${q.quotation_id}`}>
                                <td>#{q.quotation_id}</td>
                                <td>{q.customer_name}</td>
                                {isAdmin && <td style={{ color: '#94a3b8' }}>{q.username || '-'}</td>}
                                <td>{q.contact_phone || '-'}</td>
                                <td>NPR {Number(q.total_amount).toFixed(2)}</td>
                                <td className="price-accent">NPR {Number(q.grand_total).toFixed(2)}</td>
                                <td>
                                    <span className="badge" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                                        {q.status}
                                    </span>
                                </td>
                                <td>{new Date(q.created_at).toLocaleDateString('en-IN')}</td>
                                <td style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    <button className="btn btn-danger" onClick={() => viewDetail(q.quotation_id)}>
                                        {selected === q.quotation_id ? 'Close' : 'View'}
                                    </button>
                                    {isAdmin && q.status === 'pending' && (
                                        <>
                                            <button className="btn btn-accept" onClick={() => updateStatus(q.quotation_id, 'accepted')}>Accept</button>
                                            <button className="btn btn-decline" onClick={() => { setDeclineId(q.quotation_id); setReason('') }}>Decline</button>
                                        </>
                                    )}
                                    {isAdmin && q.status !== 'pending' && (
                                        <button className="btn btn-reset" onClick={() => updateStatus(q.quotation_id, 'pending')}>Reset</button>
                                    )}
                                </td>
                            </tr>

                            {isAdmin && declineId === q.quotation_id && (
                                <tr key={`decline-${q.quotation_id}`}>
                                    <td colSpan={isAdmin ? 9 : 8}>
                                        <div className="decline-box">
                                            <p className="decline-label">Provide a reason for declining Quotation #{q.quotation_id}:</p>
                                            <textarea
                                                className="decline-textarea"
                                                placeholder="e.g. Quantity exceeds current stock, incorrect fabric type requested..."
                                                value={reason}
                                                onChange={e => setReason(e.target.value)}
                                                rows={3}
                                            />
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                                                <button className="btn btn-decline"
                                                    onClick={() => updateStatus(q.quotation_id, 'declined', reason)}
                                                    disabled={!reason.trim()}>
                                                    Confirm Decline
                                                </button>
                                                <button className="btn btn-reset" onClick={() => { setDeclineId(null); setReason('') }}>
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {!isAdmin && q.status === 'declined' && q.decline_reason && (
                                <tr key={`reason-${q.quotation_id}`}>
                                    <td colSpan={8}>
                                        <div className="decline-reason-box">
                                            <span className="decline-reason-label">Reason for Decline:</span>
                                            <span className="decline-reason-text">{q.decline_reason}</span>
                                        </div>
                                    </td>
                                </tr>
                            )}

                            {selected === q.quotation_id && detail && (
                                <tr key={`detail-${q.quotation_id}`}>
                                    <td colSpan={isAdmin ? 9 : 8}>
                                        <div className="detail-panel">
                                            <h3>Line Items - Quotation #{detail.quotation_id}</h3>
                                            <table>
                                                <thead><tr><th>Product</th><th>Category</th><th>Qty (m)</th><th>Unit Price</th><th>Line Total</th></tr></thead>
                                                <tbody>
                                                {detail.items?.map((item, i) => (
                                                    <tr key={i}>
                                                        <td>{item.product_name}</td>
                                                        <td><span className={`badge badge-${item.category?.toLowerCase().replace(' ', '-')}`}>{item.category}</span></td>
                                                        <td>{item.quantity} m</td>
                                                        <td>NPR {Number(item.unit_price_at_time).toFixed(2)}</td>
                                                        <td>NPR {Number(item.line_total).toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                                </tbody>
                                            </table>
                                            {detail.decline_reason && (
                                                <div className="decline-reason-box" style={{ marginTop: '12px' }}>
                                                    <span className="decline-reason-label">Decline Reason:</span>
                                                    <span className="decline-reason-text">{detail.decline_reason}</span>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </>
                    )
                })}
                </tbody>
            </table>
        </div>
    )
}

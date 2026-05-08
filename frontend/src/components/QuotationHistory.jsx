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

    // Bug 1 fix: was fetch(`${API}/api/quotations?user_id=...`) — [object Object]/api/...
    // All fetch() calls migrated to API.get() / API.patch() from the axios instance.
    const load = useCallback(() => {
        setLoading(true)
        API.get('/quotations', { params: { user_id: user.user_id } })
            .then(r => setQuotations(Array.isArray(r.data) ? r.data : []))
            .catch(() => showToast('Failed to load quotations.', 'error'))
            .finally(() => setLoading(false))
    }, [user.user_id])

    useEffect(() => { load() }, [load])

    const viewDetail = async (id) => {
        if (selected === id) { setSelected(null); setDetail(null); return }
        try {
            // Bug 1 fix: was fetch(`${API}/api/quotations/${id}`)
            const res = await API.get(`/quotations/${id}`)
            setDetail(res.data)
            setSelected(id)
        } catch {
            showToast('Failed to load detail.', 'error')
        }
    }

    const updateStatus = async (id, status, decline_reason = '') => {
        try {
            // Bug 1 fix: was fetch(`${API}/api/quotations/${id}/status`, { method: 'PATCH', ... })
            // Bug 3 fix: backend PATCH endpoint now has checkPermission('MANAGE_QUOTATION_STATUS');
            //            we send x-user-id so the middleware can verify the role.
            await API.patch(`/quotations/${id}/status`,
                { status, decline_reason },
                { headers: { 'x-user-id': String(user.user_id) } }
            )
            showToast(`Quotation #${id} marked ${status}.`, 'success')
            setDeclineId(null)
            load()
        } catch (err) {
            showToast(err?.response?.data?.error || 'Update failed.', 'error')
        }
    }

    if (loading) return <div className="loading">Loading quotations...</div>

    return (
        <div className="card">
            <h2>Quotation Requests</h2>
            {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
            <div style={{ overflowX: 'auto' }}>
                <table className="quotation-table">
                    <thead>
                        <tr>
                            <th>#</th><th>Customer</th><th>Total</th>
                            <th>Status</th><th>Created</th><th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {quotations.map(q => {
                            const sc = STATUS_COLORS[q.status] || STATUS_COLORS.pending
                            return (
                                <>
                                    <tr key={`row-${q.quotation_id}`}>
                                        <td>#{q.quotation_id}</td>
                                        <td>{q.customer_name}</td>
                                        <td>NPR {Number(q.grand_total ?? 0).toFixed(2)}</td>
                                        <td>
                                            <span style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                                                {q.status}
                                            </span>
                                        </td>
                                        <td>{q.created_at?.slice(0, 10)}</td>
                                        <td>
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
                                            <td colSpan={6}>
                                                <div className="decline-box">
                                                    <p className="decline-label">Provide a reason for declining Quotation #{q.quotation_id}:</p>
                                                    <textarea
                                                        value={reason}
                                                        onChange={e => setReason(e.target.value)}
                                                        rows={2}
                                                        placeholder="Enter reason..."
                                                        className="decline-textarea"
                                                    />
                                                    <div className="decline-actions">
                                                        <button className="btn btn-danger"
                                                            disabled={!reason.trim()}
                                                            onClick={() => updateStatus(q.quotation_id, 'declined', reason)}
                                                        >Confirm Decline</button>
                                                        <button className="btn" onClick={() => setDeclineId(null)}>Cancel</button>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}

                                    {selected === q.quotation_id && detail && (
                                        <tr key={`detail-${q.quotation_id}`}>
                                            <td colSpan={6}>
                                                <div className="detail-box">
                                                    <h3>Line Items - Quotation #{detail.quotation_id}</h3>
                                                    {detail.decline_reason && (
                                                        <p style={{ color: '#f87171', marginBottom: 8 }}>Reason: {detail.decline_reason}</p>
                                                    )}
                                                    <table className="detail-table">
                                                        <thead>
                                                            <tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Line Total</th></tr>
                                                        </thead>
                                                        <tbody>
                                                            {(detail.items || []).map((item, i) => (
                                                                <tr key={i}>
                                                                    <td>{item.product_name}</td>
                                                                    <td>{item.quantity}</td>
                                                                    <td>NPR {Number(item.unit_price).toFixed(2)}</td>
                                                                    <td>NPR {Number(item.line_total).toFixed(2)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
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
            {quotations.length === 0 && (
                <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px' }}>No quotations yet.</p>
            )}
        </div>
    )
}

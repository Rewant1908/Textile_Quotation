import { useState, useRef, useEffect, useCallback } from 'react'
import API from '../api'

const AGENTS = [
    { id: 'coordinator',  label: 'Coordinator',  emoji: '🧠', desc: 'Routes queries to the right agent' },
    { id: 'inventory',    label: 'Inventory',    emoji: '📦', desc: 'Stock levels, thans, bales' },
    { id: 'pricing',      label: 'Pricing',      emoji: '💰', desc: 'Quotation rates and margins' },
    { id: 'sales',        label: 'Sales',        emoji: '📈', desc: 'Sales trends and records' },
    { id: 'procurement',  label: 'Procurement',  emoji: '🚚', desc: 'Supplier and bale intake' },
    { id: 'retailer',     label: 'Retailer',     emoji: '🏪', desc: 'Retailer accounts and history' },
    { id: 'warehouse',    label: 'Warehouse',    emoji: '🏭', desc: 'Location and movement data' },
]

function renderMarkdown(text) {
    if (!text) return ''
    // Tables
    text = text.replace(
        /\|(.+)\|\n\|[-| :]+\|\n((\|.+\|\n?)+)/g,
        (_, header, rows) => {
            const ths = header.split('|').filter(Boolean).map(h => `<th>${h.trim()}</th>`).join('')
            const trs = rows.trim().split('\n').map(row => {
                const tds = row.split('|').filter(Boolean).map(c => `<td>${c.trim()}</td>`).join('')
                return `<tr>${tds}</tr>`
            }).join('')
            return `<div class="ac-table-wrap"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`
        }
    )
    // Bold
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Headers
    text = text.replace(/^### (.+)$/gm, '<h4>$1</h4>')
    text = text.replace(/^## (.+)$/gm, '<h3>$1</h3>')
    text = text.replace(/^# (.+)$/gm, '<h2>$1</h2>')
    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bullet lists
    text = text.replace(/^[*-] (.+)$/gm, '<li>$1</li>')
    text = text.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    // Line breaks
    text = text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')
    return `<p>${text}</p>`
}

export default function AgentChat({ user }) {
    const [agent,    setAgent]    = useState('coordinator')
    const [messages, setMessages] = useState([])
    const [query,    setQuery]    = useState('')
    const [loading,  setLoading]  = useState(false)
    const [error,    setError]    = useState(null)
    const bottomRef = useRef(null)
    const textareaRef = useRef(null)

    const authHeaders = useCallback(
        () => ({ 'x-user-id': String(user.user_id), 'x-user-role': user.role }),
        [user.user_id, user.role]
    )

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, loading])

    const sendMessage = useCallback(async () => {
        const text = query.trim()
        if (!text || loading) return

        const userMsg = { role: 'user', content: text, ts: Date.now() }
        setMessages(prev => [...prev, userMsg])
        setQuery('')
        setLoading(true)
        setError(null)

        const t0 = Date.now()
        try {
            const res = await API.post(
                '/agent/query',
                { agent, query: text },
                { headers: authHeaders() }
            )
            const data = res.data
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: data.response || data.message || JSON.stringify(data),
                agent:   data.agent   || agent,
                model:   data.model   || '',
                ms:      Date.now() - t0,
                ts:      Date.now(),
            }])
        } catch (err) {
            const msg = err?.response?.data?.error || err.message || 'Agent request failed'
            setError(msg)
            setMessages(prev => [...prev, {
                role: 'error',
                content: msg,
                ts: Date.now(),
            }])
        } finally {
            setLoading(false)
        }
    }, [agent, query, loading, authHeaders])

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    const clearChat = () => setMessages([])

    const selectedAgent = AGENTS.find(a => a.id === agent)

    return (
        <div className="ac-page">
            {/* ── Agent selector ── */}
            <div className="ac-agent-bar">
                {AGENTS.map(a => (
                    <button
                        key={a.id}
                        className={`ac-agent-pill ${agent === a.id ? 'ac-agent-pill--active' : ''}`}
                        onClick={() => setAgent(a.id)}
                        title={a.desc}
                    >
                        <span className="ac-agent-emoji">{a.emoji}</span>
                        <span>{a.label}</span>
                    </button>
                ))}
            </div>

            {/* ── Chat area ── */}
            <div className="ac-chat-wrap card">
                <div className="ac-chat-header">
                    <span className="ac-chat-title">
                        {selectedAgent?.emoji} {selectedAgent?.label} Agent
                    </span>
                    <span className="ac-chat-desc">{selectedAgent?.desc}</span>
                    {messages.length > 0 && (
                        <button className="btn btn-secondary ac-clear-btn" onClick={clearChat}>
                            Clear
                        </button>
                    )}
                </div>

                <div className="ac-messages">
                    {messages.length === 0 && !loading && (
                        <div className="ac-empty">
                            <span className="ac-empty-emoji">{selectedAgent?.emoji}</span>
                            <p>Ask the <strong>{selectedAgent?.label}</strong> agent anything about your business data.</p>
                            <p className="ac-empty-hint">Press <kbd>Enter</kbd> to send &nbsp;·&nbsp; <kbd>Shift+Enter</kbd> for new line</p>
                        </div>
                    )}

                    {messages.map((msg, i) => (
                        <div key={i} className={`ac-msg ac-msg--${msg.role}`}>
                            {msg.role === 'user' && (
                                <div className="ac-bubble ac-bubble--user">{msg.content}</div>
                            )}
                            {msg.role === 'assistant' && (
                                <div className="ac-bubble ac-bubble--assistant">
                                    <div
                                        className="ac-md"
                                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                                    />
                                    <div className="ac-meta">
                                        <span>{AGENTS.find(a => a.id === msg.agent)?.emoji || '🤖'} {msg.agent}</span>
                                        {msg.model && <span>· {msg.model}</span>}
                                        <span>· {(msg.ms / 1000).toFixed(1)}s</span>
                                    </div>
                                </div>
                            )}
                            {msg.role === 'error' && (
                                <div className="ac-bubble ac-bubble--error">{msg.content}</div>
                            )}
                        </div>
                    ))}

                    {loading && (
                        <div className="ac-msg ac-msg--assistant">
                            <div className="ac-bubble ac-bubble--assistant ac-thinking">
                                <span /><span /><span />
                            </div>
                        </div>
                    )}

                    <div ref={bottomRef} />
                </div>

                {/* ── Input ── */}
                <div className="ac-input-row">
                    <textarea
                        ref={textareaRef}
                        className="ac-textarea"
                        rows={2}
                        placeholder={`Ask the ${selectedAgent?.label} agent…`}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={loading}
                    />
                    <button
                        className="btn btn-primary ac-send-btn"
                        onClick={sendMessage}
                        disabled={loading || !query.trim()}
                    >
                        {loading ? '…' : 'Send'}
                    </button>
                </div>
            </div>
        </div>
    )
}

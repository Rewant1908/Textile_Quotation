import { useState, useRef, useEffect, useCallback } from 'react'
import API from '../api'

// ── Agent definitions ────────────────────────────────────────────────────────
const AGENTS = [
    { id: 'coordinator',       label: 'Coordinator',  emoji: '🧠', desc: 'Routes queries to the right specialist agent' },
    { id: 'inventory',         label: 'Inventory',    emoji: '📦', desc: 'Stock levels, thans, bales' },
    { id: 'pricing',           label: 'Pricing',      emoji: '💰', desc: 'Quotation rates and margins' },
    { id: 'sales',             label: 'Sales',        emoji: '📈', desc: 'Sales trends and records' },
    { id: 'procurement',       label: 'Procurement',  emoji: '🚚', desc: 'Supplier and bale intake' },
    { id: 'retailer',          label: 'Retailer',     emoji: '🏪', desc: 'Retailer accounts and history' },
    { id: 'warehouse',         label: 'Warehouse',    emoji: '🏭', desc: 'Location and movement data' },
    { id: 'quotation-summary', label: 'Quotation',    emoji: '📋', desc: 'Quotation summaries and history' },
]

// ── Generate a new session ID (UUID v4) ──────────────────────────────────────
function newSessionId() {
    return crypto.randomUUID()
}

// ── Lightweight markdown renderer ────────────────────────────────────────────
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
    // Italic
    text = text.replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Headers
    text = text.replace(/^### (.+)$/gm, '<h4>$1</h4>')
    text = text.replace(/^## (.+)$/gm, '<h3>$1</h3>')
    text = text.replace(/^# (.+)$/gm, '<h2>$1</h2>')
    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bullet lists
    text = text.replace(/^[*-] (.+)$/gm, '<li>$1</li>')
    text = text.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    // Paragraphs / line breaks
    text = text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')
    return `<p>${text}</p>`
}

// ── Suggested starter prompts per agent ──────────────────────────────────────
const STARTERS = {
    coordinator:       ['What is the current stock status?', 'Show me this week\'s sales summary', 'Which products are running low?'],
    inventory:         ['How many thans of cotton fabric are left?', 'List all low-stock items', 'What was added to stock this week?'],
    pricing:           ['What is the margin on our top product?', 'Show quotation rates for polyester', 'Which items have the highest markup?'],
    sales:             ['How many sales were recorded today?', 'Who are our top-selling retailers?', 'Show sales trend for last 30 days'],
    procurement:       ['What bales arrived this week?', 'List pending supplier orders', 'Which supplier delivers fastest?'],
    retailer:          ['Show all active retailer accounts', 'Which retailer has the most orders?', 'Find retailers in Ahmedabad'],
    warehouse:         ['Where is batch #WH-001 stored?', 'Show items by warehouse location', 'What moved out of the warehouse today?'],
    'quotation-summary': ['Show recent quotations', 'Which quotation is pending approval?', 'Summarise quotation #Q-042'],
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AgentChat({ user }) {
    const [agent,     setAgent]     = useState('coordinator')
    const [messages,  setMessages]  = useState([])
    const [query,     setQuery]     = useState('')
    const [loading,   setLoading]   = useState(false)
    const [sessionId, setSessionId] = useState(() => newSessionId())
    const [turns,     setTurns]     = useState(0)

    const bottomRef   = useRef(null)
    const textareaRef = useRef(null)

    // Auto-scroll to latest message
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, loading])

    // When the user switches agent → start a brand-new session automatically
    // (old session stays alive on the server until its TTL expires — no wasted DELETE)
    const handleAgentSwitch = (newAgent) => {
        if (newAgent === agent) return
        setAgent(newAgent)
        setMessages([])
        setSessionId(newSessionId())
        setTurns(0)
    }

    // ── Send a message ────────────────────────────────────────────────────────
    const sendMessage = useCallback(async (overrideText) => {
        const text = (overrideText ?? query).trim()
        if (!text || loading) return

        setMessages(prev => [...prev, { role: 'user', content: text, ts: Date.now() }])
        setQuery('')
        setLoading(true)

        const t0 = Date.now()
        try {
            const res = await API.post('/agents/chat', {
                agent,
                query: text,
                sessionId,          // ← session continuity
            })
            const data = res.data
            // Response: { agent, response, sessionId, turns, durationMs, model, provider }
            setTurns(data.turns ?? turns + 1)
            setMessages(prev => [...prev, {
                role:    'assistant',
                content: data.response || data.fullResponse || JSON.stringify(data),
                agent:   data.agent   || agent,
                model:   data.model   || '',
                provider: data.provider || '',
                ms:      Date.now() - t0,
                ts:      Date.now(),
            }])
        } catch (err) {
            const msg = err?.response?.data?.error || err.message || 'Agent request failed'
            setMessages(prev => [...prev, { role: 'error', content: msg, ts: Date.now() }])
        } finally {
            setLoading(false)
            textareaRef.current?.focus()
        }
    }, [agent, query, loading, sessionId, turns])

    // ── Clear / New Chat ──────────────────────────────────────────────────────
    const newChat = useCallback(async () => {
        // Tell server to drop the session (fire-and-forget — ok if it fails)
        try { await API.delete(`/agents/session/${sessionId}`) } catch (_) { /* ignore */ }
        setMessages([])
        setSessionId(newSessionId())
        setTurns(0)
        setQuery('')
        textareaRef.current?.focus()
    }, [sessionId])

    // ── Keyboard handler ─────────────────────────────────────────────────────
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
    }

    const selectedAgent = AGENTS.find(a => a.id === agent)
    const starters      = STARTERS[agent] || []

    return (
        <div className="ac-page">

            {/* ── Agent selector ── */}
            <div className="ac-agent-bar">
                {AGENTS.map(a => (
                    <button
                        key={a.id}
                        className={`ac-agent-pill ${agent === a.id ? 'ac-agent-pill--active' : ''}`}
                        onClick={() => handleAgentSwitch(a.id)}
                        title={a.desc}
                    >
                        <span className="ac-agent-emoji">{a.emoji}</span>
                        <span>{a.label}</span>
                    </button>
                ))}
            </div>

            {/* ── Chat card ── */}
            <div className="ac-chat-wrap card">

                {/* Header */}
                <div className="ac-chat-header">
                    <div className="ac-chat-header-left">
                        <span className="ac-chat-title">
                            {selectedAgent?.emoji} {selectedAgent?.label} Agent
                        </span>
                        <span className="ac-chat-desc">{selectedAgent?.desc}</span>
                    </div>
                    <div className="ac-chat-header-right">
                        {turns > 0 && (
                            <span className="ac-turn-badge" title="Messages in this conversation">
                                {turns} {turns === 1 ? 'turn' : 'turns'}
                            </span>
                        )}
                        {messages.length > 0 && (
                            <button className="btn btn-secondary ac-clear-btn" onClick={newChat}>
                                New Chat
                            </button>
                        )}
                    </div>
                </div>

                {/* Messages */}
                <div className="ac-messages">
                    {messages.length === 0 && !loading && (
                        <div className="ac-empty">
                            <span className="ac-empty-emoji">{selectedAgent?.emoji}</span>
                            <p>Ask the <strong>{selectedAgent?.label}</strong> agent anything about your business data.</p>
                            <p className="ac-empty-hint">
                                Press <kbd>Enter</kbd> to send &nbsp;·&nbsp; <kbd>Shift+Enter</kbd> for new line
                            </p>
                            {starters.length > 0 && (
                                <div className="ac-starters">
                                    {starters.map((s, i) => (
                                        <button
                                            key={i}
                                            className="ac-starter-btn"
                                            onClick={() => sendMessage(s)}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            )}
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
                                        {msg.model && <span>· {msg.model.replace('gemini-', 'Gemini ').replace('gpt-', 'GPT-')}</span>}
                                        <span>· {(msg.ms / 1000).toFixed(1)}s</span>
                                    </div>
                                </div>
                            )}
                            {msg.role === 'error' && (
                                <div className="ac-bubble ac-bubble--error">
                                    ⚠️ {msg.content}
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Typing indicator */}
                    {loading && (
                        <div className="ac-msg ac-msg--assistant">
                            <div className="ac-bubble ac-bubble--assistant ac-thinking">
                                <span /><span /><span />
                            </div>
                        </div>
                    )}

                    <div ref={bottomRef} />
                </div>

                {/* Input row */}
                <div className="ac-input-row">
                    <textarea
                        ref={textareaRef}
                        className="ac-textarea"
                        rows={2}
                        placeholder={`Ask the ${selectedAgent?.label} agent… (Enter to send)`}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={loading}
                    />
                    <button
                        className="btn btn-primary ac-send-btn"
                        onClick={() => sendMessage()}
                        disabled={loading || !query.trim()}
                        aria-label="Send message"
                    >
                        {loading ? '…' : '↑'}
                    </button>
                </div>

                {/* Session debug strip (only in dev) */}
                {import.meta.env.DEV && (
                    <div style={{ fontSize: 11, color: '#999', padding: '4px 16px', borderTop: '1px solid #eee' }}>
                        session: {sessionId.slice(0, 8)}… · {turns} turns
                    </div>
                )}
            </div>
        </div>
    )
}

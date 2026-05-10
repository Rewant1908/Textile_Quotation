// AgentChat.jsx — SSE-streaming multi-agent chat UI
// Consumes Server-Sent Events from POST /api/agents/chat and renders
// live tool-call steps, agent spawns, and the final markdown response.

import { useState, useRef, useEffect, useCallback } from 'react'
import API from '../api'

// ── Agent definitions ─────────────────────────────────────────────────────────
const AGENTS = [
  { id: 'coordinator', label: 'Coordinator', emoji: '🧠', desc: 'Routes to the right specialist and executes actions' },
  { id: 'inventory',   label: 'Inventory',   emoji: '📦', desc: 'Stock levels, thans, bales' },
  { id: 'quotation',   label: 'Quotation',   emoji: '📋', desc: 'Accept / reject / list quotations' },
  { id: 'product',     label: 'Product',     emoji: '🏷️',  desc: 'Add, update products and stock' },
  { id: 'retailer',    label: 'Retailer',    emoji: '🏪', desc: 'Retailer accounts and credit limits' },
  { id: 'warehouse',   label: 'Warehouse',   emoji: '🏭', desc: 'Intake bales, warehouse summary' },
  { id: 'sales',       label: 'Sales',       emoji: '📈', desc: 'Sales trends and records' },
]

const STARTERS = {
  coordinator: [
    'Accept quotation #3',
    'Show all pending quotations',
    'Add product White Poplin cotton at ₹45 per meter',
    'Which retailers have the highest outstanding balance?',
    'Update stock of bale #12 to 80 units',
  ],
  inventory:  ['How many thans of cotton are left?', 'List all low-stock bales', 'What was added this week?'],
  quotation:  ['List pending quotations', 'Accept quotation #5 with 5% discount', 'Reject quotation #7 — out of stock'],
  product:    ['List all products', 'Add a new product: Silk Georgette ₹120/meter', 'Update price of product #4 to ₹55'],
  retailer:   ['Show all retailers', 'Get details for retailer #2', 'Set credit limit of retailer #3 to ₹50000'],
  warehouse:  ['Warehouse summary', 'Intake 200 bales of polyester ₹30 purchase ₹45 sale', 'List recent intakes'],
  sales:      ['Sales trend last 30 days', 'Top 5 selling products', 'Revenue this month'],
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function newUUID() { return crypto.randomUUID() }

// Read JWT the same way api.js does — key is kt_impex_token
function getToken() {
  return localStorage.getItem('kt_impex_token') || ''
}

// Base URL the same way api.js computes it
function getBaseUrl() {
  return import.meta.env.VITE_API_URL
    ? import.meta.env.VITE_API_URL
    : 'http://localhost:5000'
}

function renderMarkdown(text) {
  if (!text) return ''
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
  text = text.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) => `<pre><code>${code.replace(/</g,'&lt;')}</code></pre>`)
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/\*(.+?)\*/g,     '<em>$1</em>')
  text = text.replace(/^### (.+)$/gm, '<h4>$1</h4>')
  text = text.replace(/^## (.+)$/gm,  '<h3>$1</h3>')
  text = text.replace(/^# (.+)$/gm,   '<h2>$1</h2>')
  text = text.replace(/`([^`]+)`/g,   '<code>$1</code>')
  text = text.replace(/^[*-] (.+)$/gm,'<li>$1</li>')
  text = text.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
  text = text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')
  return `<p>${text}</p>`
}

// ── Step bubble ───────────────────────────────────────────────────────────────
const STEP_ICONS = {
  thinking:          '💭',
  tool_call:         '🔧',
  tool_result:       '✅',
  tool_error:        '❌',
  spawn:             '🤖',
  spawn_complete:    '✓',
  coordinator_start: '🧠',
}

function StepBubble({ step }) {
  const icon = STEP_ICONS[step.type] || '•'
  let label = ''
  if      (step.type === 'thinking')           label = step.message
  else if (step.type === 'tool_call')          label = `Calling ${step.tool}(${JSON.stringify(step.args || {}).slice(0, 60)}…)`
  else if (step.type === 'tool_result')        label = `${step.tool} → ${JSON.stringify(step.result || {}).slice(0, 80)}…`
  else if (step.type === 'tool_error')         label = `${step.tool} error: ${step.error}`
  else if (step.type === 'spawn')              label = `Spawning ${step.agent} agent: ${step.task?.slice(0, 60)}…`
  else if (step.type === 'spawn_complete')     label = `${step.agent} agent finished`
  else if (step.type === 'coordinator_start')  label = step.message
  else                                         label = step.message || step.type

  return (
    <div className={`ac-step ac-step--${step.type}`}>
      <span className="ac-step-icon">{icon}</span>
      <span className="ac-step-label">{label}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AgentChat({ user }) {
  const [agent,     setAgent]     = useState('coordinator')
  const [messages,  setMessages]  = useState([])
  const [query,     setQuery]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [sessionId, setSessionId] = useState(() => newUUID())

  const bottomRef   = useRef(null)
  const textareaRef = useRef(null)
  const esRef       = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleAgentSwitch = (a) => {
    if (a === agent) return
    esRef.current?.close()
    setAgent(a)
    setMessages([])
    setSessionId(newUUID())
    setLoading(false)
  }

  // ── Send via SSE fetch ────────────────────────────────────────────────────
  const sendMessage = useCallback(async (overrideText) => {
    const text = (overrideText ?? query).trim()
    if (!text || loading) return

    setMessages(prev => [...prev, { role: 'user', content: text, ts: Date.now() }])
    setQuery('')
    setLoading(true)

    const msgId = Date.now()
    setMessages(prev => [...prev, {
      role: 'assistant', id: msgId, content: null,
      steps: [], ts: Date.now(), done: false,
    }])

    const addStep = (step) =>
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, steps: [...(m.steps || []), step] } : m
      ))

    const finalize = (content) => {
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, content, done: true } : m
      ))
      setLoading(false)
      textareaRef.current?.focus()
    }

    const failWith = (errMsg) => {
      setMessages(prev => prev.map(m =>
        m.id === msgId ? { ...m, content: `⚠️ ${errMsg}`, done: true, isError: true } : m
      ))
      setLoading(false)
    }

    try {
      const resp = await fetch(
        `${getBaseUrl()}/api/agents/chat`,
        {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${getToken()}`,   // ← kt_impex_token
          },
          body: JSON.stringify({ agent, message: text, session: sessionId }),
        }
      )

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }))
        return failWith(err.error || `HTTP ${resp.status}`)
      }

      const reader  = resp.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop()
        for (const chunk of chunks) {
          const lines     = chunk.split('\n')
          const eventLine = lines.find(l => l.startsWith('event:'))
          const dataLine  = lines.find(l => l.startsWith('data:'))
          if (!dataLine) continue
          const event = eventLine?.replace('event:', '').trim() || 'step'
          let   data
          try { data = JSON.parse(dataLine.replace('data:', '').trim()) } catch { continue }

          if (event === 'step')  addStep(data)
          if (event === 'done')  finalize(data.response || '')
          if (event === 'error') failWith(data.message  || 'Agent error')
        }
      }
    } catch (err) {
      failWith(err.message || 'Network error')
    }
  }, [agent, query, loading, sessionId])

  // ── New chat ──────────────────────────────────────────────────────────────
  const newChat = useCallback(async () => {
    esRef.current?.close()
    try { await API.delete(`/agents/session/${sessionId}`) } catch (_) {}
    setMessages([])
    setSessionId(newUUID())
    setLoading(false)
    setQuery('')
    textareaRef.current?.focus()
  }, [sessionId])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const selectedAgent = AGENTS.find(a => a.id === agent)
  const starters      = STARTERS[agent] || []

  return (
    <div className="ac-page">

      {/* Agent selector */}
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

      {/* Chat card */}
      <div className="ac-chat-wrap card">

        {/* Header */}
        <div className="ac-chat-header">
          <div className="ac-chat-header-left">
            <span className="ac-chat-title">{selectedAgent?.emoji} {selectedAgent?.label} Agent</span>
            <span className="ac-chat-desc">{selectedAgent?.desc}</span>
          </div>
          <div className="ac-chat-header-right">
            {messages.length > 0 && (
              <button className="btn btn-secondary ac-clear-btn" onClick={newChat}>New Chat</button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="ac-messages">
          {messages.length === 0 && !loading && (
            <div className="ac-empty">
              <span className="ac-empty-emoji">{selectedAgent?.emoji}</span>
              <p>Ask the <strong>{selectedAgent?.label}</strong> agent anything — it can read data <em>and</em> take actions.</p>
              <p className="ac-empty-hint">Enter to send · Shift+Enter for new line</p>
              {starters.length > 0 && (
                <div className="ac-starters">
                  {starters.map((s, i) => (
                    <button key={i} className="ac-starter-btn" onClick={() => sendMessage(s)}>{s}</button>
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

                  {(msg.steps || []).length > 0 && (
                    <div className="ac-steps">
                      {msg.steps.map((step, si) => <StepBubble key={si} step={step} />)}
                    </div>
                  )}

                  {!msg.done && (
                    <div className="ac-thinking">
                      <span /><span /><span />
                    </div>
                  )}

                  {msg.done && msg.content && !msg.isError && (
                    <div
                      className="ac-md"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                  )}

                  {msg.done && msg.isError && (
                    <div className="ac-bubble--error">{msg.content}</div>
                  )}
                </div>
              )}
            </div>
          ))}

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

        {import.meta.env.DEV && (
          <div style={{ fontSize: 11, color: '#999', padding: '4px 16px', borderTop: '1px solid #eee' }}>
            session: {sessionId.slice(0, 8)}…
          </div>
        )}
      </div>

      <style>{`
        .ac-steps {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 10px;
          padding: 8px 10px;
          background: var(--color-surface-offset, #f5f5f5);
          border-radius: 8px;
          border-left: 3px solid var(--color-primary, #01696f);
        }
        .ac-step {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          font-size: 12px;
          color: var(--color-text-muted, #666);
          line-height: 1.4;
        }
        .ac-step--tool_call   { color: var(--color-primary, #01696f); font-weight: 500; }
        .ac-step--tool_result { color: var(--color-success, #437a22); }
        .ac-step--tool_error  { color: var(--color-error,   #a12c7b); }
        .ac-step--spawn       { color: var(--color-blue,    #006494); font-weight: 500; }
        .ac-step-icon { flex-shrink: 0; }
        .ac-step-label { word-break: break-word; }
        .ac-thinking { display: flex; gap: 4px; padding: 6px 2px; }
        .ac-thinking span {
          width: 7px; height: 7px;
          background: var(--color-primary, #01696f);
          border-radius: 50%;
          animation: ac-bounce 1.2s infinite;
        }
        .ac-thinking span:nth-child(2) { animation-delay: .2s; }
        .ac-thinking span:nth-child(3) { animation-delay: .4s; }
        @keyframes ac-bounce {
          0%,80%,100% { transform: translateY(0); opacity: .5; }
          40%          { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// AgentChat.jsx — SSE-streaming multi-agent chat UI

import { useState, useRef, useEffect, useCallback } from 'react'
import API from '../api'

// ── Agent definitions ──────────────────────────────────────────────────────────────
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
function getToken() { return localStorage.getItem('kt_impex_token') || '' }
function getBaseUrl() {
  return import.meta.env.VITE_API_URL || 'http://localhost:5000'
}

function cleanResponse(text) {
  if (!text) return ''
  return text
    .replace(/^(VERDICT|RETAILER SIGNAL|PROCUREMENT VERDICT|PRICING VERDICT|RETRIEVAL|WAREHOUSE VERDICT|SALES SIGNAL)[^\n]*/gm, '')
    .replace(/\|?\s*Confidence:\s*(HIGH|MEDIUM|LOW)\s*/gi, '')
    .replace(/^Confidence:\s*(HIGH|MEDIUM|LOW).*$/gm, '')
    .replace(/^Invoking:\s*.+$/gm, '')
    .replace(/^To \w+Agent?:\s*/gm, '')
    .replace(/^\w+(?:Agent|Manager)?\s+Output:\s*/gm, '')
    .replace(/```json[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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

// ── Rotating starter prompts — one visible at a time, cycles every 3s ─────────
function RotatingStarters({ starters, onSelect }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [visible,   setVisible]   = useState(true)

  useEffect(() => {
    if (!starters.length) return
    setActiveIdx(0)
    setVisible(true)
  }, [starters])

  useEffect(() => {
    if (starters.length <= 1) return
    const timer = setInterval(() => {
      // fade out
      setVisible(false)
      setTimeout(() => {
        setActiveIdx(i => (i + 1) % starters.length)
        setVisible(true)
      }, 350) // matches CSS transition
    }, 3000)
    return () => clearInterval(timer)
  }, [starters])

  if (!starters.length) return null

  return (
    <div className="ac-rotating-wrap">
      <p className="ac-rotating-hint">Try asking…</p>
      <div className="ac-rotating-stage">
        <button
          className={`ac-rotating-prompt ${visible ? 'ac-rotating-prompt--in' : 'ac-rotating-prompt--out'}`}
          onClick={() => onSelect(starters[activeIdx])}
        >
          <span className="ac-rotating-arrow">↗</span>
          {starters[activeIdx]}
        </button>
      </div>
      {/* Dot indicators */}
      <div className="ac-rotating-dots">
        {starters.map((_, i) => (
          <button
            key={i}
            className={`ac-dot ${i === activeIdx ? 'ac-dot--active' : ''}`}
            onClick={() => { setVisible(false); setTimeout(() => { setActiveIdx(i); setVisible(true) }, 200) }}
            aria-label={`Prompt ${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}

// ── Step bubble ───────────────────────────────────────────────────────────────
function StepBubble({ step }) {
  if (step.type === 'tool_result') return null

  const labels = {
    thinking:          () => step.message || 'Thinking…',
    tool_call:         () => `Checking ${step.tool?.replace(/_/g, ' ')}…`,
    tool_error:        () => `⚠️ ${step.tool}: ${step.error}`,
    spawn:             () => `Asking ${step.agent} specialist…`,
    spawn_complete:    () => `${step.agent} done`,
    coordinator_start: () => step.message || 'Coordinator agent started',
  }

  const icons = {
    thinking:          '💭',
    tool_call:         '⛳',
    tool_error:        '❌',
    spawn:             '🤖',
    spawn_complete:    '✓',
    coordinator_start: '🧠',
  }

  const labelFn = labels[step.type]
  if (!labelFn) return null

  return (
    <div className={`ac-step ac-step--${step.type}`}>
      <span className="ac-step-icon">{icons[step.type] || '•'}</span>
      <span className="ac-step-label">{labelFn()}</span>
    </div>
  )
}

// ── Collapsible steps panel ───────────────────────────────────────────────────
function StepsPanel({ steps, done }) {
  const [open, setOpen] = useState(false)

  const visibleSteps = steps.filter(s =>
    s.type !== 'tool_result' && s.type !== 'coordinator_start'
  )

  if (visibleSteps.length === 0 && done) return null

  if (!done) {
    const latest = [...steps].reverse().find(s =>
      s.type === 'thinking' || s.type === 'tool_call' || s.type === 'coordinator_start'
    )
    return (
      <div className="ac-steps-inline">
        <span className="ac-step-label ac-step-label--muted">
          {latest?.type === 'coordinator_start' ? 'Coordinator agent started' :
           latest?.type === 'tool_call'         ? `Checking ${latest.tool?.replace(/_/g,' ')}…` :
           latest?.message                      || 'Thinking…'}
        </span>
      </div>
    )
  }

  if (visibleSteps.length === 0) return null

  return (
    <div className="ac-steps-wrap">
      <button className="ac-steps-toggle" onClick={() => setOpen(o => !o)}>
        <span>{open ? '▾' : '▸'}</span>
        <span>{visibleSteps.length} step{visibleSteps.length !== 1 ? 's' : ''}</span>
      </button>
      {open && (
        <div className="ac-steps">
          {visibleSteps.map((step, i) => <StepBubble key={i} step={step} />)}
        </div>
      )}
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
        m.id === msgId ? { ...m, content: cleanResponse(content), done: true } : m
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
            'Authorization': `Bearer ${getToken()}`,
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
              <RotatingStarters starters={starters} onSelect={sendMessage} />
              <p className="ac-empty-hint">Enter to send · Shift+Enter for new line</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`ac-msg ac-msg--${msg.role}`}>

              {msg.role === 'user' && (
                <div className="ac-bubble ac-bubble--user">{msg.content}</div>
              )}

              {msg.role === 'assistant' && (
                <div className="ac-bubble ac-bubble--assistant">
                  <StepsPanel steps={msg.steps || []} done={msg.done} />

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
        /* ── Rotating prompts ─────────────────────────────────────── */
        .ac-rotating-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          margin: 16px 0 8px;
        }
        .ac-rotating-hint {
          font-size: 12px;
          color: var(--color-text-muted, #888);
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin: 0;
        }
        .ac-rotating-stage {
          min-height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          max-width: 520px;
        }
        .ac-rotating-prompt {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 11px 20px;
          background: var(--color-surface, #fff);
          border: 1.5px solid var(--color-border, #ddd);
          border-radius: 24px;
          font-size: 14px;
          color: var(--color-text, #222);
          cursor: pointer;
          transition:
            opacity 0.35s ease,
            transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
            background 0.18s ease,
            border-color 0.18s ease,
            box-shadow 0.18s ease;
          text-align: left;
          max-width: 100%;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }
        .ac-rotating-prompt--in {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        .ac-rotating-prompt--out {
          opacity: 0;
          transform: translateY(8px) scale(0.97);
          pointer-events: none;
        }
        .ac-rotating-prompt:hover {
          background: var(--color-primary-highlight, #cedcd8);
          border-color: var(--color-primary, #01696f);
          box-shadow: 0 4px 16px rgba(1,105,111,0.13);
          color: var(--color-primary-active, #0f3638);
        }
        .ac-rotating-arrow {
          font-size: 15px;
          opacity: 0.5;
          flex-shrink: 0;
        }

        /* Dot indicators */
        .ac-rotating-dots {
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .ac-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--color-border, #ccc);
          border: none;
          padding: 0;
          cursor: pointer;
          transition: background 0.2s ease, transform 0.2s ease;
        }
        .ac-dot--active {
          background: var(--color-primary, #01696f);
          transform: scale(1.35);
        }
        .ac-dot:hover:not(.ac-dot--active) {
          background: var(--color-text-muted, #888);
        }

        /* ── Steps ────────────────────────────────────────────────── */
        .ac-steps-inline {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--color-text-muted, #888);
          margin-bottom: 8px;
          padding: 2px 0;
        }
        .ac-step-label--muted { font-style: italic; }

        .ac-steps-wrap { margin-bottom: 10px; }
        .ac-steps-toggle {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          color: var(--color-text-muted, #888);
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px 0;
          user-select: none;
        }
        .ac-steps-toggle:hover { color: var(--color-primary, #01696f); }

        .ac-steps {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 6px;
          padding: 8px 10px;
          background: var(--color-surface-offset, #f5f5f5);
          border-radius: 8px;
        }
        .ac-step {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          font-size: 12px;
          color: var(--color-text-muted, #666);
          line-height: 1.4;
        }
        .ac-step--tool_call  { color: var(--color-primary, #01696f); }
        .ac-step--tool_error { color: var(--color-error,   #a12c7b); }
        .ac-step--spawn      { color: var(--color-blue,    #006494); }
        .ac-step-icon  { flex-shrink: 0; }
        .ac-step-label { word-break: break-word; }

        /* ── Thinking dots ─────────────────────────────────────────── */
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

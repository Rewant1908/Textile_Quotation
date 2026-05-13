// routes/agents.js — KT IMPEX AI Agents
//
// POST /api/agents/chat     → SSE-streaming, real tool-calling coordinator
// POST /api/agents/query    → single-shot (legacy, unchanged)
// POST /api/agents/procurement → parallel fork (unchanged)
// POST /api/agents/spawn    → programmatic delegation (unchanged)
// GET/PUT/POST /api/agents/memory/*  (unchanged)
// DELETE/GET /api/agents/session/*   (unchanged)

import { Router }              from 'express'
import { runAgent, spawnAgent } from '../agents/runner/agentRunner.js'
import { runProcurementFork }  from '../agents/runner/forkRunner.js'
import { runCoordinator }      from '../agents/runner/coordinatorRunner.js'
import { AGENT_TOOL_REGISTRY } from '../agents/runner/agentRegistry.js'
import { runWithTools }        from '../agents/runner/toolRunner.js'
import { buildDealerTools }    from '../agents/tools/dealerTools.js'
import { readMemory, writeMemorySnapshot, appendMemory, listMemoryFiles } from '../agents/runner/agentMemory.js'
import { checkPermission }     from '../middleware/checkPermission.js'
import { scopeGuardMiddleware } from '../middleware/scopeGuard.js'
import {
  getHistory,
  appendToSession,
  clearSession,
  sessionInfo,
}                              from '../agents/runner/sessionStore.js'
import { readFile }            from 'fs/promises'
import { resolve, dirname }    from 'path'
import { fileURLToPath }       from 'url'
import pool                    from '../db.js'
import logger                  from '../logger.js'
import { randomUUID }          from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)
const router     = Router()

const VALID_AGENTS = [
  'inventory', 'retailer', 'procurement', 'warehouse',
  'pricing', 'sales', 'coordinator', 'quotation-summary',
  'quotation', 'product',
]

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agents/chat  — SSE-streaming, real tool-calling multi-agent system
//
// Body: { agent?, message, session?, history? }
// Streams events:
//   event: step   data: { type, ... }
//   event: done   data: { response }
//   event: error  data: { message }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/chat', checkPermission('USE_DEALER_AGENT'), async (req, res) => {
  const { session: sessionId, agent = 'coordinator', message, query, history = [] } = req.body
  const text = (message || query || '').trim()
  if (!text) return res.status(400).json({ error: 'message is required' })
  const isAdmin = req.user?.role === 'admin'
  const allowedForDealer = new Set(['dealer', 'inventory', 'retailer', 'quotation-summary'])
  const requestedAgent = (!isAdmin && agent === 'coordinator') ? 'dealer' : agent

  if (!isAdmin && !allowedForDealer.has(requestedAgent)) {
    return res.status(403).json({ error: `Forbidden: agent '${requestedAgent}' is not allowed for your role` })
  }

  // SSE headers
  res.setHeader('Content-Type',  'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection',    'keep-alive')
  res.flushHeaders()

  const emit = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) } catch (_) {}
  }

  const sid = sessionId || randomUUID()

  try {
    const storedHistory = getHistory(sid)
    const fullHistory   = history.length > 0 ? history : storedHistory
    let   finalResponse

    if (requestedAgent === 'coordinator') {
      finalResponse = await runCoordinator({
        query: text,
        history: fullHistory,
        db:   pool,
        sessionId: sid,
        emit,
      })
    } else {
      const tools = requestedAgent === 'dealer'
        ? buildDealerTools(req.user.user_id)
        : AGENT_TOOL_REGISTRY[requestedAgent]
      if (!tools) { emit('error', { message: `Unknown agent: ${requestedAgent}` }); return res.end() }

      let systemPrompt = ''
      if (requestedAgent === 'dealer') {
        systemPrompt = [
          'You are the KT Impex dealer assistant.',
          'Only use tools provided to answer this dealer user.',
          'Never return another dealer\'s data.',
          'Keep replies concise, plain text, and action-oriented.',
        ].join(' ')
      } else {
        const mdPath = resolve(__dirname, `../agents/${requestedAgent}.agent.md`)
        systemPrompt = `You are the ${requestedAgent} specialist for KT Impex textile. Use your tools only.`
        try {
          const raw = await readFile(mdPath, 'utf-8')
          const m = raw.match(/^---[\s\S]*?---\n([\s\S]*)$/)
          if (m) systemPrompt = m[1].trim()
        } catch (_) {}
      }
      finalResponse = await runWithTools({
        systemPrompt, tools,
        userMessage: text,
        history: fullHistory,
        db: pool,
        emit,
      })
    }

    appendToSession(sid, 'user',      text)
    appendToSession(sid, 'assistant', finalResponse)

    emit('done', { response: finalResponse, sessionId: sid })
    res.end()
  } catch (err) {
    logger.error({ err }, '[agents] /chat SSE error')
    emit('error', { message: err.message })
    res.end()
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/agents/session/:sessionId
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/session/:sessionId', checkPermission('VIEW_OPERATIONS'), (req, res) => {
  clearSession(req.params.sessionId)
  res.json({ ok: true, cleared: req.params.sessionId })
})

// GET /api/agents/session/:sessionId
router.get('/session/:sessionId', checkPermission('VIEW_OPERATIONS'), (req, res) => {
  const info = sessionInfo(req.params.sessionId)
  if (!info) return res.status(404).json({ error: 'Session not found' })
  res.json(info)
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agents/query  — legacy single-shot endpoint (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/query', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
  const { agent, query, context } = req.body
  if (!agent || !query)        return res.status(400).json({ error: 'agent and query are required' })
  if (!VALID_AGENTS.includes(agent)) return res.status(400).json({ error: `Unknown agent. Valid: ${VALID_AGENTS.join(', ')}` })
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY)
    return res.status(503).json({ error: 'No AI API key configured.' })
  try {
    const { buildLiveContext } = await import('../agents/runner/memoryManager.js')
    const db          = req.app.locals.db || pool
    const liveContext = db ? await buildLiveContext(agent, db) : ''
    const merged      = [liveContext, context || ''].filter(Boolean).join('\n\n---\n\n')
    const result = await runAgent({ agentName: agent, query, context: merged, username: req.user.username })
    res.json({
      agent: result.agentName, agentName: result.agentName,
      response: result.fullResponse, fullResponse: result.fullResponse,
      verdict: result.verdict, durationMs: result.durationMs,
      model: result.model, provider: result.provider,
    })
  } catch (err) {
    logger.error({ err: err.message }, '[agents] query error')
    res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agents/procurement  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/procurement', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
  const { context } = req.body
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY)
    return res.status(503).json({ error: 'No AI API key configured.' })
  try {
    const result = await runProcurementFork({ context: context || '', username: req.user.username })
    res.json(result)
  } catch (err) {
    logger.error({ err: err.message }, '[agents] procurement fork error')
    res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agents/spawn  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/spawn', checkPermission('USE_AGENTS'), async (req, res) => {
  const { callerAgent, targetAgent, query, context, sessionId } = req.body
  if (!targetAgent || !query)         return res.status(400).json({ error: 'targetAgent and query are required' })
  if (!VALID_AGENTS.includes(targetAgent)) return res.status(400).json({ error: `Unknown targetAgent.` })
  if (callerAgent && !VALID_AGENTS.includes(callerAgent)) return res.status(400).json({ error: `Unknown callerAgent.` })
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY)
    return res.status(503).json({ error: 'No AI API key configured.' })
  try {
    const { buildLiveContext } = await import('../agents/runner/memoryManager.js')
    const db          = req.app.locals.db || pool
    const liveContext = db ? await buildLiveContext(targetAgent, db) : ''
    const merged      = [liveContext, context || ''].filter(Boolean).join('\n\n---\n\n')
    const history     = sessionId ? getHistory(sessionId) : []
    const result = await spawnAgent({
      callerAgentName: callerAgent || null, targetAgentName: targetAgent,
      query, context: merged, username: req.user.username, history,
    })
    if (sessionId) {
      appendToSession(sessionId, 'user',      query)
      appendToSession(sessionId, 'assistant', result.fullResponse)
    }
    res.json({
      caller: callerAgent || 'direct', agent: result.agentName,
      agentName: result.agentName, response: result.fullResponse,
      verdict: result.verdict, durationMs: result.durationMs,
      model: result.model, provider: result.provider,
    })
  } catch (err) {
    const status = err.message.includes('not permitted') ? 403 : 500
    logger.error({ err: err.message }, '[agents] spawn error')
    res.status(status).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/agents/retailer/search  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/retailer/search', checkPermission('USE_AGENTS'), async (req, res) => {
  const { q, limit = '5' } = req.query
  if (!q?.trim()) return res.status(400).json({ error: 'q (query) is required' })
  try {
    const { searchRetailers } = await import('../services/embeddingService.js')
    const results = await searchRetailers(q.trim(), parseInt(limit, 10))
    res.json({ query: q, results })
  } catch (err) {
    logger.error({ err: err.message }, '[agents] retailer search error')
    res.status(500).json({ error: err.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Memory endpoints  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/memory/:scope', checkPermission('VIEW_OPERATIONS'), scopeGuardMiddleware('READ'), async (req, res) => {
  const { scope } = req.params
  const { agent = 'inventory' } = req.query
  const username = req.resolvedMemoryUsername
  if (!VALID_AGENTS.includes(agent)) return res.status(400).json({ error: 'Unknown agent.' })
  try {
    const content = await readMemory(scope, agent, username)
    res.json({ scope, agent, username, content: content || '(no memory yet)' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/memory/:scope/list', checkPermission('VIEW_OPERATIONS'), scopeGuardMiddleware('READ'), async (req, res) => {
  const { scope } = req.params
  const username  = req.resolvedMemoryUsername
  try {
    const files = await listMemoryFiles(scope, username)
    res.json({ scope, username, files })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/memory/:scope', checkPermission('MANAGE_SYSTEM'), scopeGuardMiddleware('WRITE'), async (req, res) => {
  const { scope } = req.params
  const { agent, content } = req.body
  const username = req.resolvedMemoryUsername
  if (!agent || !VALID_AGENTS.includes(agent)) return res.status(400).json({ error: 'agent required.' })
  if (typeof content !== 'string') return res.status(400).json({ error: 'content must be a string' })
  try {
    await writeMemorySnapshot(scope, agent, username, content)
    res.json({ ok: true, scope, agent, username, bytesWritten: Buffer.byteLength(content, 'utf-8') })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/memory/:scope/append', checkPermission('MANAGE_SYSTEM'), scopeGuardMiddleware('WRITE'), async (req, res) => {
  const { scope } = req.params
  const { agent, content } = req.body
  const username = req.resolvedMemoryUsername
  if (!agent || !VALID_AGENTS.includes(agent)) return res.status(400).json({ error: 'agent required.' })
  if (typeof content !== 'string') return res.status(400).json({ error: 'content must be a string' })
  try {
    await appendMemory(scope, agent, username, content)
    res.json({ ok: true, scope, agent, username, appended: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router

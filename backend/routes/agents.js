// routes/agents.js — Express router for /api/agents/*
// Phase 4 / Phase 6: Technical Foundation + AI Memory Design
//
// Phase 6 Task 1: scopeGuard applied to all memory endpoints
//   - project-scope: everyone reads, admin writes only
//   - user-scope: own memory only (admin can access any)
//   - local-scope: admin only
//
// Endpoints:
//   POST /api/agents/query                → single agent dispatch with live DB context
//   POST /api/agents/procurement          → parallel 3-agent procurement fork
//   POST /api/agents/spawn                → programmatic agent delegation
//   GET  /api/agents/memory/:scope        → read a specific agent memory file
//   GET  /api/agents/memory/:scope/list   → list all memory files in scope
//   PUT  /api/agents/memory/:scope        → admin: overwrite memory file
//   POST /api/agents/memory/:scope/append → admin: append to memory file
//   GET  /api/agents/retailer/search      → Phase 6 Task 2: semantic retailer search

import { Router }             from 'express'
import { runAgent, spawnAgent } from '../agents/runner/agentRunner.js'
import { runProcurementFork } from '../agents/runner/forkRunner.js'
import { readMemory, writeMemorySnapshot, appendMemory, listMemoryFiles } from '../agents/runner/agentMemory.js'
import { buildLiveContext }   from '../agents/runner/memoryManager.js'
import { checkPermission }    from '../middleware/checkPermission.js'
import { assertMemoryScope, scopeGuardMiddleware } from '../middleware/scopeGuard.js'
import logger                 from '../logger.js'

const router = Router()

const VALID_AGENTS = ['inventory', 'retailer', 'procurement', 'warehouse', 'pricing', 'sales', 'coordinator']

// ---------------------------------------------------------------------------
// POST /api/agents/query — single agent dispatch with live DB context injection
// ---------------------------------------------------------------------------
router.post('/query', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
    const { agent, query, context } = req.body

    if (!agent || !query)
        return res.status(400).json({ error: 'agent and query are required' })
    if (!VALID_AGENTS.includes(agent))
        return res.status(400).json({ error: `Unknown agent. Valid: ${VALID_AGENTS.join(', ')}` })
    if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY)
        return res.status(503).json({ error: 'No AI API key configured. Set GEMINI_API_KEY or OPENAI_API_KEY.' })

    try {
        const db = req.app.locals.db
        const liveContext   = db ? await buildLiveContext(agent, db) : ''
        const mergedContext = [liveContext, context || ''].filter(Boolean).join('\n\n---\n\n')

        const result = await runAgent({
            agentName: agent,
            query,
            context:  mergedContext,
            username: req.user.username,   // always from JWT — never from body
        })

        res.json({
            agent:        result.agentName,
            agentName:    result.agentName,
            response:     result.fullResponse,
            fullResponse: result.fullResponse,
            verdict:      result.verdict,
            durationMs:   result.durationMs,
            model:        result.model,
            provider:     result.provider,
        })
    } catch (err) {
        logger.error({ err: err.message }, '[agentRoute] query error')
        res.status(500).json({ error: err.message })
    }
})

// ---------------------------------------------------------------------------
// POST /api/agents/procurement — parallel 3-agent fork
// ---------------------------------------------------------------------------
router.post('/procurement', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
    const { context } = req.body

    if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY)
        return res.status(503).json({ error: 'No AI API key configured. Set GEMINI_API_KEY or OPENAI_API_KEY.' })

    try {
        const result = await runProcurementFork({
            context:  context || '',
            username: req.user.username,
        })
        res.json(result)
    } catch (err) {
        logger.error({ err: err.message }, '[agentRoute] procurement fork error')
        res.status(500).json({ error: err.message })
    }
})

// ---------------------------------------------------------------------------
// POST /api/agents/spawn — programmatic agent delegation
// ---------------------------------------------------------------------------
router.post('/spawn', checkPermission('USE_AGENTS'), async (req, res) => {
    const { callerAgent, targetAgent, query, context } = req.body

    if (!targetAgent || !query)
        return res.status(400).json({ error: 'targetAgent and query are required' })
    if (!VALID_AGENTS.includes(targetAgent))
        return res.status(400).json({ error: `Unknown targetAgent. Valid: ${VALID_AGENTS.join(', ')}` })
    if (callerAgent && !VALID_AGENTS.includes(callerAgent))
        return res.status(400).json({ error: `Unknown callerAgent. Valid: ${VALID_AGENTS.join(', ')}` })
    if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY)
        return res.status(503).json({ error: 'No AI API key configured. Set GEMINI_API_KEY or OPENAI_API_KEY.' })

    try {
        const db = req.app.locals.db
        const liveContext   = db ? await buildLiveContext(targetAgent, db) : ''
        const mergedContext = [liveContext, context || ''].filter(Boolean).join('\n\n---\n\n')

        const result = await spawnAgent({
            callerAgentName: callerAgent || null,
            targetAgentName: targetAgent,
            query,
            context:  mergedContext,
            username: req.user.username,
        })

        res.json({
            caller:      callerAgent || 'direct',
            agent:       result.agentName,
            agentName:   result.agentName,
            response:    result.fullResponse,
            verdict:     result.verdict,
            durationMs:  result.durationMs,
            model:       result.model,
            provider:    result.provider,
        })
    } catch (err) {
        const status = err.message.includes('not permitted') ? 403 : 500
        logger.error({ err: err.message }, '[agentRoute] spawn error')
        res.status(status).json({ error: err.message })
    }
})

// ---------------------------------------------------------------------------
// GET /api/agents/retailer/search — Phase 6 Task 2: semantic retailer search
// (declared before /:scope routes to avoid Express treating 'retailer' as scope)
// ---------------------------------------------------------------------------
router.get('/retailer/search', checkPermission('USE_AGENTS'), async (req, res) => {
    const { q, limit = '5' } = req.query
    if (!q?.trim()) return res.status(400).json({ error: 'q (query) is required' })

    try {
        // Dynamic import so the service only loads if the route is hit
        const { searchRetailers } = await import('../services/embeddingService.js')
        const results = await searchRetailers(q.trim(), parseInt(limit, 10))
        res.json({ query: q, results })
    } catch (err) {
        logger.error({ err: err.message }, '[agentRoute] retailer search error')
        res.status(500).json({ error: err.message })
    }
})

// ---------------------------------------------------------------------------
// GET /api/agents/memory/:scope — read a specific agent memory file
// Phase 6 Task 1: scopeGuard enforced
// ---------------------------------------------------------------------------
router.get(
    '/memory/:scope',
    checkPermission('VIEW_OPERATIONS'),
    scopeGuardMiddleware('READ'),
    async (req, res) => {
        const { scope }             = req.params
        const { agent = 'inventory' } = req.query
        const username              = req.resolvedMemoryUsername

        if (!VALID_AGENTS.includes(agent))
            return res.status(400).json({ error: `Unknown agent. Valid: ${VALID_AGENTS.join(', ')}` })

        try {
            const content = await readMemory(scope, agent, username)
            res.json({ scope, agent, username, content: content || '(no memory yet)' })
        } catch (err) {
            res.status(500).json({ error: err.message })
        }
    }
)

// ---------------------------------------------------------------------------
// GET /api/agents/memory/:scope/list
// Phase 6 Task 1: scopeGuard enforced
// ---------------------------------------------------------------------------
router.get(
    '/memory/:scope/list',
    checkPermission('VIEW_OPERATIONS'),
    scopeGuardMiddleware('READ'),
    async (req, res) => {
        const { scope }  = req.params
        const username   = req.resolvedMemoryUsername

        try {
            const files = await listMemoryFiles(scope, username)
            res.json({ scope, username, files })
        } catch (err) {
            res.status(500).json({ error: err.message })
        }
    }
)

// ---------------------------------------------------------------------------
// PUT /api/agents/memory/:scope — overwrite a memory file
// Phase 6 Task 1: scopeGuard enforced (project = admin-write only)
// ---------------------------------------------------------------------------
router.put(
    '/memory/:scope',
    checkPermission('MANAGE_SYSTEM'),
    scopeGuardMiddleware('WRITE'),
    async (req, res) => {
        const { scope }        = req.params
        const { agent, content } = req.body
        const username         = req.resolvedMemoryUsername

        if (!agent || !VALID_AGENTS.includes(agent))
            return res.status(400).json({ error: `agent required. Valid: ${VALID_AGENTS.join(', ')}` })
        if (typeof content !== 'string')
            return res.status(400).json({ error: 'content must be a string' })

        try {
            await writeMemorySnapshot(scope, agent, username, content)
            res.json({ ok: true, scope, agent, username, bytesWritten: Buffer.byteLength(content, 'utf-8') })
        } catch (err) {
            res.status(500).json({ error: err.message })
        }
    }
)

// ---------------------------------------------------------------------------
// POST /api/agents/memory/:scope/append
// Phase 6 Task 1: scopeGuard enforced
// ---------------------------------------------------------------------------
router.post(
    '/memory/:scope/append',
    checkPermission('MANAGE_SYSTEM'),
    scopeGuardMiddleware('WRITE'),
    async (req, res) => {
        const { scope }        = req.params
        const { agent, content } = req.body
        const username         = req.resolvedMemoryUsername

        if (!agent || !VALID_AGENTS.includes(agent))
            return res.status(400).json({ error: `agent required. Valid: ${VALID_AGENTS.join(', ')}` })
        if (typeof content !== 'string')
            return res.status(400).json({ error: 'content must be a string' })

        try {
            await appendMemory(scope, agent, username, content)
            res.json({ ok: true, scope, agent, username, appended: true })
        } catch (err) {
            res.status(500).json({ error: err.message })
        }
    }
)

export default router

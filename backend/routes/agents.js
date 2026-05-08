// routes/agents.js — Express router for /api/agents/*
// Phase 4: Technical Foundation
//
// POST /api/agents/query        → single agent dispatch
// POST /api/agents/procurement  → parallel 3-agent procurement fork
// GET  /api/agents/memory/:scope → read agent memory files (admin only)

import { Router }               from 'express'
import { runAgent }             from '../agents/runner/agentRunner.js'
import { runProcurementFork }   from '../agents/runner/forkRunner.js'
import { readMemory }           from '../agents/runner/agentMemory.js'
import { checkPermission }      from '../middleware/checkPermission.js'

const router = Router()

const VALID_AGENTS = ['inventory', 'retailer', 'procurement', 'warehouse', 'pricing', 'sales', 'coordinator']

// Single agent dispatch
router.post('/query', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
    const { agent, query, context } = req.body
    if (!agent || !query) {
        return res.status(400).json({ error: 'agent and query are required' })
    }
    if (!VALID_AGENTS.includes(agent)) {
        return res.status(400).json({ error: `Unknown agent. Valid: ${VALID_AGENTS.join(', ')}` })
    }
    if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured. AI agents are disabled.' })
    }
    try {
        const result = await runAgent({
            agentName: agent,
            query,
            context:  context || '',
            username: req.user?.username || 'system',
        })
        res.json(result)
    } catch (err) {
        console.error('[agentRoute] query error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

// Parallel procurement fork
router.post('/procurement', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
    const { context } = req.body
    if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured. AI agents are disabled.' })
    }
    try {
        const result = await runProcurementFork({
            context:  context || '',
            username: req.user?.username || 'system',
        })
        res.json(result)
    } catch (err) {
        console.error('[agentRoute] procurement fork error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

// Read memory files (admin/debug use)
router.get('/memory/:scope', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
    const { scope } = req.params
    const { agent = 'inventory' } = req.query
    if (!['project', 'user', 'local'].includes(scope)) {
        return res.status(400).json({ error: 'scope must be project, user, or local' })
    }
    try {
        const content = await readMemory(scope, agent, req.user?.username || 'system')
        res.json({ scope, agent, content: content || '(no memory yet)' })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

export default router

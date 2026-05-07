/**
 * agents.js — Express router for all agent API endpoints
 * Mounts at: /api/agents
 *
 * Endpoints:
 *   POST /api/agents/query          — single agent query
 *   POST /api/agents/procurement    — parallel procurement fork (3 agents)
 *   GET  /api/agents/memory/:scope  — read memory files
 */

import { Router } from 'express';
import { checkPermission } from '../middleware/checkPermission.js';
import { runAgent } from './runner/agentRunner.js';
import { runProcurementFork } from './runner/forkRunner.js';
import { readMemory, listMemoryFiles } from './runner/agentMemory.js';
import pool from '../db.js';

const router = new Router();

const VALID_AGENTS = ['inventory', 'retailer', 'procurement', 'warehouse', 'pricing', 'sales', 'coordinator'];

// ─── POST /api/agents/query ───────────────────────────────────────────────────
// Run a single agent with a natural language query.
// Body: { agent: string, query: string, context?: string }
router.post('/query', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
  const { agent, query, context } = req.body;

  if (!agent || !query)
    return res.status(400).json({ error: 'agent and query are required' });
  if (!VALID_AGENTS.includes(agent))
    return res.status(400).json({ error: `Unknown agent: ${agent}. Valid: ${VALID_AGENTS.join(', ')}` });

  try {
    const fullQuery = context ? `## Context\n${context}\n\n## Query\n${query}` : query;
    const result = await runAgent(agent, fullQuery, pool, { userId: req.user?.user_id });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/agents/procurement ────────────────────────────────────────────
// Parallel procurement fork: Inventory + Procurement + Pricing agents fire simultaneously.
// Body: { context?: string }  (e.g. "Budget: ₹2L. Target categories: Cotton, Suiting")
router.post('/procurement', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
  const { context = '' } = req.body;

  const sharedContext = [
    `Date: ${new Date().toISOString().split('T')[0]}`,
    context ? `Business Context: ${context}` : ''
  ].filter(Boolean).join('\n');

  try {
    const result = await runProcurementFork(sharedContext, pool);
    res.json({
      inventory:   result.inventory.verdict,
      procurement: result.procurement.verdict,
      pricing:     result.pricing.verdict,
      synthesis:   result.synthesis,
      durations: {
        inventory:   result.inventory.durationMs,
        procurement: result.procurement.durationMs,
        pricing:     result.pricing.durationMs
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/agents/memory/:scope ───────────────────────────────────────────
// List and read memory files for a given scope.
// Params: scope = project | user | local
router.get('/memory/:scope', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
  const { scope } = req.params;
  if (!['project', 'user', 'local'].includes(scope))
    return res.status(400).json({ error: 'scope must be project, user, or local' });

  try {
    const files = await listMemoryFiles(scope, req.user?.username);
    const memories = {};
    for (const file of files) {
      memories[file] = await readMemory(file, scope, req.user?.username);
    }
    res.json({ scope, files, memories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

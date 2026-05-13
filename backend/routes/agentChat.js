// backend/routes/agentChat.js
// Authenticated dealer/admin SSE chat endpoint.
// Mounted as: POST /api/agents/user-chat

import express from 'express'
import { checkPermission } from '../middleware/checkPermission.js'
import { runCoordinator } from '../agents/runner/coordinatorRunner.js'
import { runWithTools } from '../agents/runner/toolRunner.js'
import { buildDealerTools } from '../agents/tools/dealerTools.js'
import { getHistory, appendToSession } from '../agents/runner/sessionStore.js'
import { randomUUID } from 'crypto'
import db from '../db.js'
import logger from '../logger.js'

const router = express.Router()

router.post('/', checkPermission('USE_DEALER_AGENT'), async (req, res) => {
  const { session: sessionId, message, history = [] } = req.body
  const text = String(message || '').trim()
  if (!text) return res.status(400).json({ error: 'message is required' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const emit = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) } catch (_) {}
  }

  const sid = sessionId || randomUUID()

  try {
    const fullHistory = history.length ? history : getHistory(sid)
    const isAdmin = req.user?.role === 'admin'
    let finalResponse = ''

    if (isAdmin) {
      finalResponse = await runCoordinator({
        query: text,
        history: fullHistory,
        db,
        sessionId: sid,
        emit,
      })
    } else {
      finalResponse = await runWithTools({
        systemPrompt: 'You are KT Impex dealer assistant. Use only tools. Never reveal another dealer\'s data. Keep answers concise.',
        tools: buildDealerTools(req.user.user_id),
        userMessage: text,
        history: fullHistory,
        db,
        emit,
      })
    }

    appendToSession(sid, 'user', text)
    appendToSession(sid, 'assistant', finalResponse)
    emit('done', { response: finalResponse, sessionId: sid })
    res.end()
  } catch (err) {
    logger.error({ err }, 'agentChat route error')
    emit('error', { message: err.message })
    res.end()
  }
})

export default router

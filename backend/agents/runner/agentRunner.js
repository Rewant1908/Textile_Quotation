// agentRunner.js — Core agent lifecycle
// Phase 4 / Phase 6: Technical Foundation + AI Memory Design
// Phase 10: validateStructuredVerdict() exported for integration tests and spawn route
//
// Memory update protocol:
//   Agent response MAY contain a block delimited by:
//     MEMORY_UPDATE:
//     ...new memory content...
//     END_MEMORY
//   This block is extracted, stripped from the display response, and persisted
//   via writeMemorySnapshot(). Using END_MEMORY prevents the greedy regex
//   from truncating multi-paragraph memory updates.
//
// Phase 3 fixes (committed in previous push):
//   - Issue 2: spawnAgent() implemented and exported
//   - Issue 3: provider abstraction (AGENT_PROVIDER=gemini|openai)
//   - Issue 4: allowedAgentTypes parsed from frontmatter and enforced in spawnAgent()
//
// Phase 4 fix — Issue 1:
//   import.meta.dirname is Node 20.11+ only. Replaced with fileURLToPath polyfill
//   so the server runs correctly on Node 18+ (Railway's default LTS image).
//
// Phase 4 fix — Issue 4:
//   All console.log / console.error replaced with structured pino logger.
//
// Phase 10:
//   validateStructuredVerdict(text) — parses any agent response for a single
//   BUY/HOLD/AVOID token. Returns { valid, action, category, reason }.
//   Used by integration tests and downstream callers of spawnAgent().

import { readFile }              from 'fs/promises'
import { resolve, dirname }      from 'path'
import { fileURLToPath }         from 'url'           // Issue 1 fix
import { readMemory, writeMemorySnapshot } from './agentMemory.js'
import logger                    from '../../logger.js'

// Issue 1 fix: replaces import.meta.dirname (Node 20.11+ only)
// __filename and __dirname work on Node 18+
const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

// ── Provider abstraction (Phase 3 Issue 3) ────────────────────────────────────
// Issue 3: switch provider via AGENT_PROVIDER env var ('gemini' or 'openai').
const AGENT_PROVIDER = (process.env.AGENT_PROVIDER || 'gemini').toLowerCase()

let _geminiClient = null
let _openaiClient = null

async function callGemini(modelName, systemPrompt, query) {
    if (!process.env.GEMINI_API_KEY)
        throw new Error('GEMINI_API_KEY not set. Add it to your .env file.')
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    if (!_geminiClient) _geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = _geminiClient.getGenerativeModel({
        model:             modelName,
        systemInstruction: systemPrompt,
    })
    const result = await model.generateContent(query)
    return result.response.text()
}

async function callOpenAI(modelName, systemPrompt, query) {
    if (!process.env.OPENAI_API_KEY)
        throw new Error('OPENAI_API_KEY not set. Add it to your .env file.')
    const OpenAI = (await import('openai')).default
    if (!_openaiClient) {
        _openaiClient = new OpenAI({
            apiKey:  process.env.OPENAI_API_KEY,
            baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        })
    }
    const resp = await _openaiClient.chat.completions.create({
        model:    modelName,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: query },
        ],
    })
    return resp.choices[0].message.content
}

async function generateText(modelName, systemPrompt, query) {
    if (AGENT_PROVIDER === 'openai') return callOpenAI(modelName, systemPrompt, query)
    return callGemini(modelName, systemPrompt, query)
}

// ── Agent definition loader ───────────────────────────────────────────────────

// Issue 1 fix: use __dirname (fileURLToPath-derived) instead of import.meta.dirname
const AGENTS_DIR = resolve(__dirname, '..')

/**
 * Load and parse an agent .md file.
 * Frontmatter is a YAML-like block at the top between --- markers.
 * Phase 3 Issue 4: also parses allowedAgentTypes (multi-line YAML list).
 * Returns { name, model, maxTurns, memoryScope, allowedAgentTypes, systemPrompt }
 */
async function loadAgentDefinition(agentName) {
    const filePath = resolve(AGENTS_DIR, `${agentName}.agent.md`)
    const raw = await readFile(filePath, 'utf-8')

    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    let meta = {}
    let systemPrompt = raw
    let allowedAgentTypes = []

    if (fmMatch) {
        const fmLines = fmMatch[1].split('\n')
        let inAllowedAgentTypes = false

        for (const line of fmLines) {
            if (line.trim() === 'allowedAgentTypes:') {
                inAllowedAgentTypes = true
                continue
            }
            if (inAllowedAgentTypes) {
                const listMatch = line.match(/^\s+-\s+(.+)$/)
                if (listMatch) {
                    allowedAgentTypes.push(listMatch[1].trim())
                    continue
                } else {
                    inAllowedAgentTypes = false
                }
            }
            const [key, ...rest] = line.split(':')
            if (key && rest.length && !inAllowedAgentTypes) {
                meta[key.trim()] = rest.join(':').trim()
            }
        }
        systemPrompt = fmMatch[2].trim()
    }

    return {
        name:              meta.name        || agentName,
        model:             meta.model       || process.env.AGENT_MODEL || 'gemini-2.0-flash',
        maxTurns:          parseInt(meta.maxTurns || '3', 10),
        memoryScope:       meta.memoryScope || meta['memory'] || 'project',
        allowedAgentTypes,
        systemPrompt,
    }
}

// ── Response parsers ──────────────────────────────────────────────────────────

function extractMemoryUpdate(responseText) {
    const match = responseText.match(/MEMORY_UPDATE:\s*([\s\S]*?)\s*END_MEMORY/)
    if (!match) return { memoryContent: null, cleanResponse: responseText }
    const memoryContent = match[1].trim()
    const cleanResponse = responseText
        .replace(/MEMORY_UPDATE:[\s\S]*?END_MEMORY/g, '')
        .trim()
    return { memoryContent, cleanResponse }
}

function extractVerdict(responseText) {
    const patterns = [
        /^(VERDICT[^\n]*)/m,
        /^(RETAILER SIGNAL[^\n]*)/m,
        /^(PROCUREMENT VERDICT[^\n]*)/m,
        /^(PRICING VERDICT[^\n]*)/m,
        /^(RETRIEVAL[^\n]*)/m,
        /^(WAREHOUSE VERDICT[^\n]*)/m,
        /^(SALES SIGNAL[^\n]*)/m,
    ]
    for (const pattern of patterns) {
        const match = responseText.match(pattern)
        if (match) return match[1].trim()
    }
    return null
}

// ── Phase 10: validateStructuredVerdict ──────────────────────────────────────

/**
 * validateStructuredVerdict(text)
 *
 * Parses a single-agent response for a structured BUY/HOLD/AVOID verdict.
 * Intended for integration tests and the spawn route to validate that
 * agents return machine-readable decisions when instructed to do so.
 *
 * Matches patterns like:
 *   VERDICT: BUY Cotton — margins strong
 *   VERDICT: HOLD Polyester - stable
 *   VERDICT: AVOID Silk — dead stock
 *
 * @param {string} text — agent fullResponse text
 * @returns {{ valid: boolean, action: string|null, category: string|null, reason: string|null }}
 */
export function validateStructuredVerdict(text) {
    const match = text.match(
        /VERDICT:\s*(BUY|HOLD|AVOID)\s+([\w\s]+?)\s*[-–—]\s*(.+)/i
    )
    if (!match) return { valid: false, action: null, category: null, reason: null }
    return {
        valid:    true,
        action:   match[1].toUpperCase(),
        category: match[2].trim(),
        reason:   match[3].trim(),
    }
}

// ── Core runner ───────────────────────────────────────────────────────────────

/**
 * runAgent({ agentName, query, context?, username? })
 *
 * Full lifecycle:
 * 1. Load agent definition (.agent.md frontmatter + system prompt)
 * 2. Load memory for scope (Redis-cached, falls back to disk)
 * 3. Build full system prompt = definition + memory + context
 * 4. Call AI provider (Gemini or OpenAI via generateText abstraction)
 * 5. Extract VERDICT block
 * 6. Extract and persist MEMORY_UPDATE...END_MEMORY block if present
 * 7. Return structured result
 */
export async function runAgent({ agentName, query, context = '', username = 'system' }) {
    const start = Date.now()
    logger.debug({ agentName, username }, 'Agent run started')

    const agent  = await loadAgentDefinition(agentName)
    const memory = await readMemory(agent.memoryScope, agentName, username)

    const fullSystemPrompt = [
        agent.systemPrompt,
        memory  ? `\n\n## Agent Memory\n${memory}`   : '',
        context ? `\n\n## Query Context\n${context}` : '',
    ].join('')

    const rawResponse = await generateText(agent.model, fullSystemPrompt, query)

    const verdict = extractVerdict(rawResponse)
    const { memoryContent, cleanResponse } = extractMemoryUpdate(rawResponse)
    if (memoryContent) {
        await writeMemorySnapshot(agent.memoryScope, agentName, username, memoryContent)
        logger.debug({ agentName, scope: agent.memoryScope }, 'Memory snapshot written')
    }

    const durationMs = Date.now() - start
    logger.info({ agentName, durationMs, model: agent.model, provider: AGENT_PROVIDER, verdict }, 'Agent run complete')

    return {
        agentName,
        verdict,
        fullResponse: cleanResponse,
        durationMs,
        model:    agent.model,
        provider: AGENT_PROVIDER,
    }
}

// ── spawnAgent (Phase 3 Issue 2) ──────────────────────────────────────────────

/**
 * spawnAgent({ callerAgentName, targetAgentName, query, context, username })
 *
 * Programmatic agent delegation. Called by the coordinator route or any agent
 * that needs to delegate to a specialist at runtime.
 *
 * Guards:
 * - Phase 3 Issue 4: allowedAgentTypes enforced if defined on caller
 * - Anti-recursion: fork children (_FORK_CHILD=true) cannot call spawnAgent
 */
export async function spawnAgent({
    callerAgentName,
    targetAgentName,
    query,
    context  = '',
    username = 'system',
}) {
    if (process.env._FORK_CHILD === 'true') {
        throw new Error('Fork children cannot spawn further agents.')
    }

    if (callerAgentName) {
        const caller  = await loadAgentDefinition(callerAgentName)
        if (caller.allowedAgentTypes && caller.allowedAgentTypes.length > 0) {
            const allowed = caller.allowedAgentTypes.map(a => a.toLowerCase().replace(/agent$/, ''))
            const target  = targetAgentName.toLowerCase().replace(/agent$/, '')
            if (!allowed.includes(target)) {
                logger.warn({ callerAgentName, targetAgentName, allowed }, 'spawnAgent blocked by allowedAgentTypes')
                throw new Error(
                    `Agent '${callerAgentName}' is not permitted to spawn '${targetAgentName}'. ` +
                    `Allowed: ${caller.allowedAgentTypes.join(', ')}`
                )
            }
        }
    }

    logger.info({ callerAgentName, targetAgentName }, 'spawnAgent delegating')
    return runAgent({ agentName: targetAgentName, query, context, username })
}

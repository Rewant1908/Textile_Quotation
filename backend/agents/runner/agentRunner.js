// agentRunner.js — Core agent lifecycle
// Phase 4 / Phase 6: Technical Foundation + AI Memory Design
//
// Memory update protocol:
//   Agent response MAY contain a block delimited by:
//     MEMORY_UPDATE:
//     ...new memory content...
//     END_MEMORY
//   This block is extracted, stripped from the display response, and persisted
//   via writeMemorySnapshot(). Using END_MEMORY prevents the greedy regex
//   from truncating multi-paragraph memory updates.

import { GoogleGenerativeAI } from '@google/generative-ai'
import { readFile }           from 'fs/promises'
import { resolve }            from 'path'
import { readMemory, writeMemorySnapshot } from './agentMemory.js'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

const AGENTS_DIR = resolve(import.meta.dirname, '..')

/**
 * Load and parse an agent .md file.
 * Frontmatter is a YAML-like block at the top between --- markers.
 * Returns { name, model, maxTurns, memoryScope, systemPrompt }
 */
async function loadAgentDefinition(agentName) {
    const filePath = resolve(AGENTS_DIR, `${agentName}.agent.md`)
    const raw = await readFile(filePath, 'utf-8')

    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    let meta = {}
    let systemPrompt = raw

    if (fmMatch) {
        const fmLines = fmMatch[1].split('\n')
        for (const line of fmLines) {
            const [key, ...rest] = line.split(':')
            if (key && rest.length) meta[key.trim()] = rest.join(':').trim()
        }
        systemPrompt = fmMatch[2].trim()
    }

    return {
        name:        meta.name        || agentName,
        model:       meta.model       || process.env.AGENT_MODEL || 'gemini-2.0-flash',
        maxTurns:    parseInt(meta.maxTurns || '3', 10),
        memoryScope: meta.memoryScope || 'project',
        systemPrompt,
    }
}

/**
 * extractMemoryUpdate — extracts MEMORY_UPDATE...END_MEMORY block.
 * Returns { memoryContent, cleanResponse } where cleanResponse has the
 * sentinel block removed so it is not shown to the end user.
 */
function extractMemoryUpdate(responseText) {
    // Match MEMORY_UPDATE: ... END_MEMORY (multi-line, non-greedy)
    const match = responseText.match(/MEMORY_UPDATE:\s*([\s\S]*?)\s*END_MEMORY/)
    if (!match) return { memoryContent: null, cleanResponse: responseText }

    const memoryContent = match[1].trim()
    const cleanResponse = responseText
        .replace(/MEMORY_UPDATE:[\s\S]*?END_MEMORY/g, '')
        .trim()
    return { memoryContent, cleanResponse }
}

/**
 * extractVerdict — finds the first verdict-style line in the response.
 * Supports 5 verdict patterns used across all 7 agents.
 */
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

/**
 * runAgent(agentName, query, context?, username?)
 *
 * Full lifecycle:
 * 1. Load agent definition (.agent.md frontmatter + system prompt)
 * 2. Load memory for scope (Redis-cached, falls back to disk)
 * 3. Build full system prompt = definition + memory + context
 * 4. Call Gemini API
 * 5. Extract VERDICT block
 * 6. Extract and persist MEMORY_UPDATE...END_MEMORY block if present
 * 7. Return structured result (cleanResponse has sentinel stripped)
 */
export async function runAgent({ agentName, query, context = '', username = 'system' }) {
    const start = Date.now()

    // 1. Load agent definition
    const agent = await loadAgentDefinition(agentName)

    // 2. Load memory
    const memory = await readMemory(agent.memoryScope, agentName, username)

    // 3. Build full system prompt
    const fullSystemPrompt = [
        agent.systemPrompt,
        memory  ? `\n\n## Agent Memory\n${memory}`   : '',
        context ? `\n\n## Query Context\n${context}` : '',
    ].join('')

    // 4. Call Gemini
    const model = genAI.getGenerativeModel({
        model:             agent.model,
        systemInstruction: fullSystemPrompt,
    })

    const result       = await model.generateContent(query)
    const rawResponse  = result.response.text()

    // 5. Extract verdict first (before stripping memory block)
    const verdict = extractVerdict(rawResponse)

    // 6. Extract and persist memory update (uses END_MEMORY sentinel)
    const { memoryContent, cleanResponse } = extractMemoryUpdate(rawResponse)
    if (memoryContent) {
        await writeMemorySnapshot(agent.memoryScope, agentName, username, memoryContent)
    }

    return {
        agentName,
        verdict,
        fullResponse: cleanResponse,
        durationMs:  Date.now() - start,
        model:       agent.model,
    }
}

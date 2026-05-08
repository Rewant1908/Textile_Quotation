// agentRunner.js — Core agent lifecycle
// Phase 4: Technical Foundation
// Wires agent .md definition + memory + Claude API into a single runAgent() call.

import Anthropic      from '@anthropic-ai/sdk'
import { readFile }   from 'fs/promises'
import { resolve }    from 'path'
import { readMemory, writeMemorySnapshot } from './agentMemory.js'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const AGENTS_DIR = resolve(import.meta.dirname, '..')

/**
 * Load and parse an agent .md file.
 * Frontmatter is a YAML-like block at the top between --- markers.
 * Returns { name, model, maxTurns, memoryScope, systemPrompt }
 */
async function loadAgentDefinition(agentName) {
    const filePath = resolve(AGENTS_DIR, `${agentName}.agent.md`)
    const raw = await readFile(filePath, 'utf-8')

    // Parse optional frontmatter
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
        model:       meta.model       || process.env.AGENT_MODEL || 'claude-opus-4-5',
        maxTurns:    parseInt(meta.maxTurns || '3', 10),
        memoryScope: meta.memoryScope || 'project',
        systemPrompt,
    }
}

/**
 * runAgent(agentName, query, context?, username?)
 *
 * Full lifecycle:
 * 1. Load agent definition
 * 2. Load memory for scope
 * 3. Build system prompt = definition + memory
 * 4. Call Claude API
 * 5. Extract VERDICT block
 * 6. Optionally persist memory update
 * 7. Return structured result
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
        memory ? `\n\n## Agent Memory\n${memory}` : '',
        context ? `\n\n## Query Context\n${context}` : '',
    ].join('')

    // 4. Call Claude
    const message = await client.messages.create({
        model:      agent.model,
        max_tokens: 1024,
        system:     fullSystemPrompt,
        messages:   [{ role: 'user', content: query }],
    })

    const fullResponse = message.content[0]?.text || ''

    // 5. Extract VERDICT block (first line starting with VERDICT:)
    const verdictMatch = fullResponse.match(/^(VERDICT[^\n]*)/m)
        || fullResponse.match(/^(RETAILER SIGNAL[^\n]*)/m)
        || fullResponse.match(/^(PROCUREMENT VERDICT[^\n]*)/m)
        || fullResponse.match(/^(PRICING VERDICT[^\n]*)/m)
        || fullResponse.match(/^(RETRIEVAL[^\n]*)/m)
    const verdict = verdictMatch ? verdictMatch[1].trim() : null

    // 6. Persist memory if agent signals an update
    if (fullResponse.includes('MEMORY_UPDATE:')) {
        const memUpdateMatch = fullResponse.match(/MEMORY_UPDATE:\s*([\s\S]*?)(?:\n\n|$)/)
        if (memUpdateMatch) {
            await writeMemorySnapshot(agent.memoryScope, agentName, username, memUpdateMatch[1].trim())
        }
    }

    return {
        agentName,
        verdict,
        fullResponse,
        durationMs: Date.now() - start,
        model:      agent.model,
    }
}

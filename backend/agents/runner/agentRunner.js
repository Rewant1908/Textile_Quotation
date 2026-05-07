/**
 * agentRunner.js
 * Core agent lifecycle: load definition → init memory → build prompt → run loop → finalize
 * Mirrors the runAgent.ts pattern from Claude Code's agent subsystem.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readMemory, writeMemorySnapshot } from './agentMemory.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = path.join(__dirname, '..');

/**
 * Load and parse an agent .md definition file.
 * Extracts YAML frontmatter and system prompt body.
 */
export async function loadAgentDefinition(agentName) {
  const filePath = path.join(AGENTS_DIR, `${agentName}.agent.md`);
  const raw = await fs.readFile(filePath, 'utf8');

  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) throw new Error(`No frontmatter found in ${agentName}.agent.md`);

  // Simple YAML key:value parser (no external dep required)
  const frontmatter = {};
  for (const line of fmMatch[1].split('\n')) {
    const kv = line.match(/^([\w]+):\s*(.*)$/);
    if (kv) frontmatter[kv[1].trim()] = kv[2].trim();
  }

  const systemPrompt = raw.replace(/^---[\s\S]*?---/, '').replace(/^## System Prompt\n/, '').trim();

  return { name: agentName, frontmatter, systemPrompt };
}

/**
 * Main agent runner.
 * Lifecycle:
 *   1. Load agent definition
 *   2. Load memory from MEMORY.md (project/user/local scope)
 *   3. Build full system prompt (definition + memory context)
 *   4. Execute query via AI provider
 *   5. Finalize — write memory snapshot if updated
 *
 * @param {string} agentName   - e.g. 'inventory', 'retailer'
 * @param {string} userQuery   - natural language query
 * @param {object} dbPool      - MariaDB connection pool
 * @param {object} [options]   - { retailerId, userId, maxTurns }
 * @returns {Promise<{verdict: string, fullResponse: string, agentName: string}>}
 */
export async function runAgent(agentName, userQuery, dbPool, options = {}) {
  const startTime = Date.now();

  // ── Step 1: Load agent definition ────────────────────────────────────────
  const agent = await loadAgentDefinition(agentName);
  const maxTurns = options.maxTurns || parseInt(agent.frontmatter.maxTurns) || 5;

  // ── Step 2: Load memory ───────────────────────────────────────────────────
  const memoryScope = agent.frontmatter['memory.scope'] || 'project';
  const memoryFile  = agent.frontmatter['memory.file']  || `memory/${agentName}.MEMORY.md`;
  const memoryContent = await readMemory(memoryFile, memoryScope);

  // ── Step 3: Build system prompt ───────────────────────────────────────────
  const fullSystemPrompt = [
    agent.systemPrompt,
    memoryContent ? `\n\n## Loaded Memory\n${memoryContent}` : ''
  ].join('');

  // ── Step 4: Build context for AI provider ─────────────────────────────────
  // This is the hook point for Claude / OpenAI API calls.
  // Replace the stub below with your actual AI provider call.
  const aiResponse = await callAIProvider({
    systemPrompt: fullSystemPrompt,
    userQuery,
    maxTurns,
    agentName: agent.name
  });

  // ── Step 5: Extract structured verdict ───────────────────────────────────
  const verdict = extractVerdict(aiResponse);

  // ── Step 6: Finalize — persist memory if agent wrote updates ─────────────
  if (aiResponse.memoryUpdates) {
    await writeMemorySnapshot(memoryFile, memoryScope, aiResponse.memoryUpdates);
  }

  return {
    agentName,
    verdict,
    fullResponse: aiResponse.text,
    durationMs: Date.now() - startTime
  };
}

/**
 * Extract the VERDICT block from an agent response.
 * Agents are instructed to end responses with a VERDICT: line.
 */
function extractVerdict(aiResponse) {
  const text = aiResponse.text || '';
  const match = text.match(/VERDICT[:\s]+([^\n]+(?:\n(?!\n)[^\n]+)*)/i);
  return match ? match[0].trim() : 'No verdict produced';
}

/**
 * AI provider stub — replace with actual Claude / OpenAI SDK call.
 * Signature must return { text: string, memoryUpdates?: string }
 */
async function callAIProvider({ systemPrompt, userQuery, maxTurns, agentName }) {
  // TODO: replace stub with:
  //   import Anthropic from '@anthropic-ai/sdk';
  //   const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  //   const msg = await client.messages.create({ model: 'claude-opus-4-5', max_tokens: 2048,
  //     system: systemPrompt, messages: [{ role: 'user', content: userQuery }] });
  //   return { text: msg.content[0].text };

  console.log(`[AgentRunner] ${agentName} called | maxTurns=${maxTurns}`);
  return {
    text: `[STUB] ${agentName} received: "${userQuery}"\nVERDICT: Stub response — connect AI provider to activate`
  };
}

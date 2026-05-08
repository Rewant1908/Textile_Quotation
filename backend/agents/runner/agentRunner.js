/**
 * agentRunner.js
 * Core agent lifecycle: load definition → init memory → build prompt → run loop → finalize
 * Bug 4 fix: added queryDB tool executor loop in callAIProvider so tool_use blocks
 * from Anthropic SDK are handled and don't leave the agent hanging.
 */

import fs   from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { readMemory, writeMemorySnapshot } from './agentMemory.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = path.join(__dirname, '..');

// ─── queryDB tool definition (passed to Anthropic tools array) ────────────────
const QUERY_DB_TOOL = {
  name: 'queryDB',
  description: 'Execute a read-only SQL SELECT query against the KT Impex MariaDB database. Only SELECT statements are permitted; any other statement will be rejected.',
  input_schema: {
    type: 'object',
    properties: {
      sql: {
        type: 'string',
        description: 'A valid SQL SELECT statement. No INSERT, UPDATE, DELETE, DROP or DDL allowed.'
      },
      params: {
        type: 'array',
        items: {},
        description: 'Optional array of positional parameters for the prepared statement placeholders (?)'
      }
    },
    required: ['sql']
  }
};

/**
 * Execute a queryDB tool call from the AI.
 * Enforces read-only: rejects any SQL that isn't a SELECT.
 */
async function executeQueryDB(dbPool, toolInput) {
  const sql    = (toolInput.sql    || '').trim();
  const params = (toolInput.params || []);

  // Safety gate: only allow SELECT statements
  if (!/^SELECT\b/i.test(sql)) {
    return { error: 'Only SELECT statements are allowed via queryDB. Rejected: ' + sql.slice(0, 80) };
  }

  let conn;
  try {
    conn = await dbPool.getConnection();
    const rows = await conn.query(sql, params);
    // Truncate large result sets to avoid token overflow
    const limited = Array.isArray(rows) && rows.length > 200 ? rows.slice(0, 200) : rows;
    return { rows: limited, truncated: Array.isArray(rows) && rows.length > 200, total: Array.isArray(rows) ? rows.length : 1 };
  } catch (err) {
    return { error: err.message };
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Load and parse an agent .md definition file.
 * Extracts YAML frontmatter and system prompt body.
 */
export async function loadAgentDefinition(agentName) {
  const filePath = path.join(AGENTS_DIR, `${agentName}.agent.md`);
  const raw = await fs.readFile(filePath, 'utf8');

  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) throw new Error(`No frontmatter found in ${agentName}.agent.md`);

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
 *   2. Load memory
 *   3. Build full system prompt
 *   4. Execute query via AI provider (with queryDB tool executor loop)
 *   5. Finalize — write memory snapshot if updated
 */
export async function runAgent(agentName, userQuery, dbPool, options = {}) {
  const startTime = Date.now();

  const agent    = await loadAgentDefinition(agentName);
  const maxTurns = options.maxTurns || parseInt(agent.frontmatter.maxTurns) || 5;

  const memoryScope   = agent.frontmatter['memory.scope'] || 'project';
  const memoryFile    = agent.frontmatter['memory.file']  || `memory/${agentName}.MEMORY.md`;
  const memoryContent = await readMemory(memoryFile, memoryScope);

  const fullSystemPrompt = [
    agent.systemPrompt,
    memoryContent ? `\n\n## Loaded Memory\n${memoryContent}` : ''
  ].join('');

  const aiResponse = await callAIProvider({
    systemPrompt: fullSystemPrompt,
    userQuery,
    maxTurns,
    agentName:   agent.name,
    dbPool
  });

  const verdict = extractVerdict(aiResponse);

  if (aiResponse.memoryUpdates) {
    await writeMemorySnapshot(memoryFile, memoryScope, aiResponse.memoryUpdates);
  }

  return {
    agentName,
    verdict,
    fullResponse: aiResponse.text,
    durationMs:  Date.now() - startTime
  };
}

function extractVerdict(aiResponse) {
  const text  = aiResponse.text || '';
  const match = text.match(/VERDICT[:\s]+([^\n]+(?:\n(?!\n)[^\n]+)*)/i);
  return match ? match[0].trim() : 'No verdict produced';
}

/**
 * AI provider — Anthropic Claude with queryDB tool executor loop.
 * Bug 4 fix: previously a stub with no tool handling. Now:
 *   1. Sends the queryDB tool definition to Claude
 *   2. Loops while Claude returns tool_use blocks, executing each one
 *   3. Feeds tool_result back into the message array
 *   4. Continues until a plain text stop_reason is received or maxTurns exhausted
 */
async function callAIProvider({ systemPrompt, userQuery, maxTurns, agentName, dbPool }) {
  // ── Stub mode: if no API key is set, return a clear placeholder ──────────
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(`[AgentRunner] ${agentName} called (stub — ANTHROPIC_API_KEY not set)`);
    return {
      text: `[STUB] ${agentName} received: "${userQuery}"\nVERDICT: Stub response — set ANTHROPIC_API_KEY to activate`
    };
  }

  // ── Live mode ─────────────────────────────────────────────────────────────
  let Anthropic;
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
  } catch {
    return { text: '[Error] @anthropic-ai/sdk not installed. Run: npm install @anthropic-ai/sdk\nVERDICT: SDK missing' };
  }

  const client   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages = [{ role: 'user', content: userQuery }];
  let   turns    = 0;
  let   finalText = '';

  while (turns < maxTurns) {
    turns++;

    const response = await client.messages.create({
      model:      process.env.ANTHROPIC_MODEL || 'claude-opus-4-5',
      max_tokens: 2048,
      system:     systemPrompt,
      tools:      [QUERY_DB_TOOL],
      messages
    });

    // ── Collect any text blocks produced this turn ──────────────────────────
    const textBlocks = response.content.filter(b => b.type === 'text');
    if (textBlocks.length > 0) {
      finalText = textBlocks.map(b => b.text).join('\n');
    }

    // ── If Claude is done (no tool calls), exit the loop ───────────────────
    if (response.stop_reason !== 'tool_use') break;

    // ── Execute every tool_use block Claude requested ──────────────────────
    const toolUseBlocks   = response.content.filter(b => b.type === 'tool_use');
    const toolResultParts = [];

    for (const block of toolUseBlocks) {
      let result;
      if (block.name === 'queryDB') {
        result = await executeQueryDB(dbPool, block.input);
      } else {
        result = { error: `Unknown tool: ${block.name}` };
      }

      toolResultParts.push({
        type:        'tool_result',
        tool_use_id: block.id,
        content:     JSON.stringify(result)
      });
    }

    // ── Push assistant turn + tool results back into message history ────────
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user',      content: toolResultParts });
  }

  if (!finalText) {
    finalText = `[AgentRunner] ${agentName} exhausted ${maxTurns} turns without a text response.\nVERDICT: maxTurns exceeded`;
  }

  return { text: finalText };
}

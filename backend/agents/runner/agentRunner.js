/**
 * agentRunner.js
 * Core agent lifecycle: load definition → init memory → build prompt → run Anthropic tool loop → finalize
 *
 * Bug 4 fix: callAIProvider() is now wired to the Anthropic SDK with a full tool
 * executor loop. When Claude returns a tool_use block for 'queryDB', we execute
 * the SQL on a read-only connection and feed the result back as tool_result.
 * The loop continues until Claude returns a final text response (stop_reason: 'end_turn')
 * or maxTurns is exhausted.
 */

import fs   from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic          from '@anthropic-ai/sdk';
import { readMemory, writeMemorySnapshot } from './agentMemory.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = path.join(__dirname, '..');

// ─── queryDB tool definition sent to Claude ────────────────────────────────
const QUERY_DB_TOOL = {
  name: 'queryDB',
  description:
    'Execute a read-only SQL SELECT query against the kt_impex MariaDB database. ' +
    'Use this to look up products, thans, bales, retailers, transactions, or quotations. ' +
    'Only SELECT statements are permitted — any mutating statement will be rejected.',
  input_schema: {
    type: 'object',
    properties: {
      sql: {
        type: 'string',
        description: 'A read-only SELECT SQL statement. No INSERT, UPDATE, DELETE, DROP, etc.'
      },
      params: {
        type: 'array',
        items: { type: ['string', 'number', 'null'] },
        description: 'Optional positional parameters for prepared-statement placeholders (?)'
      }
    },
    required: ['sql']
  }
};

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

  const systemPrompt = raw
    .replace(/^---[\s\S]*?---/, '')
    .replace(/^## System Prompt\n/, '')
    .trim();

  return { name: agentName, frontmatter, systemPrompt };
}

/**
 * Main agent runner.
 * @param {string} agentName  - e.g. 'inventory', 'retailer'
 * @param {string} userQuery  - natural language query
 * @param {object} dbPool     - MariaDB connection pool
 * @param {object} [options]  - { retailerId, userId, maxTurns }
 */
export async function runAgent(agentName, userQuery, dbPool, options = {}) {
  const startTime = Date.now();

  const agent     = await loadAgentDefinition(agentName);
  const maxTurns  = options.maxTurns || parseInt(agent.frontmatter.maxTurns) || 5;

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
    agentName: agent.name,
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
    durationMs: Date.now() - startTime
  };
}

function extractVerdict(aiResponse) {
  const text  = aiResponse.text || '';
  const match = text.match(/VERDICT[:\s]+([^\n]+(?:\n(?!\n)[^\n]+)*)/i);
  return match ? match[0].trim() : 'No verdict produced';
}

/**
 * Execute a single queryDB tool call on a read-only connection.
 * Rejects any SQL that is not a SELECT to prevent mutations.
 */
async function executeQueryDB(dbPool, { sql, params = [] }) {
  const normalized = sql.trim().toUpperCase();
  if (!normalized.startsWith('SELECT')) {
    return { error: 'Only SELECT statements are permitted.' };
  }
  let conn;
  try {
    conn = await dbPool.getConnection();
    const rows = await conn.query(sql, params);
    // MariaDB returns array + meta; strip meta for clean JSON
    const data = Array.isArray(rows)
      ? rows.map(r => Object.fromEntries(
          Object.entries(r).filter(([k]) => k !== 'meta')
        ))
      : rows;
    return { rows: data, count: Array.isArray(data) ? data.length : undefined };
  } catch (err) {
    return { error: err.message };
  } finally {
    if (conn) conn.release();
  }
}

/**
 * callAIProvider — Anthropic SDK with queryDB tool executor loop.
 *
 * Turn loop:
 *   1. Send messages to Claude with queryDB tool available.
 *   2. If Claude returns stop_reason 'tool_use', find all tool_use blocks,
 *      execute each via executeQueryDB, append results as tool_result, repeat.
 *   3. If stop_reason is 'end_turn' (or maxTurns exhausted), return final text.
 */
async function callAIProvider({ systemPrompt, userQuery, maxTurns, agentName, dbPool }) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const messages = [
    { role: 'user', content: userQuery }
  ];

  let finalText    = '';
  let memoryUpdates = null;
  let turnsLeft    = maxTurns;

  while (turnsLeft > 0) {
    turnsLeft--;

    const response = await client.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 4096,
      system:     systemPrompt,
      tools:      [QUERY_DB_TOOL],
      messages
    });

    // Append assistant turn to messages for next iteration
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      // Extract final text from content blocks
      finalText = response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim();
      break;
    }

    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');

      // Execute each tool call and collect results
      const toolResults = [];
      for (const block of toolUseBlocks) {
        let resultContent;
        if (block.name === 'queryDB') {
          const dbResult = await executeQueryDB(dbPool, block.input);
          resultContent  = JSON.stringify(dbResult);
          console.log(`[AgentRunner:${agentName}] queryDB executed | rows=${dbResult.rows?.length ?? 'N/A'} | sql=${block.input.sql?.slice(0, 80)}`);
        } else {
          resultContent = JSON.stringify({ error: `Unknown tool: ${block.name}` });
        }
        toolResults.push({
          type:        'tool_result',
          tool_use_id: block.id,
          content:     resultContent
        });
      }

      // Feed all tool results back to Claude in next turn
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Unexpected stop reason — break to avoid infinite loop
    console.warn(`[AgentRunner:${agentName}] Unexpected stop_reason: ${response.stop_reason}`);
    break;
  }

  if (!finalText) {
    finalText = `[AgentRunner] ${agentName}: maxTurns (${maxTurns}) exhausted without final response.\nVERDICT: Incomplete`;
  }

  return { text: finalText, memoryUpdates };
}

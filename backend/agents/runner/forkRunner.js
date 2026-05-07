/**
 * forkRunner.js
 * Parallel fork pattern for multi-agent procurement queries.
 * All fork children receive byte-identical context prefixes → shared API cache hits.
 * Mirrors the forkSubagent.ts pattern from Claude Code.
 */

import { runAgent } from './agentRunner.js';

/**
 * Run multiple agents in parallel with a shared context prefix.
 * Used by the Coordinator for queries that need 2+ independent agent outputs.
 *
 * @param {Array<{agentName: string, query: string}>} forks  - agents to run in parallel
 * @param {object} dbPool                                     - shared MariaDB pool
 * @param {string} sharedContext                              - byte-identical prefix injected into all forks
 * @returns {Promise<Array<{agentName, verdict, fullResponse, durationMs}>>}
 */
export async function runParallelForks(forks, dbPool, sharedContext = '') {
  if (!Array.isArray(forks) || forks.length === 0) {
    throw new Error('forkRunner: forks array must be non-empty');
  }

  // Anti-recursive guard: fork children cannot themselves spawn forks
  if (process.env._FORK_CHILD === '1') {
    throw new Error('forkRunner: fork children cannot spawn further forks');
  }

  process.env._FORK_CHILD = '1';

  try {
    // Inject shared context into every fork query for cache prefix alignment
    const forkPromises = forks.map(({ agentName, query }) => {
      const contextualQuery = sharedContext
        ? `## Shared Context\n${sharedContext}\n\n## Your Query\n${query}`
        : query;
      return runAgent(agentName, contextualQuery, dbPool);
    });

    const results = await Promise.all(forkPromises);
    return results;
  } finally {
    delete process.env._FORK_CHILD;
  }
}

/**
 * Procurement fork — the canonical parallel query for "What should we buy?"
 * Runs InventoryAgent + ProcurementAgent + PricingAgent simultaneously.
 *
 * @param {string} sharedContext  - e.g. current date, budget, target categories
 * @param {object} dbPool
 * @returns {Promise<{inventory, procurement, pricing, synthesis}>}
 */
export async function runProcurementFork(sharedContext, dbPool) {
  const forks = [
    { agentName: 'inventory',    query: 'Which categories are running low or dead? What is the current sell-through rate per category?' },
    { agentName: 'procurement',  query: 'Which suppliers have the best quality and trend alignment right now? What should we order?' },
    { agentName: 'pricing',      query: 'What are the current margin velocities per category? Which thans need liquidation pricing?' }
  ];

  const [inventory, procurement, pricing] = await runParallelForks(forks, dbPool, sharedContext);

  // Synthesis context for coordinator
  const synthesis = [
    `## Inventory Signal\n${inventory.verdict}`,
    `## Procurement Signal\n${procurement.verdict}`,
    `## Pricing Signal\n${pricing.verdict}`
  ].join('\n\n');

  return { inventory, procurement, pricing, synthesis };
}

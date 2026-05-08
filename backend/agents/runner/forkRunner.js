// forkRunner.js — Parallel fork engine for multi-agent procurement queries
// Phase 4: Technical Foundation
//
// Fires Inventory + Procurement + Pricing agents simultaneously via Promise.all().
// Anti-recursive guard: sets _FORK_CHILD=true so fork children cannot spawn further forks.

import { runAgent } from './agentRunner.js'

/**
 * runProcurementFork(context, username?)
 *
 * Fires 3 agents in parallel with a shared context prefix:
 *   - InventoryAgent  → which categories are low/dead?
 *   - ProcurementAgent → which suppliers to order from?
 *   - PricingAgent    → current margin velocities?
 *
 * Coordinator synthesizes the three verdicts into a final BUY/HOLD/AVOID decision.
 */
export async function runProcurementFork({ context = '', username = 'system' }) {
    // Anti-recursive guard
    if (process.env._FORK_CHILD === 'true') {
        throw new Error('Fork children cannot spawn further forks.')
    }

    const sharedContext = [
        `Date: ${new Date().toISOString().split('T')[0]}`,
        `Business: KT Impex wholesale textile, Birgunj, Nepal`,
        context,
    ].filter(Boolean).join(' | ')

    // Fire all three agents simultaneously
    const [inventoryResult, procurementResult, pricingResult] = await Promise.all([
        runAgent({
            agentName: 'inventory',
            query:     'Which categories are running low or have dead stock? List them with days-without-movement.',
            context:   sharedContext,
            username,
        }),
        runAgent({
            agentName: 'procurement',
            query:     'Which suppliers should we order from next? Rank by quality score and trend alignment.',
            context:   sharedContext,
            username,
        }),
        runAgent({
            agentName: 'pricing',
            query:     'What are the current margin velocities per category? Flag any items needing liquidation pricing.',
            context:   sharedContext,
            username,
        }),
    ])

    // Coordinator synthesis
    const coordinatorContext = [
        sharedContext,
        `\nInventory Signal: ${inventoryResult.verdict || inventoryResult.fullResponse.slice(0, 300)}`,
        `\nProcurement Signal: ${procurementResult.verdict || procurementResult.fullResponse.slice(0, 300)}`,
        `\nPricing Signal: ${pricingResult.verdict || pricingResult.fullResponse.slice(0, 300)}`,
    ].join('')

    const coordinatorResult = await runAgent({
        agentName: 'coordinator',
        query:     'Synthesize the three agent signals above into a final procurement verdict per category. Format: VERDICT: BUY/HOLD/AVOID [category] — [reason]',
        context:   coordinatorContext,
        username,
    })

    return {
        forks: {
            inventory:   inventoryResult,
            procurement: procurementResult,
            pricing:     pricingResult,
        },
        coordinator: coordinatorResult,
        totalDurationMs:
            inventoryResult.durationMs +
            procurementResult.durationMs +
            pricingResult.durationMs +
            coordinatorResult.durationMs,
    }
}

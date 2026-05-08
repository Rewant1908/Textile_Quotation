// memoryManager.js — Live DB → Agent Memory injection layer
// Phase 6: AI Memory Design
//
// Problem: agents run on static .MEMORY.md seed files only.
// Solution: before dispatching an agent, call buildLiveContext(agentName, db)
// to fetch fresh DB snapshots and inject them as structured context strings.
//
// Usage in routes/agents.js:
//   import { buildLiveContext } from '../agents/runner/memoryManager.js'
//   const liveCtx = await buildLiveContext(agentName, db)
//   const result  = await runAgent({ agentName, query, context: liveCtx, username })
//
// This keeps .MEMORY.md as domain knowledge (heuristics, rules, history)
// and liveContext as operational snapshot (current numbers, today's data).

/**
 * buildLiveContext(agentName, db)
 *
 * Returns a compact context string tailored to the agent type.
 * Queries are intentionally lightweight (no JOINs over full tables).
 * All queries use parameterized form — no string interpolation.
 *
 * @param {string} agentName - one of: inventory, retailer, procurement,
 *                              warehouse, pricing, sales, coordinator
 * @param {object} db        - MariaDB pool (from db.js)
 * @returns {Promise<string>}
 */
export async function buildLiveContext(agentName, db) {
    try {
        switch (agentName) {
            case 'inventory':   return await _inventoryContext(db)
            case 'retailer':    return await _retailerContext(db)
            case 'procurement': return await _procurementContext(db)
            case 'warehouse':   return await _warehouseContext(db)
            case 'pricing':     return await _pricingContext(db)
            case 'sales':       return await _salesContext(db)
            case 'coordinator': return await _coordinatorContext(db)
            default:            return ''
        }
    } catch (err) {
        // Never crash the agent call due to a DB error in context building
        console.error(`[memoryManager] buildLiveContext(${agentName}) failed:`, err.message)
        return `(live context unavailable: ${err.message})`
    }
}

// ---------------------------------------------------------------------------
// Inventory Agent — stock health snapshot
// ---------------------------------------------------------------------------
async function _inventoryContext(db) {
    const [totals] = await db.query(`
        SELECT
            COUNT(*)                                          AS total_thans,
            SUM(remaining_stock)                              AS total_meters,
            SUM(CASE WHEN movement_speed = 'dead'   THEN 1 ELSE 0 END) AS dead_count,
            SUM(CASE WHEN movement_speed = 'slow'   THEN 1 ELSE 0 END) AS slow_count,
            SUM(CASE WHEN movement_speed = 'fast'   THEN 1 ELSE 0 END) AS fast_count,
            SUM(CASE WHEN movement_speed = 'new'    THEN 1 ELSE 0 END) AS new_count,
            ROUND(SUM(remaining_stock * cost_per_meter), 2)  AS total_stock_value
        FROM thans
        WHERE status != 'sold'
    `)

    const deadRows = await db.query(`
        SELECT fabric_type, color, design,
               remaining_stock, warehouse_location,
               DATEDIFF(NOW(), updated_at) AS days_stagnant
        FROM thans
        WHERE movement_speed = 'dead' AND status != 'sold'
        ORDER BY days_stagnant DESC
        LIMIT 10
    `)

    const categoryRows = await db.query(`
        SELECT p.category,
               COUNT(t.than_id)        AS than_count,
               SUM(t.remaining_stock)  AS meters_remaining,
               ROUND(AVG(t.selling_price - t.cost_per_meter), 2) AS avg_margin
        FROM thans t
        JOIN products p ON t.product_id = p.product_id
        WHERE t.status != 'sold'
        GROUP BY p.category
        ORDER BY meters_remaining DESC
    `)

    const lines = [
        `## Live Inventory Snapshot — ${_today()}`,
        `Total Thans: ${totals[0].total_thans} | Total Meters: ${totals[0].total_meters} | Stock Value: ₹${totals[0].total_stock_value}`,
        `Movement: Fast=${totals[0].fast_count} Slow=${totals[0].slow_count} Dead=${totals[0].dead_count} New=${totals[0].new_count}`,
        '',
        '### Dead Stock (top 10 by days stagnant)',
        ...deadRows.map(r =>
            `- ${r.fabric_type} ${r.color} ${r.design || ''} | ${r.remaining_stock}m | Loc: ${r.warehouse_location || 'unassigned'} | ${r.days_stagnant}d stagnant`
        ),
        '',
        '### Category Breakdown',
        ...categoryRows.map(r =>
            `- ${r.category}: ${r.than_count} thans, ${r.meters_remaining}m remaining, avg margin ₹${r.avg_margin}/m`
        ),
    ]
    return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Retailer Agent — retailer behavior snapshot
// ---------------------------------------------------------------------------
async function _retailerContext(db) {
    const topRetailers = await db.query(`
        SELECT r.shop_name, r.market_location, r.payment_pattern,
               r.outstanding_balance, r.preferred_price_segment,
               COUNT(t.transaction_id)      AS total_orders,
               ROUND(SUM(t.price * t.quantity), 2) AS total_revenue,
               MAX(t.created_at)            AS last_order_date
        FROM retailers r
        LEFT JOIN transactions t ON r.retailer_id = t.retailer_id
        GROUP BY r.retailer_id
        ORDER BY total_revenue DESC
        LIMIT 15
    `)

    const overdueRows = await db.query(`
        SELECT shop_name, market_location,
               outstanding_balance, payment_pattern
        FROM retailers
        WHERE outstanding_balance > 0
        ORDER BY outstanding_balance DESC
        LIMIT 10
    `)

    const lines = [
        `## Live Retailer Snapshot — ${_today()}`,
        '',
        '### Top 15 Retailers by Revenue',
        ...topRetailers.map(r =>
            `- ${r.shop_name} (${r.market_location}): ${r.total_orders} orders, ₹${r.total_revenue} revenue, last order: ${_dateStr(r.last_order_date)}, payment: ${r.payment_pattern}, balance: ₹${r.outstanding_balance}`
        ),
        '',
        '### Outstanding Balances (top 10)',
        ...overdueRows.map(r =>
            `- ${r.shop_name} (${r.market_location}): ₹${r.outstanding_balance} outstanding, pattern: ${r.payment_pattern}`
        ),
    ]
    return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Procurement Agent — bale/supplier snapshot
// ---------------------------------------------------------------------------
async function _procurementContext(db) {
    const baleRows = await db.query(`
        SELECT b.bale_code, b.fabric_category, b.purchase_cost,
               b.arrival_date, b.status, s.supplier_name,
               s.quality_rating, s.delay_frequency
        FROM bales b
        JOIN suppliers s ON b.supplier_id = s.supplier_id
        ORDER BY b.arrival_date DESC
        LIMIT 20
    `)

    const supplierPerf = await db.query(`
        SELECT s.supplier_name, s.quality_rating, s.delay_frequency,
               s.trend_alignment, s.price_range,
               COUNT(b.bale_id) AS total_bales_purchased
        FROM suppliers s
        LEFT JOIN bales b ON s.supplier_id = b.supplier_id
        GROUP BY s.supplier_id
        ORDER BY s.quality_rating DESC
    `)

    const lowStockCats = await db.query(`
        SELECT p.category, SUM(t.remaining_stock) AS meters_left
        FROM thans t
        JOIN products p ON t.product_id = p.product_id
        WHERE t.status != 'sold'
        GROUP BY p.category
        HAVING meters_left < 200
        ORDER BY meters_left ASC
    `)

    const lines = [
        `## Live Procurement Snapshot — ${_today()}`,
        '',
        '### Recent Bale Purchases (last 20)',
        ...baleRows.map(r =>
            `- ${r.bale_code} | ${r.fabric_category} | ${r.supplier_name} (quality: ${r.quality_rating}, delays: ${r.delay_frequency}) | ₹${r.purchase_cost} | arrived: ${_dateStr(r.arrival_date)} | status: ${r.status}`
        ),
        '',
        '### Supplier Performance',
        ...supplierPerf.map(r =>
            `- ${r.supplier_name}: quality=${r.quality_rating}/5, delay_freq=${r.delay_frequency}, trend_align=${r.trend_alignment}, price_range=${r.price_range}, bales_bought=${r.total_bales_purchased}`
        ),
        '',
        '### Low Stock Categories (<200m remaining)',
        lowStockCats.length
            ? lowStockCats.map(r => `- ${r.category}: ${r.meters_left}m left`).join('\n')
            : '- No critical low-stock categories at this time.',
    ]
    return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Warehouse Agent — location and movement snapshot
// ---------------------------------------------------------------------------
async function _warehouseContext(db) {
    const locationRows = await db.query(`
        SELECT warehouse_location,
               COUNT(*)              AS than_count,
               SUM(remaining_stock)  AS total_meters,
               SUM(CASE WHEN movement_speed = 'dead' THEN 1 ELSE 0 END) AS dead_count
        FROM thans
        WHERE status != 'sold'
        GROUP BY warehouse_location
        ORDER BY total_meters DESC
    `)

    const unassigned = await db.query(`
        SELECT COUNT(*) AS count FROM thans
        WHERE (warehouse_location IS NULL OR warehouse_location = '') AND status != 'sold'
    `)

    const recentMovements = await db.query(`
        SELECT im.movement_type, im.quantity,
               t.fabric_type, t.color, im.notes, im.movement_date
        FROM inventory_movements im
        JOIN thans t ON im.than_id = t.than_id
        ORDER BY im.movement_date DESC
        LIMIT 20
    `)

    const lines = [
        `## Live Warehouse Snapshot — ${_today()}`,
        `Unassigned thans (no location): ${unassigned[0]?.count || 0}`,
        '',
        '### Stock by Location',
        ...locationRows.map(r =>
            `- ${r.warehouse_location || 'unassigned'}: ${r.than_count} thans, ${r.total_meters}m, dead=${r.dead_count}`
        ),
        '',
        '### Recent Inventory Movements (last 20)',
        ...recentMovements.map(r =>
            `- [${_dateStr(r.movement_date)}] ${r.movement_type} | ${r.fabric_type} ${r.color} | qty: ${r.quantity} | ${r.notes || ''}`
        ),
    ]
    return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Pricing Agent — margin and velocity snapshot
// ---------------------------------------------------------------------------
async function _pricingContext(db) {
    const marginRows = await db.query(`
        SELECT p.category,
               ROUND(AVG(t.margin), 2)        AS avg_margin,
               ROUND(MIN(t.margin), 2)        AS min_margin,
               ROUND(MAX(t.margin), 2)        AS max_margin,
               COUNT(t.transaction_id)        AS txn_count,
               ROUND(SUM(t.margin * t.quantity), 2) AS total_margin_earned
        FROM transactions t
        JOIN thans th ON t.than_id = th.than_id
        JOIN products p ON th.product_id = p.product_id
        WHERE t.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
        GROUP BY p.category
        ORDER BY avg_margin DESC
    `)

    const discountRows = await db.query(`
        SELECT ROUND(AVG(discount), 2) AS avg_discount,
               MAX(discount)           AS max_discount,
               COUNT(*)                AS txn_with_discount
        FROM transactions
        WHERE discount > 0
          AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `)

    const lowMarginThans = await db.query(`
        SELECT fabric_type, color, design,
               cost_per_meter, selling_price,
               (selling_price - cost_per_meter) AS margin,
               remaining_stock
        FROM thans
        WHERE status != 'sold'
          AND (selling_price - cost_per_meter) < 10
        ORDER BY margin ASC
        LIMIT 10
    `)

    const lines = [
        `## Live Pricing Snapshot — ${_today()}`,
        '',
        '### Margin by Category (last 90 days)',
        ...marginRows.map(r =>
            `- ${r.category}: avg ₹${r.avg_margin}/m, min ₹${r.min_margin}/m, max ₹${r.max_margin}/m, ${r.txn_count} txns, total margin ₹${r.total_margin_earned}`
        ),
        '',
        `### Discount Activity (last 30 days): avg=${discountRows[0]?.avg_discount}%, max=${discountRows[0]?.max_discount}%, ${discountRows[0]?.txn_with_discount} discounted txns`,
        '',
        '### Low Margin Thans (<₹10/m margin)',
        lowMarginThans.length
            ? lowMarginThans.map(r =>
                `- ${r.fabric_type} ${r.color} ${r.design || ''}: cost ₹${r.cost_per_meter}/m, selling ₹${r.selling_price}/m, margin ₹${r.margin}/m, ${r.remaining_stock}m left`
              ).join('\n')
            : '- No critically low-margin stock at this time.',
    ]
    return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Sales Agent — recent transactions and quotations snapshot
// ---------------------------------------------------------------------------
async function _salesContext(db) {
    const recentTxns = await db.query(`
        SELECT r.shop_name, t.quantity, t.price, t.margin,
               t.payment_method, t.discount, t.created_at,
               th.fabric_type, th.color
        FROM transactions t
        JOIN retailers r  ON t.retailer_id = r.retailer_id
        JOIN thans th     ON t.than_id     = th.than_id
        ORDER BY t.created_at DESC
        LIMIT 20
    `)

    const pendingQuotes = await db.query(`
        SELECT q.quotation_number, c.customer_name,
               q.total_amount, q.status, q.valid_until, q.created_at
        FROM quotations q
        JOIN customers c ON q.customer_id = c.customer_id
        WHERE q.status IN ('draft', 'sent')
        ORDER BY q.created_at DESC
        LIMIT 10
    `)

    const lines = [
        `## Live Sales Snapshot — ${_today()}`,
        '',
        '### Recent Transactions (last 20)',
        ...recentTxns.map(r =>
            `- ${_dateStr(r.created_at)} | ${r.shop_name} | ${r.fabric_type} ${r.color} | ${r.quantity}m @ ₹${r.price}/m | margin ₹${r.margin}/m | ${r.payment_method}${r.discount ? ` | disc ${r.discount}%` : ''}`
        ),
        '',
        '### Pending Quotations',
        pendingQuotes.length
            ? pendingQuotes.map(r =>
                `- ${r.quotation_number} | ${r.customer_name} | ₹${r.total_amount} | status: ${r.status} | valid until: ${_dateStr(r.valid_until)}`
              ).join('\n')
            : '- No pending quotations.',
    ]
    return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Coordinator Agent — cross-domain summary
// ---------------------------------------------------------------------------
async function _coordinatorContext(db) {
    // Pull mini-snapshots from each domain
    const [inv, ret, proc, price] = await Promise.all([
        _inventoryContext(db),
        _retailerContext(db),
        _procurementContext(db),
        _pricingContext(db),
    ])

    return [
        `## Coordinator Live Context — ${_today()}`,
        '(Cross-domain operational snapshot for synthesis)',
        '',
        inv,
        '',
        ret,
        '',
        proc,
        '',
        price,
    ].join('\n')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function _today() {
    return new Date().toISOString().split('T')[0]
}

function _dateStr(d) {
    if (!d) return 'N/A'
    return new Date(d).toISOString().split('T')[0]
}

// backend/agents/tools/dealerTools.js
// Dealer-scoped tools for WhatsApp and authenticated dealer assistant chats.
// All queries are constrained by assigned user_id to prevent cross-dealer leakage.

export function buildDealerTools(userId) {
  const uid = Number(userId)

  return [
    {
      name: 'get_my_kpis',
      description: 'Get my quotation KPI counters and accepted value totals.',
      parameters: { type: 'object', properties: {}, required: [] },
      execute: async (_args, db) => {
        const [[kpis]] = await db.query(
          `SELECT
             COUNT(*)                           AS total_quotations,
             SUM(status IN ('draft','pending')) AS draft_count,
             SUM(status = 'sent')               AS sent_count,
             SUM(status = 'accepted')           AS accepted_count,
             SUM(status = 'declined')           AS declined_count,
             COALESCE(SUM(CASE WHEN status = 'accepted' THEN total_amount END), 0) AS total_accepted_value
           FROM quotations
           WHERE user_id = ?`,
          [uid]
        )
        return { kpis }
      },
    },
    {
      name: 'get_my_pending_orders',
      description: 'Get my draft/sent/pending quotations with customer details.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'Max rows. Default 10.' } },
        required: [],
      },
      execute: async (args, db) => {
        const limit = Math.max(1, Math.min(50, Number(args?.limit ?? 10)))
        const rows = await db.query(
          `SELECT q.quotation_id, q.quotation_number, q.status, q.total_amount, q.created_at,
                  c.customer_name, c.contact_phone
           FROM quotations q
           LEFT JOIN customers c ON c.customer_id = q.customer_id
           WHERE q.user_id = ?
             AND q.status IN ('draft', 'pending', 'sent')
           ORDER BY q.created_at DESC
           LIMIT ?`,
          [uid, limit]
        )
        return { rows, count: rows.length }
      },
    },
    {
      name: 'get_my_receivables',
      description: 'Get my accepted quotations receivables with ageing buckets.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'Max rows. Default 10.' } },
        required: [],
      },
      execute: async (args, db) => {
        const limit = Math.max(1, Math.min(50, Number(args?.limit ?? 10)))
        const rows = await db.query(
          `SELECT q.quotation_id, q.quotation_number, q.total_amount,
                  q.updated_at AS accepted_on,
                  c.customer_name, c.contact_phone,
                  DATEDIFF(CURDATE(), DATE(q.updated_at)) AS days_outstanding,
                  CASE
                    WHEN DATEDIFF(CURDATE(), DATE(q.updated_at)) <= 30 THEN '0-30 days'
                    WHEN DATEDIFF(CURDATE(), DATE(q.updated_at)) <= 60 THEN '31-60 days'
                    WHEN DATEDIFF(CURDATE(), DATE(q.updated_at)) <= 90 THEN '61-90 days'
                    ELSE '90+ days'
                  END AS ageing_bucket
           FROM quotations q
           LEFT JOIN customers c ON c.customer_id = q.customer_id
           WHERE q.user_id = ?
             AND q.status = 'accepted'
           ORDER BY days_outstanding DESC
           LIMIT ?`,
          [uid, limit]
        )
        return { rows, count: rows.length }
      },
    },
    {
      name: 'get_dealer_ageing_stock_offers',
      description: 'Get shared slow/dead stock offers with computed discount tiers.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'Max rows. Default 10.' } },
        required: [],
      },
      execute: async (args, db) => {
        const limit = Math.max(1, Math.min(60, Number(args?.limit ?? 10)))
        const rows = await db.query(
          `SELECT t.than_code, t.fabric_type, t.color, t.design,
                  t.remaining_stock, t.selling_price, t.movement_speed,
                  CASE
                    WHEN t.movement_speed = 'dead'
                     AND DATEDIFF(CURDATE(), DATE(COALESCE(MAX(im.movement_date), t.created_at))) > 60 THEN 25
                    WHEN t.movement_speed = 'dead' THEN 15
                    ELSE 10
                  END AS discount_pct,
                  ROUND(
                    t.selling_price * (
                      1 - CASE
                            WHEN t.movement_speed = 'dead'
                             AND DATEDIFF(CURDATE(), DATE(COALESCE(MAX(im.movement_date), t.created_at))) > 60 THEN 0.25
                            WHEN t.movement_speed = 'dead' THEN 0.15
                            ELSE 0.10
                          END
                    ), 2
                  ) AS offer_price
           FROM thans t
           LEFT JOIN inventory_movements im ON im.than_id = t.than_id
           WHERE t.remaining_stock > 0
             AND t.movement_speed IN ('slow', 'dead')
           GROUP BY t.than_id, t.than_code, t.fabric_type, t.color, t.design,
                    t.remaining_stock, t.selling_price, t.movement_speed, t.created_at
           ORDER BY CASE t.movement_speed WHEN 'dead' THEN 0 ELSE 1 END,
                    DATEDIFF(CURDATE(), DATE(COALESCE(MAX(im.movement_date), t.created_at))) DESC
           LIMIT ?`,
          [limit]
        )
        return { rows, count: rows.length }
      },
    },
    {
      name: 'search_inventory_for_dealer',
      description: 'Search available thans by code, fabric, color, design or category.',
      parameters: {
        type: 'object',
        properties: {
          search_term: { type: 'string', description: 'Fabric, color, than code, design or category.' },
          limit: { type: 'number', description: 'Max rows. Default 5.' },
        },
        required: ['search_term'],
      },
      execute: async (args, db) => {
        const limit = Math.max(1, Math.min(20, Number(args?.limit ?? 5)))
        const term = `%${String(args.search_term || '').trim()}%`
        const rows = await db.query(
          `SELECT t.than_code, t.fabric_type, t.color, t.design,
                  t.remaining_stock, t.selling_price, t.warehouse_location, t.image_url
           FROM thans t
           LEFT JOIN products p ON p.product_id = t.product_id
           WHERE t.remaining_stock > 0
             AND (
               t.than_code LIKE ? OR t.fabric_type LIKE ? OR t.color LIKE ?
               OR t.design LIKE ? OR COALESCE(p.category, '') LIKE ?
             )
           ORDER BY t.remaining_stock DESC
           LIMIT ?`,
          [term, term, term, term, term, limit]
        )
        return { rows, count: rows.length }
      },
    },
  ]
}

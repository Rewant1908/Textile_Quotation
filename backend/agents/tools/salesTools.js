// backend/agents/tools/salesTools.js
// Real DB schema for transactions (verified from memoryManager + sales route):
//   TABLE: transactions
//     transaction_id, retailer_id, than_id, price, quantity,
//     margin, payment_method, discount, created_at
//   NO: total_amount, transaction_type, transaction_date,
//       payment_status, amount_paid, product_id
//
//   TABLE: retailers
//     retailer_id, shop_name, market_location, payment_pattern,
//     outstanding_balance, preferred_price_segment, is_deleted
//   NO: name, city, phone, credit_limit, status columns

export const salesTools = [
  {
    name: 'get_sales_summary',
    description:
      'Returns total revenue, units sold, and transaction count for a given period. ' +
      'Use when asked for weekly/monthly sales summary, total revenue, or sales performance.',
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'this_week', 'this_month', 'last_month', 'last_30_days', 'last_90_days'],
          description: 'Time period for the summary.',
        },
      },
      required: ['period'],
    },
    execute: async (args, db) => {
      const periodMap = {
        today:        'DATE(created_at) = CURDATE()',
        this_week:    'YEARWEEK(created_at, 1) = YEARWEEK(NOW(), 1)',
        this_month:   'MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW())',
        last_month:   'MONTH(created_at) = MONTH(NOW() - INTERVAL 1 MONTH) AND YEAR(created_at) = YEAR(NOW() - INTERVAL 1 MONTH)',
        last_30_days: 'created_at >= NOW() - INTERVAL 30 DAY',
        last_90_days: 'created_at >= NOW() - INTERVAL 90 DAY',
      }
      const condition = periodMap[args.period] || periodMap['this_month']
      const rows = await db.query(
        `SELECT COUNT(*)                            AS transaction_count,
                ROUND(SUM(price * quantity), 2)     AS total_revenue,
                SUM(quantity)                       AS total_units_sold,
                ROUND(AVG(price * quantity), 2)     AS avg_transaction_value,
                ROUND(SUM(margin * quantity), 2)    AS total_margin
         FROM   transactions
         WHERE  ${condition}`
      )
      return { period: args.period, summary: rows[0] }
    },
  },

  {
    name: 'get_top_selling_products',
    description:
      'Returns the best-selling products by revenue or quantity. ' +
      'Use when asked what is selling best, top performers, or bestsellers.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of products to return. Default 10.' },
        days:  { type: 'number', description: 'Look-back window in days. Default 30.' },
      },
      required: [],
    },
    execute: async (args, db) => {
      const limit = args.limit ?? 10
      const days  = args.days  ?? 30
      const rows = await db.query(
        `SELECT p.product_name, p.category,
                SUM(tx.quantity)                   AS total_units_sold,
                ROUND(SUM(tx.price * tx.quantity), 2) AS total_revenue,
                COUNT(tx.transaction_id)           AS transaction_count
         FROM   transactions tx
         JOIN   thans th ON th.than_id = tx.than_id
         JOIN   products p ON p.product_id = th.product_id
         WHERE  tx.created_at >= NOW() - INTERVAL ? DAY
         GROUP  BY p.product_id, p.product_name, p.category
         ORDER  BY total_revenue DESC
         LIMIT  ?`,
        [days, limit]
      )
      return { top_products: rows, days, limit }
    },
  },

  {
    name: 'get_sales_by_retailer',
    description:
      'Returns sales breakdown per retailer for a given period. ' +
      'Use when asked which retailers are buying most, or retailer-wise revenue.',
    parameters: {
      type: 'object',
      properties: {
        days:  { type: 'number', description: 'Look-back window in days. Default 30.' },
        limit: { type: 'number', description: 'Number of retailers. Default 10.' },
      },
      required: [],
    },
    execute: async (args, db) => {
      const days  = args.days  ?? 30
      const limit = args.limit ?? 10
      const rows = await db.query(
        `SELECT r.retailer_id, r.shop_name AS retailer_name, r.market_location,
                ROUND(SUM(tx.price * tx.quantity), 2) AS total_purchases,
                COUNT(tx.transaction_id)              AS transaction_count,
                SUM(tx.quantity)                      AS total_units
         FROM   transactions tx
         JOIN   retailers r ON r.retailer_id = tx.retailer_id
         WHERE  tx.created_at >= NOW() - INTERVAL ? DAY
         GROUP  BY r.retailer_id, r.shop_name, r.market_location
         ORDER  BY total_purchases DESC
         LIMIT  ?`,
        [days, limit]
      )
      return { retailer_sales: rows, days, limit }
    },
  },

  {
    name: 'get_daily_sales_trend',
    description:
      'Returns day-by-day revenue and unit totals for the past N days. ' +
      'Use to identify sales trends, spikes, or slow days.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of past days to return. Default 14.' },
      },
      required: [],
    },
    execute: async (args, db) => {
      const days = args.days ?? 14
      const rows = await db.query(
        `SELECT DATE(created_at)                      AS sale_date,
                ROUND(SUM(price * quantity), 2)       AS revenue,
                SUM(quantity)                         AS units_sold,
                COUNT(*)                              AS transactions
         FROM   transactions
         WHERE  created_at >= NOW() - INTERVAL ? DAY
         GROUP  BY sale_date
         ORDER  BY sale_date ASC`,
        [days]
      )
      return { daily_trend: rows, days }
    },
  },

  {
    name: 'get_outstanding_payments',
    description:
      'Returns retailers with outstanding balance > 0. ' +
      'Use when asked about dues, outstanding payments, or credit exposure.',
    parameters: {
      type: 'object',
      properties: {
        min_amount: { type: 'number', description: 'Minimum outstanding balance to include. Default 0.' },
      },
      required: [],
    },
    execute: async (args, db) => {
      const minAmount = args.min_amount ?? 0
      const rows = await db.query(
        `SELECT retailer_id, shop_name AS retailer_name,
                market_location, outstanding_balance, payment_pattern
         FROM   retailers
         WHERE  outstanding_balance > ?
           AND  (is_deleted = 0 OR is_deleted IS NULL)
         ORDER  BY outstanding_balance DESC
         LIMIT  50`,
        [minAmount]
      )
      return { outstanding_payments: rows, count: rows.length }
    },
  },
]

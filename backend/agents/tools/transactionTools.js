// backend/agents/tools/transactionTools.js
// Real DB schema for transactions:
//   TABLE: transactions
//     transaction_id, retailer_id, than_id, price, quantity,
//     margin, payment_method, discount, created_at
//
// NULL SAFETY: All optional params use anyOf:[type, null].

export const transactionTools = [
  {
    name: 'get_recent_transactions',
    description:
      'Returns recent sales transactions. Optionally filter by retailer or than. ' +
      'Use when asked about recent sales, what was sold, or transaction history.',
    parameters: {
      type: 'object',
      properties: {
        retailer_id: {
          anyOf: [{ type: 'number' }, { type: 'null' }],
          description: 'Filter by retailer. Pass null to get all retailers.'
        },
        than_id: {
          anyOf: [{ type: 'number' }, { type: 'null' }],
          description: 'Filter by specific than/bale. Pass null for all.'
        },
        limit: {
          anyOf: [{ type: 'number' }, { type: 'null' }],
          description: 'Max records. Default 20.'
        }
      },
      required: []
    },
    execute: async (args, db) => {
      const limit = (args.limit != null) ? args.limit : 20
      const where = []
      const params = []
      if (args.retailer_id != null) { where.push('tx.retailer_id = ?'); params.push(args.retailer_id) }
      if (args.than_id     != null) { where.push('tx.than_id = ?');     params.push(args.than_id)     }
      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
      params.push(limit)
      const rows = await db.query(
        `SELECT tx.transaction_id, tx.price, tx.quantity, tx.margin,
                tx.payment_method, tx.discount, tx.created_at,
                r.shop_name, r.market_location,
                t.fabric_type, t.color, t.design,
                p.product_name, p.category
         FROM transactions tx
         JOIN retailers r ON r.retailer_id = tx.retailer_id
         JOIN thans t     ON t.than_id     = tx.than_id
         JOIN products p  ON p.product_id  = t.product_id
         ${whereClause}
         ORDER BY tx.created_at DESC
         LIMIT ?`,
        params
      )
      return { transactions: rows, count: rows.length }
    }
  },

  {
    name: 'get_outstanding_balances',
    description:
      'Returns retailers with outstanding (unpaid) balances, sorted by amount descending. ' +
      'Use when asked about overdue payments, who owes money, or receivables.',
    parameters: {
      type: 'object',
      properties: {
        min_balance: {
          anyOf: [{ type: 'number' }, { type: 'null' }],
          description: 'Minimum outstanding_balance to include. Default 1.'
        }
      },
      required: []
    },
    execute: async (args, db) => {
      const min = (args.min_balance != null) ? args.min_balance : 1
      const rows = await db.query(
        `SELECT r.retailer_id, r.shop_name, r.market_location,
                r.outstanding_balance, r.payment_pattern
         FROM retailers r
         WHERE r.outstanding_balance >= ? AND r.is_deleted = 0
         ORDER BY r.outstanding_balance DESC
         LIMIT 50`,
        [min]
      )
      const total = rows.reduce((s, r) => s + Number(r.outstanding_balance), 0)
      return { retailers_with_dues: rows, count: rows.length, total_outstanding: total }
    }
  },

  {
    name: 'record_payment',
    description:
      'Record a payment received from a retailer (reduces outstanding_balance). ' +
      'Use when user says retailer paid, record payment, or settle balance.',
    parameters: {
      type: 'object',
      properties: {
        retailer_id:    { type: 'number' },
        amount:         { type: 'number' },
        payment_method: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
          description: 'cash | upi | bank_transfer | cheque. Default cash.'
        },
        notes: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
          description: 'Optional payment notes.'
        }
      },
      required: ['retailer_id', 'amount']
    },
    execute: async (args, db) => {
      const [retailer] = await db.query(
        'SELECT retailer_id, shop_name, outstanding_balance FROM retailers WHERE retailer_id = ? AND is_deleted = 0',
        [args.retailer_id]
      )
      if (!retailer) return { error: `Retailer #${args.retailer_id} not found.` }
      const newBalance = Math.max(0, Number(retailer.outstanding_balance) - Number(args.amount))
      await db.query(
        'UPDATE retailers SET outstanding_balance = ? WHERE retailer_id = ?',
        [newBalance, args.retailer_id]
      )
      return {
        success: true,
        retailer_id: args.retailer_id,
        shop_name: retailer.shop_name,
        amount_received: args.amount,
        old_balance: Number(retailer.outstanding_balance),
        new_balance: newBalance
      }
    }
  },

  {
    name: 'get_margin_analysis',
    description:
      'Returns margin analysis grouped by product category over a time period. ' +
      'Use when asked about profitability, margins, or which products make more money.',
    parameters: {
      type: 'object',
      properties: {
        days: {
          anyOf: [{ type: 'number' }, { type: 'null' }],
          description: 'Look-back window in days. Default 30.'
        }
      },
      required: []
    },
    execute: async (args, db) => {
      const days = (args.days != null) ? args.days : 30
      const rows = await db.query(
        `SELECT p.category,
                COUNT(tx.transaction_id)               AS transactions,
                SUM(tx.quantity)                       AS units_sold,
                ROUND(SUM(tx.price * tx.quantity), 2)  AS revenue,
                ROUND(SUM(tx.margin * tx.quantity), 2) AS total_margin,
                ROUND(AVG(tx.margin), 2)               AS avg_margin_per_m,
                ROUND(
                  100 * SUM(tx.margin * tx.quantity) /
                  NULLIF(SUM(tx.price * tx.quantity), 0)
                , 1)                                   AS margin_pct
         FROM transactions tx
         JOIN thans t    ON t.than_id    = tx.than_id
         JOIN products p ON p.product_id = t.product_id
         WHERE tx.created_at >= NOW() - INTERVAL ? DAY
         GROUP BY p.category
         ORDER BY total_margin DESC`,
        [days]
      )
      return { margin_analysis: rows, period_days: days }
    }
  }
]

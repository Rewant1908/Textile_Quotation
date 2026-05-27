// backend/agents/tools/retailerTools.js
// NULL SAFETY: All optional params use anyOf:[type, null].

export const retailerTools = [
  {
    name: 'list_retailers',
    description:
      'List all active retailers. Optionally filter by market location or payment pattern. ' +
      'Use when asked about retailers, shops, customers, or market coverage.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
          description: 'Filter by market_location. Pass null to list all locations.'
        },
        payment_pattern: {
          anyOf: [
            { type: 'string', enum: ['cash', 'credit', 'mixed'] },
            { type: 'null' }
          ],
          description: 'Filter by payment pattern. Pass null for all.'
        },
        limit: {
          anyOf: [{ type: 'number' }, { type: 'null' }],
          description: 'Max results. Default 20.'
        }
      },
      required: []
    },
    execute: async (args, db) => {
      const limit = (args.limit != null) ? args.limit : 20
      const where = ['r.is_deleted = 0']
      const params = []
      if (args.location && typeof args.location === 'string') {
        where.push('r.market_location LIKE ?')
        params.push(`%${args.location}%`)
      }
      if (args.payment_pattern && typeof args.payment_pattern === 'string') {
        where.push('r.payment_pattern = ?')
        params.push(args.payment_pattern)
      }
      params.push(limit)
      const rows = await db.query(
        `SELECT r.retailer_id, r.shop_name, r.market_location,
                r.payment_pattern, r.outstanding_balance,
                r.preferred_price_segment
         FROM retailers r
         WHERE ${where.join(' AND ')}
         ORDER BY r.shop_name ASC
         LIMIT ?`,
        params
      )
      return { retailers: rows, count: rows.length }
    }
  },

  {
    name: 'get_retailer_detail',
    description: 'Get full details of a specific retailer including outstanding balance.',
    parameters: {
      type: 'object',
      properties: {
        retailer_id: { type: 'number', description: 'The retailer_id to look up.' }
      },
      required: ['retailer_id']
    },
    execute: async (args, db) => {
      const rows = await db.query(
        `SELECT r.*, u.full_name AS assigned_to
         FROM retailers r
         LEFT JOIN users u ON u.user_id = r.assigned_user_id
         WHERE r.retailer_id = ? AND r.is_deleted = 0`,
        [args.retailer_id]
      )
      if (!rows.length) return { error: `Retailer #${args.retailer_id} not found.` }
      return { retailer: rows[0] }
    }
  }
]

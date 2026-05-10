// backend/agents/tools/retailerTools.js
// Real DB schema for retailers (verified from memoryManager + retailers route):
//   TABLE: retailers
//     retailer_id, shop_name, market_location, payment_pattern,
//     outstanding_balance, preferred_price_segment, is_deleted
//   NO: name, city, phone, email, credit_limit, status columns
//   quotation_requests table does NOT exist — removed that join

export const retailerTools = [
  {
    name: 'list_retailers',
    description: 'List all retailers with optional market location filter.',
    parameters: { type: 'object', properties: {
      market_location: { type: 'string', description: 'Optional market location to filter by.' },
      limit:           { type: 'number', description: 'Max results. Default 30.' }
    }, required: [] },
    execute: async (args, db) => {
      const limit = args.limit ?? 30
      const rows = args.market_location
        ? await db.query(
            `SELECT retailer_id, shop_name, market_location, payment_pattern,
                    outstanding_balance, preferred_price_segment
             FROM retailers
             WHERE market_location LIKE ?
               AND (is_deleted = 0 OR is_deleted IS NULL)
             ORDER BY shop_name LIMIT ?`,
            [`%${args.market_location}%`, limit]
          )
        : await db.query(
            `SELECT retailer_id, shop_name, market_location, payment_pattern,
                    outstanding_balance, preferred_price_segment
             FROM retailers
             WHERE (is_deleted = 0 OR is_deleted IS NULL)
             ORDER BY shop_name LIMIT ?`,
            [limit]
          )
      return { retailers: rows, count: rows.length }
    }
  },

  {
    name: 'get_retailer_details',
    description: 'Get full details and recent transactions of a retailer.',
    parameters: { type: 'object', properties: {
      retailer_id: { type: 'number' }
    }, required: ['retailer_id'] },
    execute: async (args, db) => {
      const rows = await db.query(
        `SELECT * FROM retailers WHERE retailer_id = ?`, [args.retailer_id]
      )
      const r = rows[0]
      if (!r) return { error: `Retailer #${args.retailer_id} not found` }
      const orders = await db.query(
        `SELECT transaction_id, price, quantity, payment_method, created_at
         FROM transactions WHERE retailer_id = ? ORDER BY created_at DESC LIMIT 10`,
        [args.retailer_id]
      )
      return { retailer: r, recent_transactions: orders }
    }
  },

  {
    name: 'update_retailer_outstanding_balance',
    description: 'Update the outstanding balance for a retailer.',
    parameters: { type: 'object', properties: {
      retailer_id:         { type: 'number' },
      outstanding_balance: { type: 'number' }
    }, required: ['retailer_id', 'outstanding_balance'] },
    execute: async (args, db) => {
      await db.query(
        `UPDATE retailers SET outstanding_balance = ?, updated_at = NOW() WHERE retailer_id = ?`,
        [args.outstanding_balance, args.retailer_id]
      )
      return { success: true, retailer_id: args.retailer_id, new_outstanding_balance: args.outstanding_balance }
    }
  }
]

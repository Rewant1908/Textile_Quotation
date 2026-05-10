// backend/agents/tools/customerTools.js
// Schema aligned to quotations.js (verified):
//   TABLE: customers
//     customer_id, customer_name, contact_phone, email

export const customerTools = [
  {
    name: 'list_customers',
    description: 'List all customers. Use when user asks to see customers, client list, or buyer records.',
    parameters: { type: 'object', properties: {
      search: { type: 'string', description: 'Search by name or phone (partial match).' },
      limit:  { type: 'number', description: 'Max results. Default 30.' }
    }, required: [] },
    execute: async (args, db) => {
      const limit = args.limit ?? 30
      if (args.search?.trim()) {
        const term = `%${args.search.trim()}%`
        const rows = await db.query(
          `SELECT customer_id, customer_name, contact_phone, email
           FROM customers
           WHERE customer_name LIKE ? OR contact_phone LIKE ?
           ORDER BY customer_name
           LIMIT ?`, [term, term, limit]
        )
        return { customers: rows, count: rows.length }
      }
      const rows = await db.query(
        `SELECT customer_id, customer_name, contact_phone, email
         FROM customers ORDER BY customer_name LIMIT ?`, [limit]
      )
      return { customers: rows, count: rows.length }
    }
  },

  {
    name: 'get_customer',
    description: 'Get one customer with their full quotation history.',
    parameters: { type: 'object', properties: {
      customer_id: { type: 'number', description: 'Customer ID.' }
    }, required: ['customer_id'] },
    execute: async (args, db) => {
      const cust = (await db.query(
        `SELECT customer_id, customer_name, contact_phone, email
         FROM customers WHERE customer_id = ?`, [args.customer_id]
      ))[0]
      if (!cust) return { error: `Customer #${args.customer_id} not found` }
      const quotations = await db.query(
        `SELECT quotation_id, quotation_number, status, total_amount, created_at
         FROM quotations WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10`,
        [args.customer_id]
      )
      return { customer: cust, quotations }
    }
  },

  {
    name: 'update_customer',
    description: 'Update a customer record. Only provide the fields to change.',
    parameters: { type: 'object', properties: {
      customer_id:   { type: 'number', description: 'Customer ID to update.' },
      customer_name: { type: 'string' },
      contact_phone: { type: 'string' },
      email:         { type: 'string' }
    }, required: ['customer_id'] },
    execute: async (args, db) => {
      const check = (await db.query(
        `SELECT customer_id FROM customers WHERE customer_id = ?`, [args.customer_id]
      ))[0]
      if (!check) return { error: `Customer #${args.customer_id} not found` }
      await db.query(
        `UPDATE customers SET
           customer_name = COALESCE(?, customer_name),
           contact_phone = COALESCE(?, contact_phone),
           email         = COALESCE(?, email)
         WHERE customer_id = ?`,
        [
          args.customer_name?.trim() || null,
          args.contact_phone?.trim() || null,
          args.email?.trim()         || null,
          args.customer_id
        ]
      )
      return { success: true, message: `Customer #${args.customer_id} updated.` }
    }
  },

  {
    name: 'get_customer_quotation_stats',
    description: 'Get quotation stats for a customer: total quotations, accepted, declined, total revenue.',
    parameters: { type: 'object', properties: {
      customer_id: { type: 'number', description: 'Customer ID.' }
    }, required: ['customer_id'] },
    execute: async (args, db) => {
      const cust = (await db.query(
        `SELECT customer_name FROM customers WHERE customer_id = ?`, [args.customer_id]
      ))[0]
      if (!cust) return { error: `Customer #${args.customer_id} not found` }
      const stats = (await db.query(
        `SELECT
           COUNT(*)                                                           AS total_quotations,
           SUM(CASE WHEN status='accepted' THEN 1 ELSE 0 END)                AS accepted,
           SUM(CASE WHEN status='declined' THEN 1 ELSE 0 END)                AS declined,
           SUM(CASE WHEN status='sent'     THEN 1 ELSE 0 END)                AS sent,
           SUM(CASE WHEN status IN ('draft','pending') THEN 1 ELSE 0 END)    AS draft,
           COALESCE(SUM(CASE WHEN status='accepted' THEN total_amount END), 0) AS total_accepted_value
         FROM quotations WHERE customer_id = ?`, [args.customer_id]
      ))[0]
      return { customer_name: cust.customer_name, stats }
    }
  }
]

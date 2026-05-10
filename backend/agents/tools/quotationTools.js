// backend/agents/tools/quotationTools.js
// Rewritten to match real DB schema:
//   TABLE: quotations  (PK: quotation_id)
//   STATUS ENUM: 'draft' | 'pending' | 'sent' | 'accepted' | 'declined'
//   "pending" for agent purposes = status IN ('draft','pending','sent')
//   No quotation_items table — items are stored per-quotation as denormalised data
//   or joined via enquiry_items if applicable. Kept simple: list/get/accept/reject.

export const quotationTools = [
  {
    name: 'list_pending_quotations',
    description: 'List all quotations with status draft, pending, or sent (i.e. not yet accepted or declined). Use when user asks to see pending quotations, open requests, or what needs approval.',
    parameters: { type: 'object', properties: {
      limit: { type: 'number', description: 'Max results. Default 20.' }
    }, required: [] },
    execute: async (args, db) => {
      const limit = args.limit ?? 20
      const [rows] = await db.query(
        `SELECT q.quotation_id,
                q.quotation_number,
                q.status,
                q.total_amount,
                q.discount_percentage,
                q.notes,
                q.created_at,
                q.updated_at,
                r.retailer_name,
                r.city
         FROM   quotations q
         JOIN   retailers  r ON r.retailer_id = q.retailer_id
         WHERE  q.status IN ('draft', 'pending', 'sent')
         ORDER  BY q.created_at ASC
         LIMIT  ?`, [limit]
      )
      return { pending_quotations: rows, count: rows.length }
    }
  },

  {
    name: 'get_quotation_details',
    description: 'Get full details of a specific quotation by its ID. Use before accepting or rejecting.',
    parameters: { type: 'object', properties: {
      quotation_id: { type: 'number', description: 'The quotation ID.' }
    }, required: ['quotation_id'] },
    execute: async (args, db) => {
      const [[q]] = await db.query(
        `SELECT q.*,
                r.retailer_name, r.city, r.phone
         FROM   quotations q
         JOIN   retailers  r ON r.retailer_id = q.retailer_id
         WHERE  q.quotation_id = ?`, [args.quotation_id]
      )
      if (!q) return { error: `Quotation #${args.quotation_id} not found` }
      return { quotation: q }
    }
  },

  {
    name: 'accept_quotation',
    description: 'Accept a quotation and set its status to accepted. Optionally apply a discount percentage and add notes. Use when user says accept, approve, or confirm a quotation.',
    parameters: { type: 'object', properties: {
      quotation_id:  { type: 'number', description: 'Quotation ID to accept.' },
      discount_pct:  { type: 'number', description: 'Optional discount % to apply (0-100).' },
      notes:         { type: 'string', description: 'Optional approval notes.' }
    }, required: ['quotation_id'] },
    execute: async (args, db) => {
      const [[existing]] = await db.query(
        `SELECT status FROM quotations WHERE quotation_id = ?`, [args.quotation_id]
      )
      if (!existing) return { error: `Quotation #${args.quotation_id} not found` }
      if (existing.status === 'accepted') return { error: `Quotation #${args.quotation_id} is already accepted` }

      await db.query(
        `UPDATE quotations
         SET    status = 'accepted',
                notes  = COALESCE(?, notes),
                discount_percentage = COALESCE(?, discount_percentage),
                updated_at = NOW()
         WHERE  quotation_id = ?`,
        [args.notes ?? null, args.discount_pct ?? null, args.quotation_id]
      )
      return { success: true, quotation_id: args.quotation_id, new_status: 'accepted', message: `Quotation #${args.quotation_id} has been accepted.` }
    }
  },

  {
    name: 'reject_quotation',
    description: 'Reject (decline) a quotation and set its status to declined. A rejection reason is required. Use when user says reject or decline a quotation.',
    parameters: { type: 'object', properties: {
      quotation_id: { type: 'number', description: 'Quotation ID to reject.' },
      reason:       { type: 'string', description: 'Reason for rejection.' }
    }, required: ['quotation_id', 'reason'] },
    execute: async (args, db) => {
      const [[existing]] = await db.query(
        `SELECT status FROM quotations WHERE quotation_id = ?`, [args.quotation_id]
      )
      if (!existing) return { error: `Quotation #${args.quotation_id} not found` }
      if (existing.status === 'declined') return { error: `Quotation #${args.quotation_id} is already declined` }

      await db.query(
        `UPDATE quotations
         SET status = 'declined', notes = ?, updated_at = NOW()
         WHERE quotation_id = ?`,
        [args.reason, args.quotation_id]
      )
      return { success: true, quotation_id: args.quotation_id, new_status: 'declined' }
    }
  },

  {
    name: 'list_all_quotations',
    description: 'List quotations filtered by status. Use for accepted, declined, sent, or all quotations overview.',
    parameters: { type: 'object', properties: {
      status: { type: 'string', description: "Filter by status: 'draft', 'pending', 'sent', 'accepted', 'declined'. Omit for all." },
      limit:  { type: 'number', description: 'Max results. Default 25.' }
    }, required: [] },
    execute: async (args, db) => {
      const limit = args.limit ?? 25
      // Use parameterised where clause to avoid injection
      const validStatuses = ['draft', 'pending', 'sent', 'accepted', 'declined']
      const useStatus = args.status && validStatuses.includes(args.status)
      const sql = useStatus
        ? `SELECT q.quotation_id, q.quotation_number, q.status, q.total_amount, q.discount_percentage, q.created_at, q.updated_at, r.retailer_name, r.city
           FROM   quotations q JOIN retailers r ON r.retailer_id = q.retailer_id
           WHERE  q.status = ? ORDER BY q.updated_at DESC LIMIT ?`
        : `SELECT q.quotation_id, q.quotation_number, q.status, q.total_amount, q.discount_percentage, q.created_at, q.updated_at, r.retailer_name, r.city
           FROM   quotations q JOIN retailers r ON r.retailer_id = q.retailer_id
           ORDER  BY q.updated_at DESC LIMIT ?`
      const params = useStatus ? [args.status, limit] : [limit]
      const [rows] = await db.query(sql, params)
      return { quotations: rows, count: rows.length }
    }
  }
]

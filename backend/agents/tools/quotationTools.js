// backend/agents/tools/quotationTools.js
// NULL SAFETY: All optional params use anyOf:[type, null].

export const quotationTools = [
  {
    name: 'list_quotations',
    description:
      'List quotations with optional status filter. ' +
      'Status values: draft | sent | accepted | declined. ' +
      'Use when asked to show quotations, recent quotes, or pending quotes.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          anyOf: [
            { type: 'string', enum: ['draft', 'sent', 'accepted', 'declined'] },
            { type: 'null' }
          ],
          description: 'Filter by status. Pass null to list all statuses.'
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
      const rows = (args.status && typeof args.status === 'string')
        ? await db.query(
            `SELECT q.quotation_id,
                    COALESCE(q.quotation_number,
                      CONCAT('KTQ-', YEAR(q.created_at), '-', LPAD(q.quotation_id,6,'0'))
                    ) AS quotation_number,
                    c.customer_name, q.total_amount, q.status, q.created_at
             FROM quotations q
             LEFT JOIN customers c ON c.customer_id = q.customer_id
             WHERE q.status = ?
             ORDER BY q.created_at DESC LIMIT ?`,
            [args.status, limit]
          )
        : await db.query(
            `SELECT q.quotation_id,
                    COALESCE(q.quotation_number,
                      CONCAT('KTQ-', YEAR(q.created_at), '-', LPAD(q.quotation_id,6,'0'))
                    ) AS quotation_number,
                    c.customer_name, q.total_amount, q.status, q.created_at
             FROM quotations q
             LEFT JOIN customers c ON c.customer_id = q.customer_id
             ORDER BY q.created_at DESC LIMIT ?`,
            [limit]
          )
      return { quotations: rows, count: rows.length }
    }
  },

  {
    name: 'get_quotation_detail',
    description: 'Get full details of a specific quotation including all line items.',
    parameters: {
      type: 'object',
      properties: {
        quotation_id: { type: 'number', description: 'The quotation_id to look up.' }
      },
      required: ['quotation_id']
    },
    execute: async (args, db) => {
      const [q] = await db.query(
        `SELECT q.*,
                COALESCE(q.quotation_number,
                  CONCAT('KTQ-', YEAR(q.created_at), '-', LPAD(q.quotation_id,6,'0'))
                ) AS quotation_number,
                c.customer_name, c.phone AS customer_phone
         FROM quotations q
         LEFT JOIN customers c ON c.customer_id = q.customer_id
         WHERE q.quotation_id = ?`,
        [args.quotation_id]
      )
      if (!q) return { error: `Quotation #${args.quotation_id} not found.` }
      const items = await db.query(
        `SELECT qi.*, t.fabric_type, t.color, t.design, p.product_name
         FROM quotation_items qi
         JOIN thans t ON t.than_id = qi.than_id
         JOIN products p ON p.product_id = t.product_id
         WHERE qi.quotation_id = ?`,
        [args.quotation_id]
      )
      return { quotation: q, items, item_count: items.length }
    }
  },

  {
    name: 'update_quotation_status',
    description:
      'Update the status of a quotation. ' +
      'Use when user says mark as accepted, decline this quote, or change status.',
    parameters: {
      type: 'object',
      properties: {
        quotation_id: { type: 'number' },
        status: {
          type: 'string',
          enum: ['draft', 'sent', 'accepted', 'declined'],
          description: 'New status for the quotation.'
        }
      },
      required: ['quotation_id', 'status']
    },
    execute: async (args, db) => {
      const [existing] = await db.query(
        'SELECT quotation_id, status FROM quotations WHERE quotation_id = ?',
        [args.quotation_id]
      )
      if (!existing) return { error: `Quotation #${args.quotation_id} not found.` }
      await db.query(
        'UPDATE quotations SET status = ?, updated_at = NOW() WHERE quotation_id = ?',
        [args.status, args.quotation_id]
      )
      return {
        success: true,
        quotation_id: args.quotation_id,
        old_status: existing.status,
        new_status: args.status
      }
    }
  },

  {
    name: 'get_quotation_stats',
    description:
      'Returns conversion rates and aggregate stats for quotations. ' +
      'Use when asked about quote performance, win rate, or conversion.',
    parameters: { type: 'object', properties: {}, required: [] },
    execute: async (_args, db) => {
      const rows = await db.query(
        `SELECT
           COUNT(*)                                      AS total,
           SUM(status='draft')                           AS draft,
           SUM(status='sent')                            AS sent,
           SUM(status='accepted')                        AS accepted,
           SUM(status='declined')                        AS declined,
           ROUND(100*SUM(status='accepted')/COUNT(*),1)  AS win_rate_pct,
           ROUND(AVG(total_amount),2)                    AS avg_value,
           ROUND(SUM(CASE WHEN status='accepted' THEN total_amount ELSE 0 END),2) AS won_value
         FROM quotations`
      )
      return { stats: rows[0] }
    }
  }
]

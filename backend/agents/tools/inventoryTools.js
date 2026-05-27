// backend/agents/tools/inventoryTools.js
// Real DB schema for thans (verified from memoryManager + operations route):
//   TABLE: thans
//     than_id, product_id, fabric_type, color, design,
//     cost_per_meter, selling_price, remaining_stock,
//     movement_speed, status, warehouse_location, updated_at
//   STATUS values: 'active' | 'sold' (NOT 'sold_out', NOT 'cancelled')
//   MOVEMENT_SPEED values: 'new' | 'fast' | 'slow' | 'dead'
//
//   TABLE: inventory_movements
//     movement_id, than_id, movement_type, quantity, notes, movement_date
//
// NULL SAFETY: All optional params use anyOf:[type, null].

export const inventoryTools = [
  {
    name: 'get_low_stock_items',
    description:
      'Returns all thans (bales) whose remaining_stock is below the given threshold. ' +
      'Use when the user asks what is running low, what needs restocking, or what to reorder.',
    parameters: {
      type: 'object',
      properties: {
        threshold: {
          anyOf: [{ type: 'number' }, { type: 'null' }],
          description: 'Min remaining_stock to flag. Default 10.'
        }
      },
      required: [],
    },
    execute: async (args, db) => {
      const threshold = (args.threshold != null) ? args.threshold : 10
      const rows = await db.query(
        `SELECT t.than_id, t.fabric_type, t.color, t.design,
                t.remaining_stock, t.status, t.movement_speed,
                p.product_name, p.category,
                t.cost_per_meter, t.selling_price
         FROM   thans t
         JOIN   products p ON p.product_id = t.product_id
         WHERE  t.remaining_stock < ? AND t.status != 'sold'
         ORDER  BY t.remaining_stock ASC
         LIMIT  50`,
        [threshold]
      )
      return { low_stock_items: rows, threshold, count: rows.length }
    },
  },

  {
    name: 'get_dead_stock_items',
    description:
      'Returns thans classified as dead stock (movement_speed = dead) OR slow moving stock (movement_speed = slow). ' +
      'Use when the user asks about slow-moving inventory, dead stock, liquidation candidates, or aging stock.',
    parameters: {
      type: 'object',
      properties: {
        movement_speed: {
          anyOf: [
            { type: 'string', enum: ['dead', 'slow', 'both'] },
            { type: 'null' }
          ],
          description: 'Filter by movement speed: dead, slow, or both. Default is both.'
        }
      },
      required: []
    },
    execute: async (args, db) => {
      const speed = args.movement_speed || 'both'
      let speedCondition = `t.movement_speed IN ('dead', 'slow')`
      if (speed === 'dead') speedCondition = `t.movement_speed = 'dead'`
      if (speed === 'slow') speedCondition = `t.movement_speed = 'slow'`

      const rows = await db.query(
        `SELECT t.than_id, t.fabric_type, t.color, t.design,
                t.remaining_stock, t.movement_speed, t.status,
                p.product_name, p.category,
                t.cost_per_meter, t.selling_price,
                DATEDIFF(NOW(), t.updated_at) AS days_idle
         FROM   thans t
         JOIN   products p ON p.product_id = t.product_id
         WHERE  ${speedCondition}
           AND  t.remaining_stock > 0
         ORDER  BY
           CASE t.movement_speed WHEN 'dead' THEN 0 ELSE 1 END,
           days_idle DESC
         LIMIT  50`
      )
      return { dead_stock_items: rows, count: rows.length, filter: speed }
    },
  },

  {
    name: 'get_stock_summary_by_category',
    description:
      'Returns total remaining stock and bale count grouped by product category. ' +
      'Use for a high-level inventory overview or when asked "what do we have in stock?"',
    parameters: { type: 'object', properties: {}, required: [] },
    execute: async (_args, db) => {
      const rows = await db.query(
        `SELECT p.category,
                COUNT(t.than_id)              AS bale_count,
                SUM(t.remaining_stock)        AS total_stock,
                ROUND(AVG(t.selling_price), 2) AS avg_selling_price,
                ROUND(AVG(t.cost_per_meter), 2) AS avg_cost_price
         FROM   thans t
         JOIN   products p ON p.product_id = t.product_id
         WHERE  t.status != 'sold'
         GROUP  BY p.category
         ORDER  BY total_stock DESC`
      )
      return { category_summary: rows }
    },
  },

  {
    name: 'search_product_stock',
    description:
      'Search for a specific product by name, fabric type, color or category and return current stock details. ' +
      'Use when the user asks about a particular fabric, colour, or product.',
    parameters: {
      type: 'object',
      properties: {
        search_term: { type: 'string', description: 'Product name, category, fabric type, color, or partial name.' }
      },
      required: ['search_term'],
    },
    execute: async (args, db) => {
      const term = `%${args.search_term}%`
      const rows = await db.query(
        `SELECT t.than_id, t.fabric_type, t.color, t.design,
                t.remaining_stock, t.status, t.movement_speed,
                p.product_name, p.category,
                t.cost_per_meter, t.selling_price,
                t.updated_at
         FROM   thans t
         JOIN   products p ON p.product_id = t.product_id
         WHERE  (p.product_name LIKE ? OR p.category LIKE ?
              OR t.fabric_type LIKE ? OR t.color LIKE ? OR t.design LIKE ?)
           AND  t.status != 'sold'
         ORDER  BY t.remaining_stock DESC
         LIMIT  30`,
        [term, term, term, term, term]
      )
      return { results: rows, search_term: args.search_term, count: rows.length }
    },
  },

  {
    name: 'get_inventory_movement_history',
    description:
      'Returns recent inventory movements (IN / OUT / ADJUSTMENT) for a specific than or all thans. ' +
      'Use when tracing what happened to stock, or when debugging discrepancies.',
    parameters: {
      type: 'object',
      properties: {
        than_id: {
          anyOf: [{ type: 'number' }, { type: 'null' }],
          description: 'Optional than ID to filter movements for a single bale. Pass null for all.'
        },
        limit: {
          anyOf: [{ type: 'number' }, { type: 'null' }],
          description: 'Max records to return. Default 20.'
        }
      },
      required: [],
    },
    execute: async (args, db) => {
      const limit = (args.limit != null) ? args.limit : 20
      if (args.than_id != null) {
        const rows = await db.query(
          `SELECT im.movement_id, im.movement_type, im.quantity, im.movement_date,
                  im.notes, t.fabric_type, t.color, p.product_name
           FROM   inventory_movements im
           JOIN   thans t    ON t.than_id    = im.than_id
           JOIN   products p ON p.product_id = t.product_id
           WHERE  im.than_id = ?
           ORDER  BY im.movement_date DESC
           LIMIT  ?`,
          [args.than_id, limit]
        )
        return { movements: rows, than_id: args.than_id }
      }
      const rows = await db.query(
        `SELECT im.movement_id, im.movement_type, im.quantity, im.movement_date,
                im.notes, t.fabric_type, t.color, p.product_name, p.category
         FROM   inventory_movements im
         JOIN   thans t    ON t.than_id    = im.than_id
         JOIN   products p ON p.product_id = t.product_id
         ORDER  BY im.movement_date DESC
         LIMIT  ?`,
        [limit]
      )
      return { movements: rows, count: rows.length }
    },
  },
]

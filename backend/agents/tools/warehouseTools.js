// backend/agents/tools/warehouseTools.js
// Real DB schema for thans (verified from memoryManager + operations route):
//   TABLE: thans
//     than_id, product_id, fabric_type, color, design,
//     cost_per_meter, selling_price, remaining_stock,
//     movement_speed, status, warehouse_location, updated_at
//   STATUS values: 'active' | 'sold'  (NOT 'sold_out', NOT 'cancelled')
//   NO: than_name, total_quantity, purchase_price_per_unit, sale_price_per_unit

export const warehouseTools = [
  {
    name: 'get_warehouse_summary',
    description: 'Get total thans, total stock meters, and movement breakdown.',
    parameters: { type: 'object', properties: {}, required: [] },
    execute: async (_args, db) => {
      const rows = await db.query(
        `SELECT COUNT(*)                                            AS total_thans,
                SUM(remaining_stock)                               AS total_meters,
                SUM(CASE WHEN status = 'sold'   THEN 1 ELSE 0 END) AS sold_thans,
                SUM(CASE WHEN movement_speed = 'dead' THEN 1 ELSE 0 END) AS dead_stock_thans,
                SUM(CASE WHEN movement_speed = 'fast' THEN 1 ELSE 0 END) AS fast_moving,
                SUM(CASE WHEN movement_speed = 'slow' THEN 1 ELSE 0 END) AS slow_moving
         FROM thans`
      )
      return { warehouse_summary: rows[0] }
    }
  },

  {
    name: 'intake_bale',
    description: 'Record a new than (bale) intake into the warehouse.',
    parameters: { type: 'object', properties: {
      product_id:    { type: 'number', description: 'Product ID this than belongs to.' },
      fabric_type:   { type: 'string', description: 'Fabric type (e.g. cotton, polyester).' },
      color:         { type: 'string', description: 'Color of the fabric.' },
      design:        { type: 'string', description: 'Optional design/pattern name.' },
      total_meters:  { type: 'number', description: 'Total meters in this bale.' },
      cost_per_meter: { type: 'number', description: 'Purchase cost per meter.' },
      selling_price:  { type: 'number', description: 'Selling price per meter.' },
      warehouse_location: { type: 'string', description: 'Optional warehouse location.' }
    }, required: ['product_id', 'fabric_type', 'color', 'total_meters', 'cost_per_meter', 'selling_price'] },
    execute: async (args, db) => {
      const result = await db.query(
        `INSERT INTO thans
           (product_id, fabric_type, color, design,
            remaining_stock, cost_per_meter, selling_price,
            status, movement_speed, warehouse_location, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'new', ?, NOW())`,
        [
          args.product_id, args.fabric_type, args.color,
          args.design || null, args.total_meters,
          args.cost_per_meter, args.selling_price,
          args.warehouse_location || null
        ]
      )
      const than_id = Number(result.insertId)
      await db.query(
        `INSERT INTO inventory_movements (than_id, movement_type, quantity, notes, movement_date)
         VALUES (?, 'IN', ?, 'Bale intake via AI agent', NOW())`,
        [than_id, args.total_meters]
      )
      return {
        success: true,
        than_id,
        message: `Than (${args.fabric_type} ${args.color}) added with ${args.total_meters}m.`
      }
    }
  },

  {
    name: 'list_recent_intakes',
    description: 'List recently added thans/bales.',
    parameters: { type: 'object', properties: {
      limit: { type: 'number', description: 'Max results. Default 15.' }
    }, required: [] },
    execute: async (args, db) => {
      const limit = args.limit ?? 15
      const rows = await db.query(
        `SELECT t.than_id, t.fabric_type, t.color, t.design,
                t.remaining_stock, t.cost_per_meter, t.selling_price,
                t.warehouse_location, t.updated_at,
                p.product_name, p.category
         FROM thans t
         JOIN products p ON p.product_id = t.product_id
         ORDER BY t.updated_at DESC LIMIT ?`, [limit]
      )
      return { recent_intakes: rows, count: rows.length }
    }
  }
]

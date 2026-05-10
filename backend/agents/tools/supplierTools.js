// backend/agents/tools/supplierTools.js
// Schema aligned to suppliers.js route (verified):
//   TABLE: suppliers
//     supplier_id, supplier_name, factory_name, product_specialization,
//     quality_rating, delay_frequency, price_range, popular_categories,
//     return_issues, trend_alignment, created_at, is_deleted, deleted_at, deleted_by
//   TABLE: bales
//     bale_id, bale_code, supplier_id, factory_name, arrival_date,
//     purchase_cost, transport_cost, total_rolls, fabric_category, purchase_invoice, status
//   TABLE: thans
//     than_id, than_code, bale_id, product_id, fabric_type, color, design,
//     gsm, meter_length, cost_per_meter, selling_price, remaining_stock,
//     warehouse_location, movement_speed, status

export const supplierTools = [
  {
    name: 'list_suppliers',
    description: 'List all active (non-deleted) suppliers. Use when user asks to see suppliers, vendor list, or fabric sources.',
    parameters: { type: 'object', properties: {
      include_stock: { type: 'boolean', description: 'If true, include total thans and remaining stock via bales join. Default false.' }
    }, required: [] },
    execute: async (args, db) => {
      if (args.include_stock) {
        const rows = await db.query(
          `SELECT s.supplier_id, s.supplier_name, s.factory_name, s.product_specialization,
                  s.quality_rating, s.delay_frequency, s.price_range, s.popular_categories,
                  s.return_issues, s.trend_alignment, s.created_at,
                  COUNT(t.than_id)                    AS total_thans,
                  COALESCE(SUM(t.remaining_stock), 0) AS remaining_stock
           FROM suppliers s
           LEFT JOIN bales b ON b.supplier_id = s.supplier_id
           LEFT JOIN thans t ON t.bale_id     = b.bale_id
           WHERE IFNULL(s.is_deleted, 0) = 0
           GROUP BY s.supplier_id
           ORDER BY s.supplier_name`
        )
        return { suppliers: rows, count: rows.length }
      }
      const rows = await db.query(
        `SELECT supplier_id, supplier_name, factory_name, product_specialization,
                quality_rating, delay_frequency, price_range, popular_categories,
                return_issues, trend_alignment, created_at
         FROM suppliers
         WHERE IFNULL(is_deleted, 0) = 0
         ORDER BY supplier_name`
      )
      return { suppliers: rows, count: rows.length }
    }
  },

  {
    name: 'get_supplier',
    description: 'Get full details of one supplier by ID.',
    parameters: { type: 'object', properties: {
      supplier_id: { type: 'number', description: 'The supplier ID.' }
    }, required: ['supplier_id'] },
    execute: async (args, db) => {
      const rows = await db.query(
        `SELECT supplier_id, supplier_name, factory_name, product_specialization,
                quality_rating, delay_frequency, price_range, popular_categories,
                return_issues, trend_alignment, created_at
         FROM suppliers
         WHERE supplier_id = ? AND IFNULL(is_deleted, 0) = 0`, [args.supplier_id]
      )
      if (!rows[0]) return { error: `Supplier #${args.supplier_id} not found` }
      return { supplier: rows[0] }
    }
  },

  {
    name: 'create_supplier',
    description: 'Create a new supplier. Use when user wants to add a new vendor or supplier. supplier_name is required.',
    parameters: { type: 'object', properties: {
      supplier_name:          { type: 'string', description: 'Supplier / company name. Required.' },
      factory_name:           { type: 'string', description: 'Factory name if different from supplier name.' },
      product_specialization: { type: 'string', description: 'What fabric/product they specialize in.' },
      quality_rating:         { type: 'number', description: 'Quality rating 1-5.' },
      delay_frequency:        { type: 'string', description: "Delivery reliability: 'low', 'medium', 'high'. Default medium." },
      price_range:            { type: 'string', description: 'Price range description e.g. "120-200 per meter".' },
      popular_categories:     { type: 'string', description: 'Popular fabric categories.' },
      return_issues:          { type: 'string', description: 'Any known return/quality issues.' },
      trend_alignment:        { type: 'string', description: "How trend-aligned: 'poor', 'average', 'good'. Default average." }
    }, required: ['supplier_name'] },
    execute: async (args, db) => {
      if (!args.supplier_name?.trim()) return { error: 'supplier_name is required' }
      const result = await db.query(
        `INSERT INTO suppliers
           (supplier_name, factory_name, product_specialization, quality_rating,
            delay_frequency, price_range, popular_categories, return_issues, trend_alignment)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          args.supplier_name.trim(),
          args.factory_name?.trim()           || null,
          args.product_specialization?.trim() || null,
          args.quality_rating                 || null,
          args.delay_frequency                || 'medium',
          args.price_range?.trim()            || null,
          args.popular_categories?.trim()     || null,
          args.return_issues?.trim()          || null,
          args.trend_alignment                || 'average',
        ]
      )
      return { success: true, supplier_id: Number(result.insertId), message: `Supplier "${args.supplier_name}" created.` }
    }
  },

  {
    name: 'update_supplier',
    description: 'Update an existing supplier. Only provide the fields you want to change.',
    parameters: { type: 'object', properties: {
      supplier_id:            { type: 'number', description: 'Supplier ID to update.' },
      supplier_name:          { type: 'string' },
      factory_name:           { type: 'string' },
      product_specialization: { type: 'string' },
      quality_rating:         { type: 'number' },
      delay_frequency:        { type: 'string' },
      price_range:            { type: 'string' },
      popular_categories:     { type: 'string' },
      return_issues:          { type: 'string' },
      trend_alignment:        { type: 'string' }
    }, required: ['supplier_id'] },
    execute: async (args, db) => {
      const check = await db.query(
        `SELECT supplier_id FROM suppliers WHERE supplier_id = ? AND IFNULL(is_deleted,0)=0`,
        [args.supplier_id]
      )
      if (!check[0]) return { error: `Supplier #${args.supplier_id} not found` }
      await db.query(
        `UPDATE suppliers SET
           supplier_name          = COALESCE(?, supplier_name),
           factory_name           = COALESCE(?, factory_name),
           product_specialization = COALESCE(?, product_specialization),
           quality_rating         = COALESCE(?, quality_rating),
           delay_frequency        = COALESCE(?, delay_frequency),
           price_range            = COALESCE(?, price_range),
           popular_categories     = COALESCE(?, popular_categories),
           return_issues          = COALESCE(?, return_issues),
           trend_alignment        = COALESCE(?, trend_alignment)
         WHERE supplier_id = ? AND IFNULL(is_deleted,0)=0`,
        [
          args.supplier_name          || null,
          args.factory_name           || null,
          args.product_specialization || null,
          args.quality_rating         || null,
          args.delay_frequency        || null,
          args.price_range            || null,
          args.popular_categories     || null,
          args.return_issues          || null,
          args.trend_alignment        || null,
          args.supplier_id
        ]
      )
      return { success: true, message: `Supplier #${args.supplier_id} updated.` }
    }
  },

  {
    name: 'delete_supplier',
    description: 'Soft-delete a supplier. The supplier is marked deleted but bale/than history is preserved.',
    parameters: { type: 'object', properties: {
      supplier_id: { type: 'number', description: 'Supplier ID to soft-delete.' },
      deleted_by:  { type: 'number', description: 'user_id performing the deletion.' }
    }, required: ['supplier_id', 'deleted_by'] },
    execute: async (args, db) => {
      const result = await db.query(
        `UPDATE suppliers
         SET is_deleted = 1, deleted_at = NOW(), deleted_by = ?
         WHERE supplier_id = ? AND IFNULL(is_deleted,0)=0`,
        [args.deleted_by, args.supplier_id]
      )
      if (Number(result.affectedRows) === 0)
        return { error: `Supplier #${args.supplier_id} not found or already deleted` }
      return { success: true, message: `Supplier #${args.supplier_id} soft-deleted. History preserved.` }
    }
  },

  {
    name: 'create_bale',
    description: 'Register a new bale arrival from a supplier. Use when user says a bale arrived, new purchase, or new stock received. bale_code, arrival_date, purchase_cost, total_rolls, fabric_category are required.',
    parameters: { type: 'object', properties: {
      bale_code:        { type: 'string',  description: 'Unique bale code. Required.' },
      supplier_id:      { type: 'number',  description: 'Linked supplier ID.' },
      factory_name:     { type: 'string',  description: 'Factory name override.' },
      arrival_date:     { type: 'string',  description: 'Date received. Format YYYY-MM-DD. Required.' },
      purchase_cost:    { type: 'number',  description: 'Total purchase cost in Rs. Required.' },
      transport_cost:   { type: 'number',  description: 'Transport cost in Rs. Default 0.' },
      total_rolls:      { type: 'integer', description: 'Number of rolls in the bale. Required.' },
      fabric_category:  { type: 'string',  description: 'Fabric category e.g. Cotton, Silk. Required.' },
      purchase_invoice: { type: 'string',  description: 'Invoice reference number.' }
    }, required: ['bale_code', 'arrival_date', 'purchase_cost', 'total_rolls', 'fabric_category'] },
    execute: async (args, db) => {
      if (!args.bale_code?.trim()) return { error: 'bale_code is required' }
      const dup = await db.query(`SELECT bale_id FROM bales WHERE bale_code = ?`, [args.bale_code.trim()])
      if (dup[0]) return { error: `Bale code "${args.bale_code}" already exists` }
      if (Number(args.purchase_cost) < 0) return { error: 'purchase_cost cannot be negative' }
      if (!Number.isInteger(Number(args.total_rolls)) || Number(args.total_rolls) < 1)
        return { error: 'total_rolls must be a positive integer' }
      const result = await db.query(
        `INSERT INTO bales
           (bale_code, supplier_id, factory_name, arrival_date, purchase_cost,
            transport_cost, total_rolls, fabric_category, purchase_invoice, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'received')`,
        [
          args.bale_code.trim(),
          args.supplier_id              || null,
          args.factory_name?.trim()     || null,
          args.arrival_date,
          Number(args.purchase_cost),
          Number(args.transport_cost || 0),
          Number(args.total_rolls),
          args.fabric_category.trim(),
          args.purchase_invoice?.trim() || null,
        ]
      )
      return { success: true, bale_id: Number(result.insertId), message: `Bale "${args.bale_code}" registered.` }
    }
  },

  {
    name: 'breakdown_bale_into_thans',
    description: 'Break down a received bale into individual thans (fabric rolls). Each than needs than_code, fabric_type, meter_length, cost_per_meter, selling_price. selling_price must be >= cost_per_meter.',
    parameters: { type: 'object', properties: {
      bale_id: { type: 'number', description: 'Bale ID to break down. Required.' },
      thans: {
        type: 'array',
        description: 'Array of than objects.',
        items: {
          type: 'object',
          properties: {
            than_code:          { type: 'string',  description: 'Unique than code.' },
            product_id:         { type: 'number',  description: 'Linked product ID (optional).' },
            fabric_type:        { type: 'string',  description: 'Fabric type e.g. Cotton, Silk.' },
            color:              { type: 'string' },
            design:             { type: 'string' },
            gsm:                { type: 'number',  description: 'Grams per square meter.' },
            meter_length:       { type: 'number',  description: 'Total length in meters.' },
            cost_per_meter:     { type: 'number',  description: 'Cost per meter in Rs.' },
            selling_price:      { type: 'number',  description: 'Selling price per meter in Rs.' },
            warehouse_location: { type: 'string',  description: 'Storage location.' }
          },
          required: ['than_code', 'fabric_type', 'meter_length', 'cost_per_meter', 'selling_price']
        }
      }
    }, required: ['bale_id', 'thans'] },
    execute: async (args, db) => {
      const bales = await db.query(`SELECT bale_id, status FROM bales WHERE bale_id = ?`, [args.bale_id])
      if (!bales[0]) return { error: `Bale #${args.bale_id} not found` }
      if (!Array.isArray(args.thans) || args.thans.length === 0)
        return { error: 'thans array must not be empty' }

      for (let i = 0; i < args.thans.length; i++) {
        const t = args.thans[i]
        if (!t.than_code || !t.fabric_type)
          return { error: `Row ${i + 1}: than_code and fabric_type are required` }
        if (Number(t.cost_per_meter) <= 0)
          return { error: `Row ${i + 1}: cost_per_meter must be > 0` }
        if (Number(t.selling_price) <= 0)
          return { error: `Row ${i + 1}: selling_price must be > 0` }
        if (Number(t.meter_length) <= 0)
          return { error: `Row ${i + 1}: meter_length must be > 0` }
        if (Number(t.selling_price) < Number(t.cost_per_meter))
          return { error: `Row ${i + 1}: selling_price (${t.selling_price}) is below cost (${t.cost_per_meter})` }
      }

      const insertedIds = []
      for (const t of args.thans) {
        const dup = await db.query(`SELECT than_id FROM thans WHERE than_code = ?`, [t.than_code.trim()])
        if (dup[0]) return { error: `than_code "${t.than_code}" already exists — rolled back` }

        const meterLength = Number(t.meter_length)
        const result = await db.query(
          `INSERT INTO thans
             (than_code, bale_id, product_id, fabric_type, color, design, gsm,
              meter_length, cost_per_meter, selling_price, remaining_stock,
              warehouse_location, movement_speed, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 'available')`,
          [
            t.than_code.trim(), args.bale_id,
            t.product_id       || null,
            t.fabric_type.trim(),
            t.color?.trim()    || null,
            t.design?.trim()   || null,
            t.gsm ? Number(t.gsm) : null,
            meterLength,
            Number(t.cost_per_meter),
            Number(t.selling_price),
            meterLength,
            t.warehouse_location?.trim() || null
          ]
        )
        const thanId = Number(result.insertId)
        insertedIds.push(thanId)

        await db.query(
          `INSERT INTO inventory_movements
             (than_id, movement_type, quantity, from_location, to_location,
              reference_type, reference_id, notes, movement_date)
           VALUES (?, 'stock_in', ?, NULL, ?, 'bale', ?, ?, current_timestamp())`,
          [
            thanId, meterLength,
            t.warehouse_location?.trim() || null,
            args.bale_id,
            `Breakdown from bale ${args.bale_id}`
          ]
        )
      }

      await db.query(
        `UPDATE bales SET status = 'opened' WHERE bale_id = ? AND status = 'received'`,
        [args.bale_id]
      )

      return { success: true, inserted: insertedIds.length, than_ids: insertedIds, message: `${insertedIds.length} thans created from bale #${args.bale_id}.` }
    }
  },

  {
    name: 'list_bales',
    description: 'List all bales with summary of thans and remaining stock. Use when user asks about bale inventory, received bales, or stock arrivals.',
    parameters: { type: 'object', properties: {
      status: { type: 'string', description: "Filter by bale status: 'received', 'opened'. Omit for all." },
      limit:  { type: 'number', description: 'Max results. Default 30.' }
    }, required: [] },
    execute: async (args, db) => {
      const limit = args.limit ?? 30
      const whereStatus = args.status ? `AND b.status = ?` : ''
      const params = args.status ? [args.status, limit] : [limit]
      const rows = await db.query(
        `SELECT b.bale_id, b.bale_code, b.arrival_date, b.fabric_category,
                b.purchase_cost, b.transport_cost, b.total_rolls, b.status,
                b.purchase_invoice,
                s.supplier_name,
                COALESCE(b.factory_name, s.factory_name) AS factory_name,
                COUNT(t.than_id)                          AS thans_created,
                COALESCE(SUM(t.remaining_stock), 0)       AS total_remaining
         FROM bales b
         LEFT JOIN suppliers s ON b.supplier_id = s.supplier_id
         LEFT JOIN thans t     ON t.bale_id     = b.bale_id
         WHERE 1=1 ${whereStatus}
         GROUP BY b.bale_id, b.bale_code, b.arrival_date, b.fabric_category,
                  b.purchase_cost, b.transport_cost, b.total_rolls, b.status,
                  b.purchase_invoice, s.supplier_name, b.factory_name
         ORDER BY b.arrival_date DESC, b.bale_id DESC
         LIMIT ?`, params
      )
      return { bales: rows, count: rows.length }
    }
  }
]

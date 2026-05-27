// backend/agents/tools/productTools.js
// Real DB schema for products (verified from backend/routes/products.js):
//   TABLE: products
//     product_id, product_name, category, base_price
//   NO: description, unit, created_at, updated_at columns
//
// Real DB schema for thans (verified from memoryManager + operations route):
//   TABLE: thans
//     than_id, product_id, fabric_type, color, design,
//     cost_per_meter, selling_price, remaining_stock,
//     movement_speed, status, warehouse_location, updated_at
//   NO: than_name, total_quantity, purchase_price_per_unit, sale_price_per_unit
//
// NULL SAFETY: Claude passes explicit null for optional params it doesn't need.
// All optional params use anyOf:[type, null] so the API validator accepts null.

export const productTools = [
  {
    name: 'list_products',
    description: 'List all products with optional category filter. Pass a category string to filter, or omit/null to list all.',
    parameters: { type: 'object', properties: {
      category: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        description: 'Optional category to filter by. Pass null or omit to list all products.'
      },
      limit: {
        anyOf: [{ type: 'number' }, { type: 'null' }],
        description: 'Max results. Default 30.'
      }
    }, required: [] },
    execute: async (args, db) => {
      const limit = (args.limit != null) ? args.limit : 30
      const rows = (args.category && typeof args.category === 'string')
        ? await db.query(
            `SELECT product_id, product_name, category, base_price
             FROM products WHERE category = ? ORDER BY product_name LIMIT ?`,
            [args.category, limit]
          )
        : await db.query(
            `SELECT product_id, product_name, category, base_price
             FROM products ORDER BY product_name LIMIT ?`,
            [limit]
          )
      return { products: rows, count: rows.length }
    }
  },

  {
    name: 'add_product',
    description: 'Add a new product to the catalogue. Use when user says add product, create product, or new product.',
    parameters: { type: 'object', properties: {
      product_name: { type: 'string' },
      category:     { type: 'string' },
      base_price:   { type: 'number' }
    }, required: ['product_name', 'category', 'base_price'] },
    execute: async (args, db) => {
      const result = await db.query(
        `INSERT INTO products (product_name, category, base_price) VALUES (?, ?, ?)`,
        [args.product_name, args.category, args.base_price]
      )
      return {
        success: true,
        product_id: Number(result.insertId),
        product_name: args.product_name,
        message: `Product "${args.product_name}" added with ID ${Number(result.insertId)}.`
      }
    }
  },

  {
    name: 'update_product',
    description: 'Update product details like price or category.',
    parameters: { type: 'object', properties: {
      product_id:   { type: 'number' },
      product_name: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      base_price:   { anyOf: [{ type: 'number' }, { type: 'null' }] },
      category:     { anyOf: [{ type: 'string' }, { type: 'null' }] }
    }, required: ['product_id'] },
    execute: async (args, db) => {
      const fields = []; const vals = []
      if (args.product_name) { fields.push('product_name = ?'); vals.push(args.product_name) }
      if (args.base_price  ) { fields.push('base_price = ?');   vals.push(args.base_price)   }
      if (args.category    ) { fields.push('category = ?');     vals.push(args.category)     }
      if (!fields.length) return { error: 'No fields to update.' }
      vals.push(args.product_id)
      await db.query(
        `UPDATE products SET ${fields.join(', ')} WHERE product_id = ?`, vals
      )
      return { success: true, product_id: args.product_id, updated_fields: fields.map(f => f.split(' ')[0]) }
    }
  },

  {
    name: 'update_stock_quantity',
    description: 'Manually adjust remaining_stock for a than (bale). Use when user says update stock, set stock to X, or adjust inventory.',
    parameters: { type: 'object', properties: {
      than_id:   { type: 'number' },
      new_stock: { type: 'number' },
      reason:    { anyOf: [{ type: 'string' }, { type: 'null' }] }
    }, required: ['than_id', 'new_stock'] },
    execute: async (args, db) => {
      const rows = await db.query(
        `SELECT than_id, fabric_type, color, remaining_stock FROM thans WHERE than_id = ?`,
        [args.than_id]
      )
      const than = rows[0]
      if (!than) return { error: `Than #${args.than_id} not found` }
      const oldStock = than.remaining_stock
      await db.query(
        `UPDATE thans SET remaining_stock = ?, updated_at = NOW() WHERE than_id = ?`,
        [args.new_stock, args.than_id]
      )
      await db.query(
        `INSERT INTO inventory_movements (than_id, movement_type, quantity, notes, movement_date)
         VALUES (?, 'ADJUSTMENT', ?, ?, NOW())`,
        [args.than_id, args.new_stock - oldStock, args.reason || 'Manual adjustment by AI agent']
      )
      return { success: true, than_id: args.than_id, old_stock: oldStock, new_stock: args.new_stock }
    }
  },

  {
    name: 'get_product_by_name',
    description: 'Search for a product by name and return its ID and details.',
    parameters: { type: 'object', properties: {
      name: { type: 'string' }
    }, required: ['name'] },
    execute: async (args, db) => {
      const rows = await db.query(
        `SELECT product_id, product_name, category, base_price
         FROM products WHERE product_name LIKE ? LIMIT 5`,
        [`%${args.name}%`]
      )
      return { products: rows, count: rows.length }
    }
  }
]

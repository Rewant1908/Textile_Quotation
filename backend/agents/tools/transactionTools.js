// backend/agents/tools/transactionTools.js
// Schema aligned to sales.js route (verified):
//   TABLE: transactions
//     transaction_id, than_id, product_id, retailer_id, transaction_date,
//     quantity, price, discount, margin, payment_status, notes
//   TABLE: thans
//     than_id, remaining_stock, cost_per_meter, warehouse_location, product_id
//   TABLE: retailers
//     retailer_id, shop_name, market_location, outstanding_balance
//   TABLE: inventory_movements
//     than_id, movement_type, quantity, from_location, to_location,
//     reference_type, reference_id, notes, movement_date

const DEAD_DAYS = 60

async function refreshMovementSpeed(db, thanId) {
  const than = (await db.query(
    `SELECT remaining_stock FROM thans WHERE than_id = ?`, [thanId]
  ))[0]
  if (!than) return

  const lastOut = (await db.query(
    `SELECT MAX(movement_date) AS last_out
     FROM inventory_movements
     WHERE than_id = ? AND movement_type = 'stock_out'`, [thanId]
  ))[0]

  const remaining = Number(than.remaining_stock)

  if (remaining <= 0) {
    await db.query(
      `UPDATE thans SET movement_speed = 'fast', status = 'sold_out' WHERE than_id = ?`, [thanId]
    )
    return
  }

  if (!lastOut?.last_out) {
    await db.query(`UPDATE thans SET movement_speed = 'new' WHERE than_id = ?`, [thanId])
    return
  }

  const daysSince = Math.floor((Date.now() - new Date(lastOut.last_out).getTime()) / 86_400_000)
  let speed
  if (daysSince >= DEAD_DAYS) speed = 'dead'
  else if (daysSince >= 30)   speed = 'slow'
  else if (daysSince >= 8)    speed = 'medium'
  else                        speed = 'fast'

  await db.query(`UPDATE thans SET movement_speed = ? WHERE than_id = ?`, [speed, thanId])
}

export const transactionTools = [
  {
    name: 'list_transactions',
    description: 'List recent sale transactions. Use when user asks for sales history, recent sales, or transaction records.',
    parameters: { type: 'object', properties: {
      limit:       { type: 'number', description: 'Max results. Default 50.' },
      retailer_id: { type: 'number', description: 'Filter by retailer ID (optional).' },
      than_id:     { type: 'number', description: 'Filter by than ID (optional).' }
    }, required: [] },
    execute: async (args, db) => {
      const limit = args.limit ?? 50
      let where = 'WHERE 1=1'
      const params = []
      if (args.retailer_id) { where += ' AND tx.retailer_id = ?'; params.push(args.retailer_id) }
      if (args.than_id)     { where += ' AND tx.than_id = ?';     params.push(args.than_id) }
      params.push(limit)
      const rows = await db.query(
        `SELECT tx.transaction_id, tx.than_id, tx.retailer_id, tx.product_id,
                tx.transaction_date AS sale_date,
                tx.quantity, tx.price, tx.discount, tx.margin,
                tx.payment_status, tx.notes,
                t.than_code, t.fabric_type, t.color, t.design,
                p.product_name, p.category,
                r.shop_name, r.market_location
         FROM transactions tx
         LEFT JOIN thans    t  ON tx.than_id     = t.than_id
         LEFT JOIN products p  ON tx.product_id  = p.product_id
         LEFT JOIN retailers r ON tx.retailer_id = r.retailer_id
         ${where}
         ORDER BY tx.transaction_date DESC, tx.transaction_id DESC
         LIMIT ?`, params
      )
      return { transactions: rows, count: rows.length }
    }
  },

  {
    name: 'record_sale',
    description: 'Record a new sale/transaction. Deducts stock from the than and logs an inventory movement. Use when user says sell, record a sale, or sold X meters of than Y. than_id, quantity, and price are required.',
    parameters: { type: 'object', properties: {
      than_id:        { type: 'number', description: 'Than ID being sold. Required.' },
      quantity:       { type: 'number', description: 'Meters sold. Required.' },
      price:          { type: 'number', description: 'Price per meter in Rs. Required.' },
      retailer_id:    { type: 'number', description: 'Retailer ID (optional, use null for walk-in).' },
      discount:       { type: 'number', description: 'Flat discount in Rs. Default 0.' },
      payment_status: { type: 'string', description: "Payment status: 'paid', 'credit', 'partial'. Default paid." },
      notes:          { type: 'string', description: 'Optional sale notes.' },
      sale_date:      { type: 'string', description: 'Date of sale YYYY-MM-DD. Default today.' }
    }, required: ['than_id', 'quantity', 'price'] },
    execute: async (args, db) => {
      if (!args.than_id || !args.quantity || !args.price)
        return { error: 'than_id, quantity and price are required' }
      if (Number(args.quantity) <= 0) return { error: 'quantity must be > 0' }
      if (Number(args.price) <= 0)    return { error: 'price must be > 0' }

      const thans = await db.query(
        `SELECT than_id, remaining_stock, cost_per_meter, warehouse_location, product_id
         FROM thans WHERE than_id = ?`, [args.than_id]
      )
      const than = thans[0]
      if (!than) return { error: `Than #${args.than_id} not found` }
      if (Number(than.remaining_stock) < Number(args.quantity))
        return { error: `Only ${than.remaining_stock}m available, cannot sell ${args.quantity}m` }

      const disc    = Number(args.discount || 0)
      const margin  = (Number(args.price) - Number(than.cost_per_meter)) * Number(args.quantity) - disc
      const pStatus = args.payment_status || 'paid'
      const txDate  = args.sale_date || new Date().toISOString().slice(0, 10)

      const result = await db.query(
        `INSERT INTO transactions
           (than_id, product_id, retailer_id, transaction_date,
            quantity, price, discount, margin, payment_status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          args.than_id,
          than.product_id  || null,
          args.retailer_id || null,
          txDate,
          Number(args.quantity),
          Number(args.price),
          disc,
          margin,
          pStatus,
          args.notes?.trim() || null
        ]
      )

      await db.query(
        `UPDATE thans SET remaining_stock = remaining_stock - ? WHERE than_id = ?`,
        [Number(args.quantity), args.than_id]
      )

      await db.query(
        `INSERT INTO inventory_movements
           (than_id, movement_type, quantity, from_location, to_location,
            reference_type, reference_id, notes, movement_date)
         VALUES (?, 'stock_out', ?, ?, NULL, 'transaction', ?, ?, current_timestamp())`,
        [
          args.than_id,
          Number(args.quantity),
          than.warehouse_location || null,
          Number(result.insertId),
          `Sale to retailer ${args.retailer_id || 'walk-in'}`
        ]
      )

      await refreshMovementSpeed(db, args.than_id)

      if (args.retailer_id && pStatus !== 'paid') {
        const saleTotal = Number(args.price) * Number(args.quantity) - disc
        await db.query(
          `UPDATE retailers SET outstanding_balance = outstanding_balance + ? WHERE retailer_id = ?`,
          [saleTotal, args.retailer_id]
        )
      }

      return {
        success: true,
        transaction_id: Number(result.insertId),
        margin,
        message: `Sale recorded — ${args.quantity}m of than #${args.than_id} at Rs.${args.price}/m. Margin: Rs.${margin.toFixed(2)}.`
      }
    }
  },

  {
    name: 'get_sales_summary',
    description: 'Get aggregated sales stats: total revenue, total margin, top selling thans. Use when user asks for sales report, total sales, or revenue summary.',
    parameters: { type: 'object', properties: {
      days: { type: 'number', description: 'Look-back window in days. Default 30.' }
    }, required: [] },
    execute: async (args, db) => {
      const days = args.days ?? 30
      const rows = await db.query(
        `SELECT
           COUNT(*)                                              AS total_transactions,
           COALESCE(SUM(quantity * price - discount), 0)        AS total_revenue,
           COALESCE(SUM(margin), 0)                             AS total_margin,
           COALESCE(SUM(quantity), 0)                           AS total_meters_sold
         FROM transactions
         WHERE transaction_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`, [days]
      )
      const topThans = await db.query(
        `SELECT tx.than_id, t.than_code, t.fabric_type,
                SUM(tx.quantity)                             AS total_meters,
                SUM(tx.quantity * tx.price - tx.discount)   AS revenue
         FROM transactions tx
         LEFT JOIN thans t ON tx.than_id = t.than_id
         WHERE tx.transaction_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         GROUP BY tx.than_id, t.than_code, t.fabric_type
         ORDER BY total_meters DESC
         LIMIT 5`, [days]
      )
      return { summary: rows[0], top_thans: topThans, period_days: days }
    }
  }
]

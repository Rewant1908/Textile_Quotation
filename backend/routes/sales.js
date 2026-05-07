import express from 'express';
import pool from '../db.js';
import { checkPermission } from '../middleware/checkPermission.js';

const router = express.Router();

// GET /api/transactions — full sale history
router.get('/', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(
            `SELECT tx.transaction_id, tx.than_id, tx.retailer_id,
                    tx.transaction_date AS sale_date,
                    tx.quantity, tx.price, tx.discount, tx.margin,
                    tx.payment_status, tx.notes,
                    t.than_code, t.fabric_type, t.color, t.design,
                    r.shop_name, r.market_location
             FROM transactions tx
             LEFT JOIN thans t     ON tx.than_id     = t.than_id
             LEFT JOIN retailers r ON tx.retailer_id = r.retailer_id
             ORDER BY tx.transaction_date DESC, tx.transaction_id DESC
             LIMIT 200`
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// POST /api/transactions — record a sale
router.post('/', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    const { than_id, retailer_id, quantity, price, discount, payment_status, notes, sale_date } = req.body;

    if (!than_id || !quantity || !price)
        return res.status(400).json({ error: 'than_id, quantity and price are required' });
    if (Number(quantity) <= 0)
        return res.status(400).json({ error: 'quantity must be > 0' });
    if (Number(price) <= 0)
        return res.status(400).json({ error: 'price must be > 0' });

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        const [than] = await conn.query(
            'SELECT than_id, remaining_stock, cost_per_meter, warehouse_location FROM thans WHERE than_id = ?',
            [than_id]
        );
        if (!than) { await conn.rollback(); return res.status(404).json({ error: 'Than not found' }); }
        if (Number(than.remaining_stock) < Number(quantity)) {
            await conn.rollback();
            return res.status(400).json({
                error: `Only ${than.remaining_stock}m available, cannot sell ${quantity}m`
            });
        }

        const disc   = Number(discount || 0);
        const margin = (Number(price) - Number(than.cost_per_meter)) * Number(quantity) - disc;
        const pStatus = payment_status || 'paid';
        const txDate  = sale_date || new Date().toISOString().slice(0, 10);

        const result = await conn.query(
            `INSERT INTO transactions
                (than_id, retailer_id, transaction_date, quantity, price, discount,
                 margin, payment_status, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                than_id, retailer_id || null, txDate,
                Number(quantity), Number(price), disc,
                margin, pStatus, notes?.trim() || null
            ]
        );

        // Decrement remaining stock on the than
        await conn.query(
            'UPDATE thans SET remaining_stock = remaining_stock - ? WHERE than_id = ?',
            [Number(quantity), than_id]
        );

        // Log inventory movement (fires movement_speed trigger from migration_v2)
        await conn.query(
            `INSERT INTO inventory_movements
                (than_id, movement_type, quantity, from_location, to_location,
                 reference_type, reference_id, notes, movement_date)
             VALUES (?, 'stock_out', ?, ?, NULL, 'transaction', ?, ?, current_timestamp())`,
            [
                than_id, Number(quantity),
                than.warehouse_location || null,
                Number(result.insertId),
                `Sale to retailer ${retailer_id || 'walk-in'}`
            ]
        );

        // Auto-update outstanding_balance for credit/mixed payment retailers
        if (retailer_id && pStatus !== 'paid') {
            const saleTotal = Number(price) * Number(quantity) - disc;
            await conn.query(
                `UPDATE retailers
                 SET outstanding_balance = outstanding_balance + ?
                 WHERE retailer_id = ?`,
                [saleTotal, retailer_id]
            );
        }

        // Mark outstanding_balance as reduced when explicitly paid
        if (retailer_id && pStatus === 'paid' && payment_status === 'paid') {
            // Only reduce if this was a previously credit-tagged sale being settled
            // (no-op on new cash sales — balance stays unchanged)
        }

        await conn.commit();
        res.status(201).json({ success: true, transaction_id: Number(result.insertId), margin });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
});

export default router;

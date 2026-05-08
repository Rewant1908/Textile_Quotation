/**
 * /api/quotations
 *
 * FIXED schema mismatch: this project's quotations table uses the
 * CustomerForm / QuotationForm schema, NOT a retailer-join schema.
 * Columns: quotation_id, user_id, customer_name, grand_total, status,
 *          decline_reason, created_at
 * Child table quotation_items: id, quotation_id, product_id, product_name,
 *          quantity, unit_price, line_total
 */

import { Router } from 'express';
import pool from '../db.js';
import { checkPermission } from '../middleware/checkPermission.js';

const router = Router();

// ── GET /api/quotations ───────────────────────────────────────────────────────
// Admin: all quotations. Dealer: only their own (filtered by user_id query param).
router.get('/', checkPermission('VIEW_QUOTATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const { user_id } = req.query;

        let rows;
        if (req.user.role === 'admin') {
            rows = await conn.query(`
                SELECT q.quotation_id, q.user_id, q.customer_name,
                       q.grand_total, q.status, q.decline_reason, q.created_at
                FROM quotations q
                ORDER BY q.created_at DESC
            `);
        } else {
            // Dealers can only see their own quotations
            rows = await conn.query(`
                SELECT q.quotation_id, q.user_id, q.customer_name,
                       q.grand_total, q.status, q.decline_reason, q.created_at
                FROM quotations q
                WHERE q.user_id = ?
                ORDER BY q.created_at DESC
            `, [user_id || req.user.user_id]);
        }

        res.json(rows);
    } catch (err) {
        console.error('[quotations] GET / error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── GET /api/quotations/:id ───────────────────────────────────────────────────
router.get('/:id', checkPermission('VIEW_QUOTATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const [quotation] = await conn.query(`
            SELECT quotation_id, user_id, customer_name, grand_total,
                   status, decline_reason, created_at
            FROM quotations
            WHERE quotation_id = ?
        `, [req.params.id]);

        if (!quotation) return res.status(404).json({ error: 'Quotation not found' });

        const items = await conn.query(`
            SELECT id, product_id, product_name, quantity, unit_price, line_total
            FROM quotation_items
            WHERE quotation_id = ?
            ORDER BY id
        `, [req.params.id]);

        res.json({ ...quotation, items });
    } catch (err) {
        console.error('[quotations] GET /:id error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── POST /api/quotations ──────────────────────────────────────────────────────
// Body: { user_id, customer_name, grand_total, items: [{product_id, product_name, quantity, unit_price, line_total}] }
router.post('/', checkPermission('CREATE_QUOTATION'), async (req, res) => {
    const { user_id, customer_name, grand_total, items = [] } = req.body;

    if (!customer_name) return res.status(400).json({ error: 'customer_name is required' });
    if (!items.length)  return res.status(400).json({ error: 'At least one item is required' });

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        const result = await conn.query(`
            INSERT INTO quotations (user_id, customer_name, grand_total, status)
            VALUES (?, ?, ?, 'pending')
        `, [user_id || req.user.user_id, customer_name, grand_total || 0]);

        const quotation_id = Number(result.insertId);

        for (const item of items) {
            await conn.query(`
                INSERT INTO quotation_items
                    (quotation_id, product_id, product_name, quantity, unit_price, line_total)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                quotation_id,
                item.product_id,
                item.product_name,
                item.quantity,
                item.unit_price,
                item.line_total ?? item.quantity * item.unit_price
            ]);
        }

        await conn.commit();
        res.status(201).json({ success: true, quotation_id });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error('[quotations] POST / error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── PATCH /api/quotations/:id/status ─────────────────────────────────────────
// Body: { status, decline_reason? }
router.patch('/:id/status', checkPermission('MANAGE_QUOTATION_STATUS'), async (req, res) => {
    const { status, decline_reason = '' } = req.body;
    const VALID = ['pending', 'accepted', 'declined'];
    if (!VALID.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${VALID.join(', ')}` });
    }
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query(
            'UPDATE quotations SET status = ?, decline_reason = ? WHERE quotation_id = ?',
            [status, decline_reason, req.params.id]
        );
        res.json({ success: true, message: `Quotation status updated to ${status}` });
    } catch (err) {
        console.error('[quotations] PATCH /:id/status error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

export default router;

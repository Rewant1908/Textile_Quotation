/**
 * /api/quotations
 *
 * Actual schema columns (verified against database/schema.sql):
 *   quotations      : quotation_id, customer_id, user_id, status,
 *                     total_amount, decline_reason, created_at, updated_at
 *   quotation_items : item_id, quotation_id, product_id, than_id,
 *                     quantity, unit_price_at_time
 *   customers       : customer_id, customer_name, contact_phone, email
 */

import { Router } from 'express';
import pool from '../db.js';
import { checkPermission } from '../middleware/checkPermission.js';

const router = Router();

// ── GET /api/quotations ───────────────────────────────────────────────────────
router.get('/', checkPermission('VIEW_QUOTATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();

        let rows;
        if (req.user.role === 'admin') {
            rows = await conn.query(`
                SELECT q.quotation_id,
                       q.user_id,
                       c.customer_name,
                       c.contact_phone,
                       q.total_amount,
                       q.status,
                       q.decline_reason,
                       q.created_at
                FROM quotations q
                LEFT JOIN customers c ON c.customer_id = q.customer_id
                ORDER BY q.created_at DESC
            `);
        } else {
            rows = await conn.query(`
                SELECT q.quotation_id,
                       q.user_id,
                       c.customer_name,
                       c.contact_phone,
                       q.total_amount,
                       q.status,
                       q.decline_reason,
                       q.created_at
                FROM quotations q
                LEFT JOIN customers c ON c.customer_id = q.customer_id
                WHERE q.user_id = ?
                ORDER BY q.created_at DESC
            `, [req.user.user_id]);
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
            SELECT q.quotation_id,
                   q.user_id,
                   q.customer_id,
                   c.customer_name,
                   c.contact_phone,
                   q.total_amount,
                   q.status,
                   q.decline_reason,
                   q.created_at
            FROM quotations q
            LEFT JOIN customers c ON c.customer_id = q.customer_id
            WHERE q.quotation_id = ?
        `, [req.params.id]);

        if (!quotation) return res.status(404).json({ error: 'Quotation not found' });

        // Fetch items — join products and thans for display names
        const items = await conn.query(`
            SELECT qi.item_id,
                   qi.product_id,
                   qi.than_id,
                   COALESCE(p.product_name, 'Unknown Product') AS product_name,
                   COALESCE(t.than_code, '')                   AS than_code,
                   COALESCE(t.fabric_type, '')                 AS fabric_type,
                   qi.quantity,
                   qi.unit_price_at_time,
                   (qi.quantity * qi.unit_price_at_time)       AS line_total
            FROM quotation_items qi
            LEFT JOIN products p ON p.product_id = qi.product_id
            LEFT JOIN thans    t ON t.than_id    = qi.than_id
            WHERE qi.quotation_id = ?
            ORDER BY qi.item_id
        `, [req.params.id]);

        res.json({ ...quotation, items });
    } catch (err) {
        console.error('[quotations] GET /:id error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── POST /api/quotations ──────────────────────────────────────────────────────
// Body: { customer_name, contact_phone?, items: [{ product_id, than_id?, quantity, unit_price_at_time }] }
router.post('/', checkPermission('CREATE_QUOTATION'), async (req, res) => {
    const { customer_name, contact_phone, items = [] } = req.body;

    if (!customer_name?.trim()) return res.status(400).json({ error: 'customer_name is required' });
    if (!items.length)          return res.status(400).json({ error: 'At least one item is required' });

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        // Upsert customer by name
        let [customer] = await conn.query(
            'SELECT customer_id FROM customers WHERE customer_name = ?',
            [customer_name.trim()]
        );
        let customer_id;
        if (customer) {
            customer_id = customer.customer_id;
        } else {
            const r = await conn.query(
                'INSERT INTO customers (customer_name, contact_phone) VALUES (?, ?)',
                [customer_name.trim(), contact_phone?.trim() || null]
            );
            customer_id = Number(r.insertId);
        }

        // Calculate total
        const total_amount = items.reduce(
            (sum, i) => sum + (Number(i.quantity) * Number(i.unit_price_at_time || i.unit_price || 0)),
            0
        );

        const result = await conn.query(
            'INSERT INTO quotations (customer_id, user_id, status, total_amount) VALUES (?, ?, \'pending\', ?)',
            [customer_id, req.user.user_id, total_amount]
        );
        const quotation_id = Number(result.insertId);

        for (const item of items) {
            await conn.query(
                'INSERT INTO quotation_items (quotation_id, product_id, than_id, quantity, unit_price_at_time) VALUES (?, ?, ?, ?, ?)',
                [
                    quotation_id,
                    item.product_id || null,
                    item.than_id    || null,
                    Number(item.quantity),
                    Number(item.unit_price_at_time || item.unit_price || 0)
                ]
            );
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
        res.json({ success: true });
    } catch (err) {
        console.error('[quotations] PATCH /:id/status error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

export default router;

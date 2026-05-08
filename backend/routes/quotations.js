import { Router } from 'express';
import pool from '../db.js';
import { checkPermission } from '../middleware/checkPermission.js';

const router = Router();

// ── GET /api/quotations  ─────────────────────────────────────────────────────
// Returns all quotations with retailer name and item count
router.get('/', checkPermission('VIEW_QUOTATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(`
            SELECT
                q.id,
                q.quotation_number,
                q.status,
                q.total_amount,
                q.discount_percent,
                q.notes,
                q.created_at,
                q.updated_at,
                r.id            AS retailer_id,
                r.business_name AS retailer_name,
                r.city          AS retailer_city,
                COUNT(qi.id)    AS item_count
            FROM quotations q
            JOIN retailers r   ON r.id = q.retailer_id
            LEFT JOIN quotation_items qi ON qi.quotation_id = q.id
            GROUP BY q.id, r.id
            ORDER BY q.created_at DESC
        `);
        res.json({ success: true, data: rows });
    } catch (err) {
        console.error('[quotations] GET / error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── GET /api/quotations/:id  ─────────────────────────────────────────────────
// Returns a single quotation with full line items
router.get('/:id', checkPermission('VIEW_QUOTATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const [quotation] = await conn.query(`
            SELECT
                q.*,
                r.business_name AS retailer_name,
                r.city          AS retailer_city,
                r.phone         AS retailer_phone,
                r.email         AS retailer_email
            FROM quotations q
            JOIN retailers r ON r.id = q.retailer_id
            WHERE q.id = ?
        `, [req.params.id]);

        if (!quotation) return res.status(404).json({ success: false, error: 'Quotation not found' });

        const items = await conn.query(`
            SELECT
                qi.*,
                p.name          AS product_name,
                p.fabric_type,
                p.color,
                p.gsm
            FROM quotation_items qi
            JOIN products p ON p.id = qi.product_id
            WHERE qi.quotation_id = ?
            ORDER BY qi.id
        `, [req.params.id]);

        res.json({ success: true, data: { ...quotation, items } });
    } catch (err) {
        console.error('[quotations] GET /:id error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── POST /api/quotations  ────────────────────────────────────────────────────
// Creates a quotation + its line items in a single transaction
router.post('/', checkPermission('CREATE_QUOTATION'), async (req, res) => {
    const { retailer_id, items = [], discount_percent = 0, notes = '', status = 'draft' } = req.body;

    if (!retailer_id) return res.status(400).json({ success: false, error: 'retailer_id is required' });
    if (!items.length) return res.status(400).json({ success: false, error: 'At least one item is required' });

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        // Calculate total from items
        const total_amount = items.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0);
        const discounted_total = total_amount * (1 - discount_percent / 100);

        // Generate quotation number: QUO-YYYYMMDD-XXXX
        const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const [{ cnt }] = await conn.query('SELECT COUNT(*) AS cnt FROM quotations WHERE DATE(created_at) = CURDATE()');
        const seq = String(Number(cnt) + 1).padStart(4, '0');
        const quotation_number = `QUO-${datePart}-${seq}`;

        const result = await conn.query(`
            INSERT INTO quotations (retailer_id, quotation_number, status, total_amount, discount_percent, notes)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [retailer_id, quotation_number, status, discounted_total, discount_percent, notes]);

        const quotation_id = Number(result.insertId);

        // Insert line items
        for (const item of items) {
            await conn.query(`
                INSERT INTO quotation_items (quotation_id, product_id, quantity, unit_price, subtotal)
                VALUES (?, ?, ?, ?, ?)
            `, [quotation_id, item.product_id, item.quantity, item.unit_price, item.quantity * item.unit_price]);
        }

        await conn.commit();
        res.status(201).json({ success: true, data: { id: quotation_id, quotation_number } });
    } catch (err) {
        if (conn) await conn.rollback();
        console.error('[quotations] POST / error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── PATCH /api/quotations/:id/status  ───────────────────────────────────────
// Updates only the status field (draft → sent → approved → delivered / cancelled)
router.patch('/:id/status', checkPermission('UPDATE_QUOTATION'), async (req, res) => {
    const { status } = req.body;
    const VALID = ['draft', 'sent', 'approved', 'delivered', 'cancelled'];
    if (!VALID.includes(status)) {
        return res.status(400).json({ success: false, error: `status must be one of: ${VALID.join(', ')}` });
    }
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query('UPDATE quotations SET status = ?, updated_at = NOW() WHERE id = ?', [status, req.params.id]);
        res.json({ success: true, message: `Quotation status updated to ${status}` });
    } catch (err) {
        console.error('[quotations] PATCH /:id/status error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── DELETE /api/quotations/:id  ──────────────────────────────────────────────
// Soft-delete: sets status to 'cancelled' rather than destroying the record
router.delete('/:id', checkPermission('DELETE_QUOTATION'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query("UPDATE quotations SET status = 'cancelled', updated_at = NOW() WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: 'Quotation cancelled' });
    } catch (err) {
        console.error('[quotations] DELETE /:id error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

export default router;

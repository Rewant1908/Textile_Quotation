/**
 * /api/quotations
 *
 * Phase 5 fixes applied:
 *  1. quotation_number column: auto-generated as KTQ-{YYYY}-{6-digit-padded-id}
 *     written back after INSERT (MariaDB has no GENERATED ALWAYS for non-trivial exprs)
 *  2. status ENUM extended: draft | sent | accepted | declined
 *     (old: pending | accepted | declined  — 'pending' kept as alias for 'draft' on reads)
 *  8. quotations.status lifecycle now matches sales.MEMORY.md:
 *     draft → sent → accepted / declined
 *  8b. WhatsApp notification sent via sendQuotationNotification():
 *     - on POST /  (new quotation created) → notifies customer if contact_phone present
 *     - on PATCH /:id/status → sent        → notifies customer when salesperson marks as sent
 *
 * Schema columns (verified + extended):
 *   quotations      : quotation_id, quotation_number, customer_id, user_id, status,
 *                     total_amount, decline_reason, created_at, updated_at
 *   quotation_items : item_id, quotation_id, product_id, than_id,
 *                     quantity, unit_price_at_time
 *   customers       : customer_id, customer_name, contact_phone, email
 */

import { Router } from 'express';
import pool from '../db.js';
import { checkPermission } from '../middleware/checkPermission.js';
import logger from '../logger.js';
import { sendQuotationNotification } from '../services/whatsappService.js';

const router = Router();

// Valid lifecycle statuses — matches sales.MEMORY.md draft→sent→accepted/declined
const VALID_STATUSES = ['draft', 'sent', 'accepted', 'declined'];
// backward-compat alias: the old ENUM used 'pending' — treat it as 'draft'
function normaliseStatus(s) {
    return s === 'pending' ? 'draft' : s;
}

/**
 * notifyCustomer(phone, logLabel, templateData)
 * Fires sendQuotationNotification for a phone number (strips leading + if present).
 * Non-blocking — errors are logged but never bubble up to the HTTP response.
 */
async function notifyCustomer(phone, logLabel, templateData = null) {
    if (!phone) return;
    // Normalise: remove +, spaces, dashes
    const to = String(phone).replace(/[\s\-+]/g, '');
    const template = templateData ? {
        components: [{
            type: 'body',
            parameters: [
                { type: 'text', text: String(templateData.customer_name || 'Customer') },
                { type: 'text', text: String(templateData.quotation_number || '') },
                { type: 'text', text: String(templateData.total_amount ?? '') },
            ]
        }]
    } : {}

    sendQuotationNotification(to, template)
        .then(() => logger.info({ to }, `[quotations] WhatsApp notification sent (${logLabel})`))
        .catch(err => logger.warn({ err, to }, `[quotations] WhatsApp notification failed (${logLabel}) — non-critical`));
}

// Helper: COALESCE quotation_number so legacy rows (NULL) always get KTQ-YYYY-XXXXXX format
// Uses the row's created_at year if available, else current year.
const QN_EXPR = `COALESCE(q.quotation_number,
    CONCAT('KTQ-', YEAR(q.created_at), '-', LPAD(q.quotation_id, 6, '0')))
    AS quotation_number`;

// ── GET /api/quotations ───────────────────────────────────────────────────────
router.get('/', checkPermission('VIEW_QUOTATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = req.user.role === 'admin'
            ? await conn.query(`
                SELECT q.quotation_id, ${QN_EXPR},
                       q.user_id, c.customer_name, c.contact_phone,
                       q.total_amount, q.status, q.decline_reason, q.created_at
                FROM quotations q
                LEFT JOIN customers c ON c.customer_id = q.customer_id
                ORDER BY q.created_at DESC`)
            : await conn.query(`
                SELECT q.quotation_id, ${QN_EXPR},
                       q.user_id, c.customer_name, c.contact_phone,
                       q.total_amount, q.status, q.decline_reason, q.created_at
                FROM quotations q
                LEFT JOIN customers c ON c.customer_id = q.customer_id
                WHERE q.user_id = ?
                ORDER BY q.created_at DESC`, [req.user.user_id]);

        res.json(rows.map(r => ({ ...r, status: normaliseStatus(r.status) })));
    } catch (err) {
        logger.error({ err }, '[quotations] GET /');
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── GET /api/quotations/:id ───────────────────────────────────────────────────
router.get('/:id', checkPermission('VIEW_QUOTATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const [quotation] = await conn.query(`
            SELECT q.quotation_id, ${QN_EXPR},
                   q.user_id, q.customer_id,
                   c.customer_name, c.contact_phone,
                   q.total_amount, q.status, q.decline_reason, q.created_at
            FROM quotations q
            LEFT JOIN customers c ON c.customer_id = q.customer_id
            WHERE q.quotation_id = ?`, [req.params.id]);

        if (!quotation) return res.status(404).json({ error: 'Quotation not found' });

        const items = await conn.query(`
            SELECT qi.item_id, qi.product_id, qi.than_id,
                   COALESCE(p.product_name, 'Unknown Product') AS product_name,
                   COALESCE(t.than_code, '')                   AS than_code,
                   COALESCE(t.fabric_type, '')                 AS fabric_type,
                   qi.quantity, qi.unit_price_at_time,
                   (qi.quantity * qi.unit_price_at_time)       AS line_total
            FROM quotation_items qi
            LEFT JOIN products p ON p.product_id = qi.product_id
            LEFT JOIN thans    t ON t.than_id    = qi.than_id
            WHERE qi.quotation_id = ?
            ORDER BY qi.item_id`, [req.params.id]);

        res.json({ ...quotation, status: normaliseStatus(quotation.status), items });
    } catch (err) {
        logger.error({ err }, '[quotations] GET /:id');
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

        // Upsert customer
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

        const total_amount = items.reduce(
            (sum, i) => sum + (Number(i.quantity) * Number(i.unit_price_at_time || i.unit_price || 0)), 0
        );

        // Insert with status 'draft' (lifecycle start per sales.MEMORY.md)
        const result = await conn.query(
            `INSERT INTO quotations (customer_id, user_id, status, total_amount)
             VALUES (?, ?, 'draft', ?)`,
            [customer_id, req.user.user_id, total_amount]
        );
        const quotation_id = Number(result.insertId);

        // Generate quotation_number: KTQ-YYYY-000001
        const year = new Date().getFullYear();
        const quotation_number = `KTQ-${year}-${String(quotation_id).padStart(6, '0')}`;
        await conn.query(
            'UPDATE quotations SET quotation_number = ? WHERE quotation_id = ?',
            [quotation_number, quotation_id]
        );

        for (const item of items) {
            await conn.query(
                `INSERT INTO quotation_items
                    (quotation_id, product_id, than_id, quantity, unit_price_at_time)
                 VALUES (?, ?, ?, ?, ?)`,
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

        // ── WhatsApp: notify customer that a quotation has been created ──────
        // Fires after commit so HTTP response is never delayed by WhatsApp API.
        notifyCustomer(contact_phone, `POST quotation_id=${quotation_id}`, {
            customer_name: customer_name.trim(),
            quotation_number,
            total_amount: total_amount.toFixed(2),
        });

        res.status(201).json({ success: true, quotation_id, quotation_number });
    } catch (err) {
        if (conn) await conn.rollback();
        logger.error({ err }, '[quotations] POST /');
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── PATCH /api/quotations/:id/status ─────────────────────────────────────────
// Lifecycle: draft → sent → accepted | declined
router.patch('/:id/status', checkPermission('MANAGE_QUOTATION_STATUS'), async (req, res) => {
    const rawStatus      = req.body.status;
    const decline_reason = req.body.decline_reason || '';
    const status         = normaliseStatus(rawStatus);

    if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
            error: `status must be one of: ${VALID_STATUSES.join(', ')} (or 'pending' as alias for 'draft')`
        });
    }
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query(
            `UPDATE quotations SET status = ?, decline_reason = ?, updated_at = NOW()
             WHERE quotation_id = ?`,
            [status, decline_reason, req.params.id]
        );

        // ── WhatsApp: notify customer when salesperson marks quotation as 'sent' ──
        if (status === 'sent') {
            const [row] = await conn.query(
                `SELECT c.contact_phone
                 FROM quotations q
                 LEFT JOIN customers c ON c.customer_id = q.customer_id
                 WHERE q.quotation_id = ?`,
                [req.params.id]
            );
            const [quotationMeta] = await conn.query(
                `SELECT ${QN_EXPR}, q.total_amount, c.customer_name
                 FROM quotations q
                 LEFT JOIN customers c ON c.customer_id = q.customer_id
                 WHERE q.quotation_id = ?`,
                [req.params.id]
            );
            notifyCustomer(row?.contact_phone, `PATCH status=sent quotation_id=${req.params.id}`, {
                customer_name: quotationMeta?.customer_name || 'Customer',
                quotation_number: quotationMeta?.quotation_number || `#${req.params.id}`,
                total_amount: Number(quotationMeta?.total_amount || 0).toFixed(2),
            });
        }

        res.json({ success: true, status });
    } catch (err) {
        logger.error({ err }, '[quotations] PATCH /:id/status');
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

export default router;

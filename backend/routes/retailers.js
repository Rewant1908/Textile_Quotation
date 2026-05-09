/**
 * /api/retailers
 *
 * Phase 5 fixes applied:
 *  3. preferred_categories_json now returned in GET / and GET /:id
 *  7. Soft deletes: DELETE now sets is_deleted=1 + deleted_at instead of hard-DELETE
 *  9. assigned_user_id FK: salespeople filter to their own retailers unless admin
 *
 * Column name mapping (route → DB):
 *   owner_name    → contact_person
 *   contact_phone → phone
 *   city          → N/A (not in schema)
 *   credit_limit  → N/A (not in schema)
 */
import { Router } from 'express';
import pool from '../db.js';
import { checkPermission } from '../middleware/checkPermission.js';
import logger from '../logger.js';

const router = Router();

// Used in SELECT queries that alias the table as `r`
const SOFT_DELETE_FILTER = `(r.is_deleted = 0 OR r.is_deleted IS NULL)`;
// Used in UPDATE/DELETE queries with no alias
const SOFT_DELETE_FILTER_NO_ALIAS = `(is_deleted = 0 OR is_deleted IS NULL)`;

// ── GET /api/retailers ─────────────────────────────────────────────────────────
router.get('/', checkPermission('VIEW_RETAILERS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();

        const isAdmin = req.user.role === 'admin';
        const userClause = isAdmin ? '' : 'AND (r.assigned_user_id = ? OR r.assigned_user_id IS NULL)';
        const userParam  = isAdmin ? [] : [req.user.user_id];

        const rows = await conn.query(
            `SELECT r.retailer_id, r.shop_name,
                    r.contact_person, r.phone,
                    r.market_location, r.payment_pattern,
                    r.preferred_categories, r.preferred_price_segment,
                    r.preferred_categories_json,
                    r.outstanding_balance,
                    r.average_order_size, r.seasonal_trends, r.notes,
                    r.assigned_user_id,
                    u.username AS assigned_to,
                    r.created_at
             FROM retailers r
             LEFT JOIN users u ON u.user_id = r.assigned_user_id
             WHERE ${SOFT_DELETE_FILTER} ${userClause}
             ORDER BY r.shop_name`,
            userParam
        );

        const parsed = rows.map(r => ({
            ...r,
            preferred_categories_json: tryParseJson(r.preferred_categories_json)
        }));

        res.json(parsed);
    } catch (err) {
        logger.error({ err }, '[retailers] GET /');
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── GET /api/retailers/:id ────────────────────────────────────────────────
router.get('/:id', checkPermission('VIEW_RETAILERS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const [retailer] = await conn.query(
            `SELECT r.*,
                    u.username AS assigned_to
             FROM retailers r
             LEFT JOIN users u ON u.user_id = r.assigned_user_id
             WHERE r.retailer_id = ? AND ${SOFT_DELETE_FILTER}`,
            [req.params.id]
        );
        if (!retailer) return res.status(404).json({ error: 'Retailer not found' });

        retailer.preferred_categories_json = tryParseJson(retailer.preferred_categories_json);
        res.json(retailer);
    } catch (err) {
        logger.error({ err }, '[retailers] GET /:id');
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── POST /api/retailers ─────────────────────────────────────────────────────
router.post('/', checkPermission('CREATE_RETAILER'), async (req, res) => {
    const {
        shop_name, contact_person, phone, market_location,
        payment_pattern, preferred_categories, preferred_price_segment,
        outstanding_balance, assigned_user_id, notes
    } = req.body;

    if (!shop_name?.trim()) return res.status(400).json({ error: 'shop_name is required' });

    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query(
            `INSERT INTO retailers
                (shop_name, contact_person, phone, market_location,
                 payment_pattern, preferred_categories, preferred_price_segment,
                 outstanding_balance, assigned_user_id, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                shop_name.trim(),
                contact_person?.trim() || null,
                phone?.trim() || null,
                market_location?.trim() || null,
                payment_pattern || 'on_delivery',
                preferred_categories || null,
                preferred_price_segment || 'mixed',
                outstanding_balance || 0,
                assigned_user_id || req.user.user_id,
                notes?.trim() || null
            ]
        );
        res.status(201).json({ success: true, retailer_id: Number(result.insertId) });
    } catch (err) {
        logger.error({ err }, '[retailers] POST /');
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── PUT /api/retailers/:id ────────────────────────────────────────────────────
router.put('/:id', checkPermission('UPDATE_RETAILER'), async (req, res) => {
    const {
        shop_name, contact_person, phone, market_location,
        payment_pattern, preferred_categories, preferred_price_segment,
        outstanding_balance, assigned_user_id, notes
    } = req.body;

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query(
            `UPDATE retailers SET
                shop_name              = COALESCE(?, shop_name),
                contact_person         = COALESCE(?, contact_person),
                phone                  = COALESCE(?, phone),
                market_location        = COALESCE(?, market_location),
                payment_pattern        = COALESCE(?, payment_pattern),
                preferred_categories   = COALESCE(?, preferred_categories),
                preferred_price_segment= COALESCE(?, preferred_price_segment),
                outstanding_balance    = COALESCE(?, outstanding_balance),
                assigned_user_id       = COALESCE(?, assigned_user_id),
                notes                  = COALESCE(?, notes)
             WHERE retailer_id = ? AND ${SOFT_DELETE_FILTER_NO_ALIAS}`,
            [
                shop_name || null, contact_person || null, phone || null,
                market_location || null, payment_pattern || null,
                preferred_categories || null, preferred_price_segment || null,
                outstanding_balance ?? null, assigned_user_id || null,
                notes || null,
                req.params.id
            ]
        );
        res.json({ success: true });
    } catch (err) {
        logger.error({ err }, '[retailers] PUT /:id');
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── DELETE /api/retailers/:id — SOFT DELETE ────────────────────────────────────
router.delete('/:id', checkPermission('DELETE_RETAILER'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query(
            `UPDATE retailers
             SET is_deleted = 1,
                 deleted_at  = NOW(),
                 deleted_by  = ?
             WHERE retailer_id = ? AND ${SOFT_DELETE_FILTER_NO_ALIAS}`,
            [req.user.user_id, req.params.id]
        );
        if (Number(result.affectedRows) === 0) {
            return res.status(404).json({ error: 'Retailer not found or already deleted' });
        }
        res.json({ success: true, message: 'Retailer soft-deleted. History preserved.' });
    } catch (err) {
        logger.error({ err }, '[retailers] DELETE /:id');
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── helper ───────────────────────────────────────────────────────────────────────────
function tryParseJson(val) {
    if (!val) return null;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return val; }
}

export default router;

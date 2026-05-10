/**
 * /api/dealers  — all routes scoped to req.user.user_id (JWT-verified)
 *
 * A dealer NEVER sees another dealer's data.
 *
 * Routes:
 *   GET  /me                        → Own retailer profile
 *   POST /                          → Register / update own profile
 *   GET  /cockpit/kpis              → Dashboard KPI counters
 *   GET  /cockpit/receivables       → Outstanding receivables with ageing buckets
 *   GET  /cockpit/pending-orders    → Draft + sent quotations (not yet accepted/declined)
 *   GET  /cockpit/ageing-stock      → Slow/dead stock with auto discount offer tiers
 *   GET  /cockpit/dispatches        → Order dispatch statuses for accepted quotations
 */
import { Router } from 'express';
import pool from '../db.js';
import { checkPermission } from '../middleware/checkPermission.js';
import logger from '../logger.js';

const router = Router();

// ── GET /api/dealers/me ──────────────────────────────────────────────────────
router.get('/me', checkPermission('VIEW_RETAILERS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const [profile] = await conn.query(
            `SELECT retailer_id, shop_name, phone_number, market_location,
                    outstanding_balance, created_at
             FROM retailers
             WHERE assigned_user_id = ?
               AND (is_deleted = 0 OR is_deleted IS NULL)
             ORDER BY created_at ASC LIMIT 1`,
            [req.user.user_id]
        );
        res.json({ success: true, profile: profile || null });
    } catch (err) {
        logger.error({ err }, '[dealers] GET /me');
        if (err.code === 'ER_BAD_FIELD_ERROR')
            return res.json({ success: true, profile: null, _migrationPending: true });
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── GET /api/dealers/cockpit/kpis ───────────────────────────────────────────
router.get('/cockpit/kpis', checkPermission('VIEW_QUOTATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const [[kpis]] = await conn.query(`
            SELECT
              COUNT(*)                                         AS total_quotations,
              SUM(status IN ('draft','pending'))               AS draft_count,
              SUM(status = 'sent')                             AS sent_count,
              SUM(status = 'accepted')                         AS accepted_count,
              SUM(status = 'declined')                         AS declined_count,
              COALESCE(SUM(CASE WHEN status = 'accepted'
                THEN total_amount END), 0)                     AS total_accepted_value
            FROM quotations WHERE user_id = ?`, [req.user.user_id]);
        res.json({ success: true, kpis });
    } catch (err) {
        logger.error({ err }, '[dealers] GET /cockpit/kpis');
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── GET /api/dealers/cockpit/receivables ─────────────────────────────────────
// Accepted quotations with days-since-acceptance ageing buckets.
// Scoped to this dealer's user_id only.
router.get('/cockpit/receivables', checkPermission('VIEW_QUOTATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(`
            SELECT
              q.quotation_id,
              q.quotation_number,
              c.customer_name,
              c.contact_phone,
              q.total_amount,
              q.updated_at                                    AS accepted_on,
              DATEDIFF(CURDATE(), DATE(q.updated_at))         AS days_outstanding,
              CASE
                WHEN DATEDIFF(CURDATE(), DATE(q.updated_at)) <= 30  THEN '0-30 days'
                WHEN DATEDIFF(CURDATE(), DATE(q.updated_at)) <= 60  THEN '31-60 days'
                WHEN DATEDIFF(CURDATE(), DATE(q.updated_at)) <= 90  THEN '61-90 days'
                ELSE '90+ days'
              END AS ageing_bucket
            FROM quotations q
            LEFT JOIN customers c ON c.customer_id = q.customer_id
            WHERE q.user_id = ? AND q.status = 'accepted'
            ORDER BY days_outstanding DESC`, [req.user.user_id]);

        // Summary bucket totals
        const buckets = { '0-30 days': 0, '31-60 days': 0, '61-90 days': 0, '90+ days': 0 };
        for (const r of rows) {
            buckets[r.ageing_bucket] = (buckets[r.ageing_bucket] || 0) + Number(r.total_amount);
        }

        res.json({ success: true, rows, buckets });
    } catch (err) {
        logger.error({ err }, '[dealers] GET /cockpit/receivables');
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── GET /api/dealers/cockpit/pending-orders ─────────────────────────────────
// Draft + sent quotations for this dealer (not yet resolved).
router.get('/cockpit/pending-orders', checkPermission('VIEW_QUOTATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(`
            SELECT
              q.quotation_id,
              q.quotation_number,
              c.customer_name,
              c.contact_phone,
              q.total_amount,
              q.status,
              q.created_at,
              DATEDIFF(CURDATE(), DATE(q.created_at)) AS days_open
            FROM quotations q
            LEFT JOIN customers c ON c.customer_id = q.customer_id
            WHERE q.user_id = ?
              AND q.status IN ('draft', 'pending', 'sent')
            ORDER BY days_open DESC`, [req.user.user_id]);
        res.json({ success: true, rows });
    } catch (err) {
        logger.error({ err }, '[dealers] GET /cockpit/pending-orders');
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── GET /api/dealers/cockpit/ageing-stock ───────────────────────────────────
// Slow + dead thans exposed as dealer offers with auto-computed discount tiers.
// NOT scoped to user — this is shared catalogue data (same for all dealers).
// Permission: VIEW_QUOTATIONS covers dealer/user roles.
router.get('/cockpit/ageing-stock', checkPermission('VIEW_QUOTATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(`
            SELECT
              t.than_id,
              t.than_code,
              t.fabric_type,
              t.color,
              t.design,
              t.gsm,
              t.remaining_stock,
              t.selling_price,
              t.cost_per_meter,
              t.warehouse_location,
              t.movement_speed,
              t.image_url,
              COALESCE(p.product_name, t.fabric_type) AS product_name,
              COALESCE(p.category, t.fabric_type)     AS category,
              DATEDIFF(CURDATE(), DATE(COALESCE(MAX(im.movement_date), t.created_at)))
                                                       AS days_idle,
              -- Auto discount tier: slow=10%, dead<=60days=15%, dead>60days=25%
              CASE
                WHEN t.movement_speed = 'dead'
                  AND DATEDIFF(CURDATE(), DATE(COALESCE(MAX(im.movement_date), t.created_at))) > 60
                  THEN 25
                WHEN t.movement_speed = 'dead' THEN 15
                ELSE 10
              END AS discount_pct,
              ROUND(
                t.selling_price * (
                  1 - CASE
                    WHEN t.movement_speed = 'dead'
                      AND DATEDIFF(CURDATE(), DATE(COALESCE(MAX(im.movement_date), t.created_at))) > 60
                      THEN 0.25
                    WHEN t.movement_speed = 'dead' THEN 0.15
                    ELSE 0.10
                  END
                ), 2
              ) AS offer_price
            FROM thans t
            LEFT JOIN products p  ON t.product_id = p.product_id
            LEFT JOIN inventory_movements im ON im.than_id = t.than_id
            WHERE t.remaining_stock > 0
              AND t.movement_speed IN ('slow', 'dead')
            GROUP BY
              t.than_id, t.than_code, t.fabric_type, t.color, t.design,
              t.gsm, t.remaining_stock, t.selling_price, t.cost_per_meter,
              t.warehouse_location, t.movement_speed, t.image_url,
              p.product_name, p.category, t.created_at
            ORDER BY
              CASE t.movement_speed WHEN 'dead' THEN 0 ELSE 1 END,
              days_idle DESC
            LIMIT 60`, []);
        res.json({ success: true, rows });
    } catch (err) {
        logger.error({ err }, '[dealers] GET /cockpit/ageing-stock');
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── GET /api/dealers/cockpit/dispatches ──────────────────────────────────────
// Dispatch + order status for this dealer's accepted quotations.
// Falls back gracefully if orders/dispatches tables don't exist yet
// (migration_v4.sql not yet run).
router.get('/cockpit/dispatches', checkPermission('VIEW_QUOTATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();

        // Try full join first (requires migration_v4 tables)
        const rows = await conn.query(`
            SELECT
              q.quotation_id,
              q.quotation_number,
              c.customer_name,
              q.total_amount,
              q.updated_at        AS accepted_on,
              o.order_id,
              o.status            AS order_status,
              o.expected_dispatch,
              o.notes             AS order_notes,
              d.dispatch_id,
              d.vehicle_number,
              d.driver_name,
              d.tracking_number,
              d.dispatch_date,
              d.expected_delivery,
              d.delivery_status
            FROM quotations q
            LEFT JOIN customers  c ON c.customer_id  = q.customer_id
            LEFT JOIN orders     o ON o.quotation_id = q.quotation_id
            LEFT JOIN dispatches d ON d.order_id     = o.order_id
            WHERE q.user_id = ? AND q.status = 'accepted'
            ORDER BY q.updated_at DESC`, [req.user.user_id]);

        res.json({ success: true, rows });
    } catch (err) {
        // If orders/dispatches tables don't exist yet, return accepted quotations only
        if (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR') {
            let conn2;
            try {
                conn2 = await pool.getConnection();
                const fallback = await conn2.query(`
                    SELECT
                      q.quotation_id, q.quotation_number,
                      c.customer_name, q.total_amount,
                      q.updated_at AS accepted_on,
                      NULL AS order_id, NULL AS order_status,
                      NULL AS dispatch_date, NULL AS delivery_status
                    FROM quotations q
                    LEFT JOIN customers c ON c.customer_id = q.customer_id
                    WHERE q.user_id = ? AND q.status = 'accepted'
                    ORDER BY q.updated_at DESC`, [req.user.user_id]);
                return res.json({ success: true, rows: fallback, _migrationPending: true });
            } catch (e2) {
                logger.error({ e2 }, '[dealers] GET /cockpit/dispatches fallback');
            } finally { if (conn2) conn2.release(); }
        }
        logger.error({ err }, '[dealers] GET /cockpit/dispatches');
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── POST /api/dealers ────────────────────────────────────────────────────────
router.post('/', checkPermission('CREATE_RETAILER'), async (req, res) => {
    const { company_name, contact_number, address } = req.body;
    if (!company_name?.trim())
        return res.status(400).json({ error: 'company_name is required' });
    let conn;
    try {
        conn = await pool.getConnection();
        const [existing] = await conn.query(
            `SELECT retailer_id FROM retailers
             WHERE assigned_user_id = ?
               AND (is_deleted = 0 OR is_deleted IS NULL) LIMIT 1`,
            [req.user.user_id]
        );
        if (existing) {
            await conn.query(
                `UPDATE retailers
                 SET shop_name       = COALESCE(?, shop_name),
                     phone_number    = COALESCE(?, phone_number),
                     market_location = COALESCE(?, market_location),
                     updated_at      = NOW()
                 WHERE retailer_id = ?`,
                [company_name.trim(), contact_number?.trim() || null,
                 address?.trim() || null, existing.retailer_id]
            );
            return res.json({ success: true, retailer_id: existing.retailer_id, action: 'updated' });
        }
        const result = await conn.query(
            `INSERT INTO retailers (shop_name, phone_number, market_location, assigned_user_id)
             VALUES (?, ?, ?, ?)`,
            [company_name.trim(), contact_number?.trim() || null,
             address?.trim() || null, req.user.user_id]
        );
        res.status(201).json({ success: true, retailer_id: Number(result.insertId), action: 'created' });
    } catch (err) {
        logger.error({ err }, '[dealers] POST /');
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

export default router;

/**
 * /api/operations, /api/thans, /api/inventory
 *
 * Phase 7 additions:
 *  1. retailerSignals — affinity_category + affinity_score per retailer
 *  2. seasonalMovement — monthly sold meters + 3-month rolling avg per category
 *  3. recalculateSpeeds() — reads dead_stock_days from app_settings
 */
import express from 'express';
import pool from '../db.js';
import { checkPermission } from '../middleware/checkPermission.js';
import { cache } from '../middleware/cacheMiddleware.js';
import { flush } from '../cache.js';
import { DEAD_DAYS } from './sales.js';
import { getDeadStockDays } from './settings.js';
import logger from '../logger.js';

const router = express.Router();

// ── GET /api/thans ────────────────────────────────────────────────────────────────────────────────
router.get('/thans',
    checkPermission('VIEW_OPERATIONS'),
    cache((req) => `thans:${JSON.stringify(req.query)}`, 30),
    async (req, res) => {
        const { fabric_type, color, design, movement_speed, status, min_stock } = req.query;
        const clauses = [];
        const params  = [];

        if (fabric_type)    { clauses.push('t.fabric_type    LIKE ?'); params.push(`%${fabric_type}%`); }
        if (color)          { clauses.push('t.color          LIKE ?'); params.push(`%${color}%`); }
        if (design)         { clauses.push('t.design         LIKE ?'); params.push(`%${design}%`); }
        if (movement_speed) { clauses.push('t.movement_speed  = ?');  params.push(movement_speed); }
        if (status)         { clauses.push('t.status          = ?');  params.push(status); }
        if (min_stock)      { clauses.push('t.remaining_stock >= ?'); params.push(Number(min_stock)); }

        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        let conn;
        try {
            conn = await pool.getConnection();
            const rows = await conn.query(
                `SELECT t.than_id, t.than_code, t.bale_id, t.fabric_type, t.color, t.design,
                        t.gsm, t.meter_length, t.remaining_stock, t.cost_per_meter,
                        t.selling_price, t.warehouse_location, t.movement_speed, t.status,
                        t.image_url,
                        ROUND(t.selling_price - t.cost_per_meter, 2) AS margin_per_meter,
                        p.product_name, p.category,
                        b.bale_code, b.arrival_date
                 FROM thans t
                 LEFT JOIN products p ON t.product_id = p.product_id
                 LEFT JOIN bales   b ON t.bale_id     = b.bale_id
                 ${where}
                 ORDER BY
                    CASE t.movement_speed
                        WHEN 'fast'   THEN 0
                        WHEN 'medium' THEN 1
                        WHEN 'slow'   THEN 2
                        WHEN 'new'    THEN 3
                        WHEN 'dead'   THEN 4
                    END,
                    t.remaining_stock DESC
                 LIMIT 200`,
                params
            );
            res.json(rows);
        } catch (err) { res.status(500).json({ error: err.message }); }
        finally { if (conn) conn.release(); }
    }
);

// ── POST /api/thans/:id/image ─────────────────────────────────────────────────────────
router.post('/thans/:id/image', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    const { image_url } = req.body;
    const thanId = Number(req.params.id);
    if (!image_url?.trim()) return res.status(400).json({ error: 'image_url is required' });
    const isUrl    = /^https?:\/\//i.test(image_url);
    const isBase64 = /^data:image\//i.test(image_url);
    if (!isUrl && !isBase64)
        return res.status(400).json({ error: 'image_url must be a https:// URL or data:image/ URI' });
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query(
            'UPDATE thans SET image_url = ? WHERE than_id = ?',
            [image_url.trim(), thanId]
        );
        if (Number(result.affectedRows) === 0) return res.status(404).json({ error: 'Than not found' });
        flush('thans:*').catch(() => {});
        res.json({ success: true, than_id: thanId, image_url: image_url.trim() });
    } catch (err) {
        logger.error({ err }, '[thans] POST /:id/image');
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── GET /api/operations/dashboard ───────────────────────────────────────────────────────────
router.get('/dashboard',
    checkPermission('VIEW_OPERATIONS'),
    cache('dashboard', 60),
    async (req, res) => {
        let conn;
        try {
            conn = await pool.getConnection();

            const [summary] = await conn.query(
                `SELECT
                    COUNT(DISTINCT b.bale_id)  AS total_bales,
                    COUNT(DISTINCT t.than_id)  AS total_thans,
                    COALESCE(SUM(t.remaining_stock), 0)                                        AS available_meters,
                    COALESCE(SUM(t.remaining_stock * t.cost_per_meter), 0)                     AS stock_cost_value,
                    COALESCE(SUM(t.remaining_stock * t.selling_price), 0)                      AS stock_retail_value,
                    COALESCE(SUM((t.selling_price - t.cost_per_meter) * t.remaining_stock), 0) AS unrealized_margin,
                    SUM(CASE WHEN t.movement_speed = 'dead' THEN 1 ELSE 0 END)                 AS dead_than_count,
                    COALESCE(SUM(CASE WHEN t.movement_speed = 'dead'
                        THEN t.remaining_stock * t.cost_per_meter ELSE 0 END), 0)              AS dead_stock_value
                 FROM thans t
                 LEFT JOIN bales b ON t.bale_id = b.bale_id`
            );

            const categoryMovement = await conn.query(
                `SELECT
                    COALESCE(p.category, t.fabric_type) AS category,
                    COUNT(DISTINCT t.than_id)            AS than_count,
                    COALESCE(SUM(t.remaining_stock), 0)  AS remaining_meters,
                    COALESCE(SUM(tx.quantity), 0)         AS sold_meters,
                    COALESCE(SUM(tx.margin), 0)           AS realized_margin,
                    ROUND(
                        COALESCE(SUM(tx.quantity), 0) /
                        NULLIF(COALESCE(SUM(tx.quantity), 0) + COALESCE(SUM(t.remaining_stock), 0), 0),
                        3
                    ) AS sell_through_rate
                 FROM thans t
                 LEFT JOIN products p ON t.product_id = p.product_id
                 LEFT JOIN (
                    SELECT than_id, SUM(quantity) AS quantity, SUM(margin) AS margin
                    FROM transactions GROUP BY than_id
                 ) tx ON tx.than_id = t.than_id
                 GROUP BY COALESCE(p.category, t.fabric_type)
                 ORDER BY sold_meters DESC, realized_margin DESC
                 LIMIT 8`
            );

            const deadStock = await conn.query(
                `SELECT
                    t.than_id, t.than_code, t.fabric_type, t.color, t.design,
                    t.remaining_stock, t.cost_per_meter, t.selling_price, t.image_url,
                    ROUND(t.remaining_stock * t.cost_per_meter, 2) AS cost_value,
                    t.warehouse_location, t.movement_speed,
                    DATEDIFF(CURDATE(), DATE(COALESCE(MAX(im.movement_date), t.created_at))) AS days_without_movement
                 FROM thans t
                 LEFT JOIN inventory_movements im ON im.than_id = t.than_id
                 WHERE t.remaining_stock > 0
                 GROUP BY
                    t.than_id, t.than_code, t.fabric_type, t.color, t.design,
                    t.remaining_stock, t.cost_per_meter, t.selling_price,
                    t.image_url, t.warehouse_location, t.movement_speed, t.created_at
                 ORDER BY
                    CASE t.movement_speed WHEN 'dead' THEN 0 WHEN 'slow' THEN 1 WHEN 'new' THEN 2 ELSE 3 END,
                    days_without_movement DESC, t.remaining_stock DESC
                 LIMIT 15`
            );

            const retailerSignals = await conn.query(
                `SELECT
                    r.retailer_id, r.shop_name, r.market_location, r.payment_pattern,
                    r.preferred_categories, r.preferred_price_segment, r.outstanding_balance,
                    r.preferred_categories_json,
                    COUNT(tx.transaction_id)     AS order_count,
                    COALESCE(SUM(tx.quantity), 0) AS meters_bought,
                    COALESCE(SUM(tx.revenue), 0)  AS revenue,
                    COALESCE(SUM(tx.margin), 0)   AS margin,
                    aff.affinity_category,
                    ROUND(
                        COALESCE(aff.affinity_meters, 0) / NULLIF(COALESCE(SUM(tx.quantity), 0), 0),
                        3
                    ) AS affinity_score
                 FROM retailers r
                 LEFT JOIN (
                    SELECT transaction_id, retailer_id, quantity, margin,
                           (price * quantity - COALESCE(discount, 0)) AS revenue
                    FROM transactions
                 ) tx ON r.retailer_id = tx.retailer_id
                 LEFT JOIN (
                    SELECT retailer_id, category AS affinity_category, cat_meters AS affinity_meters
                    FROM (
                        SELECT
                            tx2.retailer_id,
                            COALESCE(p2.category, t2.fabric_type) AS category,
                            SUM(tx2.quantity) AS cat_meters,
                            ROW_NUMBER() OVER (
                                PARTITION BY tx2.retailer_id
                                ORDER BY SUM(tx2.quantity) DESC
                            ) AS rn
                        FROM transactions tx2
                        LEFT JOIN thans    t2 ON tx2.than_id    = t2.than_id
                        LEFT JOIN products p2 ON tx2.product_id = p2.product_id
                        WHERE tx2.retailer_id IS NOT NULL
                        GROUP BY tx2.retailer_id, COALESCE(p2.category, t2.fabric_type)
                    ) ranked
                    WHERE rn = 1
                 ) aff ON r.retailer_id = aff.retailer_id
                 GROUP BY
                    r.retailer_id, r.shop_name, r.market_location, r.payment_pattern,
                    r.preferred_categories, r.preferred_price_segment, r.outstanding_balance,
                    r.preferred_categories_json, aff.affinity_category, aff.affinity_meters
                 ORDER BY revenue DESC, meters_bought DESC
                 LIMIT 8`
            );

            const supplierSignals = await conn.query(
                `SELECT
                    s.supplier_id, s.supplier_name, s.quality_rating,
                    s.delay_frequency, s.trend_alignment,
                    COUNT(DISTINCT b.bale_id)     AS bales_received,
                    COUNT(DISTINCT t.than_id)     AS thans_created,
                    COALESCE(SUM(tx.quantity), 0)  AS meters_sold,
                    COALESCE(SUM(tx.margin), 0)    AS realized_margin
                 FROM suppliers s
                 LEFT JOIN bales b ON s.supplier_id = b.supplier_id
                 LEFT JOIN thans t ON b.bale_id = t.bale_id
                 LEFT JOIN (
                    SELECT than_id, SUM(quantity) AS quantity, SUM(margin) AS margin
                    FROM transactions GROUP BY than_id
                 ) tx ON t.than_id = tx.than_id
                 GROUP BY s.supplier_id, s.supplier_name, s.quality_rating, s.delay_frequency, s.trend_alignment
                 ORDER BY realized_margin DESC, meters_sold DESC`
            );

            const seasonalRaw = await conn.query(
                `SELECT
                    COALESCE(p.category, t.fabric_type)       AS category,
                    DATE_FORMAT(tx.transaction_date, '%Y-%m') AS month,
                    SUM(tx.quantity)                           AS sold_meters
                 FROM transactions tx
                 LEFT JOIN thans    t ON tx.than_id    = t.than_id
                 LEFT JOIN products p ON tx.product_id = p.product_id
                 WHERE tx.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                 GROUP BY COALESCE(p.category, t.fabric_type), DATE_FORMAT(tx.transaction_date, '%Y-%m')
                 ORDER BY category, month`
            );

            const seasonalMovement = computeRolling(seasonalRaw);

            res.json({ summary, categoryMovement, deadStock, retailerSignals, supplierSignals, seasonalMovement });
        } catch (err) {
            res.status(500).json({ error: err.message });
        } finally { if (conn) conn.release(); }
    }
);

function computeRolling(rows) {
    const byCategory = {};
    for (const r of rows) {
        if (!byCategory[r.category]) byCategory[r.category] = [];
        byCategory[r.category].push({ month: r.month, sold_meters: Number(r.sold_meters) });
    }
    const result = [];
    for (const [category, months] of Object.entries(byCategory)) {
        for (let i = 0; i < months.length; i++) {
            const window = months.slice(Math.max(0, i - 2), i + 1);
            const avg    = window.reduce((s, m) => s + m.sold_meters, 0) / window.length;
            result.push({
                category,
                month:          months[i].month,
                sold_meters:    months[i].sold_meters,
                rolling_avg_3m: Math.round(avg * 100) / 100,
            });
        }
    }
    return result;
}

// ── GET /api/inventory/search ────────────────────────────────────────────────────────────────────
// server.js mounts this router at /api/inventory — so Express strips that prefix.
// The route must be /search (not /inventory/search) to match /api/inventory/search.
router.get('/search', async (req, res) => {
    const q        = String(req.query.q || '').trim();
    const maxPrice = req.query.max_price ? Number(req.query.max_price) : null;
    const params   = [];
    const clauses  = ['t.remaining_stock > 0'];
    if (q) {
        clauses.push(`(t.than_code LIKE ? OR t.fabric_type LIKE ? OR t.color LIKE ?
            OR t.design LIKE ? OR COALESCE(p.category, '') LIKE ? OR t.warehouse_location LIKE ?)`);
        const like = `%${q}%`;
        params.push(like, like, like, like, like, like);
    }
    if (maxPrice !== null && !isNaN(maxPrice)) { clauses.push('t.selling_price <= ?'); params.push(maxPrice); }
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(
            `SELECT t.than_id, t.than_code, t.fabric_type, t.color, t.design,
                    t.gsm, t.remaining_stock, t.selling_price, t.cost_per_meter,
                    t.warehouse_location, t.movement_speed, t.image_url,
                    ROUND(t.selling_price - t.cost_per_meter, 2) AS margin_per_meter,
                    p.product_name, p.category
             FROM thans t
             LEFT JOIN products p ON t.product_id = p.product_id
             WHERE ${clauses.join(' AND ')}
             ORDER BY
                CASE t.movement_speed
                    WHEN 'fast' THEN 0 WHEN 'medium' THEN 1
                    WHEN 'slow' THEN 2 WHEN 'new'    THEN 3 WHEN 'dead' THEN 4
                END, t.remaining_stock DESC
             LIMIT 100`,
            params
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// ── POST /api/admin/recalculate-speeds ─────────────────────────────────────────────────────────────
router.post('/admin/recalculate-speeds', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    const updated = await recalculateSpeeds();
    flush('thans:*').catch(() => {});
    flush('dashboard').catch(() => {});
    res.json({ success: true, updated });
});

export async function recalculateSpeeds() {
    const deadDays = await getDeadStockDays();
    let conn;
    try {
        conn = await pool.getConnection();
        const thans = await conn.query(
            `SELECT t.than_id, t.remaining_stock,
                    DATEDIFF(CURDATE(), DATE(COALESCE(MAX(im.movement_date), t.created_at))) AS idle_days,
                    (SELECT COUNT(*) FROM inventory_movements
                     WHERE than_id = t.than_id AND movement_type = 'stock_out') AS sale_count
             FROM thans t
             LEFT JOIN inventory_movements im ON im.than_id = t.than_id
             WHERE t.remaining_stock > 0
             GROUP BY t.than_id, t.remaining_stock, t.created_at`
        );
        let updated = 0;
        for (const row of thans) {
            const idle  = Number(row.idle_days  || 0);
            const sales = Number(row.sale_count || 0);
            let speed;
            if (sales === 0)          speed = 'new';
            else if (idle >= deadDays) speed = 'dead';
            else if (idle >= 30)       speed = 'slow';
            else if (idle >= 8)        speed = 'medium';
            else                       speed = 'fast';
            await conn.query('UPDATE thans SET movement_speed = ? WHERE than_id = ?', [speed, row.than_id]);
            updated++;
        }
        return updated;
    } finally { if (conn) conn.release(); }
}

export default router;

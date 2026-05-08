import express from 'express';
import pool from '../db.js';
import { checkPermission } from '../middleware/checkPermission.js';
import { cache, invalidate } from '../middleware/cacheMiddleware.js';
import { flush } from '../cache.js';

const router = express.Router();

// ── GET /api/thans (global search, cached 30s) ────────────────────────────────
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

// ── GET /api/operations/dashboard (cached 60s) ────────────────────────────────
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
                    t.remaining_stock, t.cost_per_meter, t.selling_price,
                    ROUND(t.remaining_stock * t.cost_per_meter, 2) AS cost_value,
                    t.warehouse_location, t.movement_speed,
                    DATEDIFF(CURDATE(),
                        DATE(COALESCE(MAX(im.movement_date), t.created_at))
                    ) AS days_without_movement
                 FROM thans t
                 LEFT JOIN inventory_movements im ON im.than_id = t.than_id
                 WHERE t.remaining_stock > 0
                 GROUP BY
                    t.than_id, t.than_code, t.fabric_type, t.color, t.design,
                    t.remaining_stock, t.cost_per_meter, t.selling_price,
                    t.warehouse_location, t.movement_speed, t.created_at
                 ORDER BY
                    CASE t.movement_speed
                        WHEN 'dead' THEN 0
                        WHEN 'slow' THEN 1
                        WHEN 'new'  THEN 2
                        ELSE 3
                    END,
                    days_without_movement DESC, t.remaining_stock DESC
                 LIMIT 15`
            );

            const retailerSignals = await conn.query(
                `SELECT
                    r.retailer_id, r.shop_name, r.market_location, r.payment_pattern,
                    r.preferred_categories, r.preferred_price_segment, r.outstanding_balance,
                    COUNT(tx.transaction_id)                               AS order_count,
                    COALESCE(SUM(tx.quantity), 0)                          AS meters_bought,
                    COALESCE(SUM(tx.price * tx.quantity - tx.discount), 0) AS revenue,
                    COALESCE(SUM(tx.margin), 0)                            AS margin
                 FROM retailers r
                 LEFT JOIN transactions tx ON r.retailer_id = tx.retailer_id
                 GROUP BY
                    r.retailer_id, r.shop_name, r.market_location, r.payment_pattern,
                    r.preferred_categories, r.preferred_price_segment, r.outstanding_balance
                 ORDER BY revenue DESC, meters_bought DESC
                 LIMIT 8`
            );

            const supplierSignals = await conn.query(
                `SELECT
                    s.supplier_id, s.supplier_name, s.quality_rating,
                    s.delay_frequency, s.trend_alignment,
                    COUNT(DISTINCT b.bale_id)    AS bales_received,
                    COUNT(DISTINCT t.than_id)    AS thans_created,
                    COALESCE(SUM(tx.quantity), 0) AS meters_sold,
                    COALESCE(SUM(tx.margin), 0)   AS realized_margin
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

            res.json({ summary, categoryMovement, deadStock, retailerSignals, supplierSignals });
        } catch (err) {
            res.status(500).json({ error: err.message });
        } finally { if (conn) conn.release(); }
    }
);

// ── GET /api/inventory/search ─────────────────────────────────────────────────
router.get('/inventory/search', async (req, res) => {
    const q        = String(req.query.q || '').trim();
    const maxPrice = req.query.max_price ? Number(req.query.max_price) : null;
    const params   = [];
    const clauses  = ['t.remaining_stock > 0'];

    if (q) {
        clauses.push(`(
            t.than_code LIKE ? OR t.fabric_type LIKE ? OR t.color LIKE ?
            OR t.design LIKE ? OR COALESCE(p.category, '') LIKE ?
            OR t.warehouse_location LIKE ?
        )`);
        const like = `%${q}%`;
        params.push(like, like, like, like, like, like);
    }
    if (maxPrice !== null && !isNaN(maxPrice)) {
        clauses.push('t.selling_price <= ?');
        params.push(maxPrice);
    }

    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(
            `SELECT t.than_id, t.than_code, t.fabric_type, t.color, t.design,
                    t.gsm, t.remaining_stock, t.selling_price, t.cost_per_meter,
                    t.warehouse_location, t.movement_speed,
                    ROUND(t.selling_price - t.cost_per_meter, 2) AS margin_per_meter,
                    p.product_name, p.category
             FROM thans t
             LEFT JOIN products p ON t.product_id = p.product_id
             WHERE ${clauses.join(' AND ')}
             ORDER BY
                CASE t.movement_speed
                    WHEN 'fast'   THEN 0
                    WHEN 'medium' THEN 1
                    WHEN 'slow'   THEN 2
                    WHEN 'new'    THEN 3
                    WHEN 'dead'   THEN 4
                END,
                t.remaining_stock DESC
             LIMIT 100`,
            params
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// ── POST /api/admin/recalculate-speeds ───────────────────────────────────────
router.post('/admin/recalculate-speeds', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    const updated = await recalculateSpeeds();
    flush('thans:*').catch(() => {});
    flush('dashboard').catch(() => {});
    res.json({ success: true, updated });
});

async function recalculateSpeeds() {
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
            if (sales === 0)     speed = 'new';
            else if (idle >= 90) speed = 'dead';
            else if (idle >= 45) speed = 'slow';
            else if (idle >= 14) speed = 'medium';
            else                 speed = 'fast';
            await conn.query('UPDATE thans SET movement_speed = ? WHERE than_id = ?', [speed, row.than_id]);
            updated++;
        }
        return updated;
    } finally { if (conn) conn.release(); }
}

export { recalculateSpeeds };
export default router;

import express from 'express';
import pool from '../db.js';
import { checkPermission } from '../middleware/checkPermission.js';
import { cache } from '../middleware/cacheMiddleware.js';

const router = express.Router();

// ── GET /api/analytics/top-retailers ────────────────────────────────────────
router.get('/top-retailers',
    checkPermission('VIEW_OPERATIONS'),
    cache('analytics:top-retailers', 120),
    async (req, res) => {
        let conn;
        try {
            conn = await pool.getConnection();
            const rows = await conn.query(
                `SELECT
                    r.retailer_id,
                    r.shop_name,
                    r.market_location,
                    r.payment_pattern,
                    r.outstanding_balance,
                    r.preferred_categories,
                    COUNT(tx.transaction_id)                               AS order_count,
                    COALESCE(SUM(tx.quantity), 0)                          AS meters_bought,
                    COALESCE(SUM(tx.price * tx.quantity - tx.discount), 0) AS revenue,
                    COALESCE(SUM(tx.margin), 0)                            AS margin,
                    ROUND(
                        COALESCE(SUM(tx.margin), 0) /
                        NULLIF(COALESCE(SUM(tx.price * tx.quantity - tx.discount), 0), 0) * 100,
                        1
                    ) AS margin_pct
                 FROM retailers r
                 LEFT JOIN transactions tx ON r.retailer_id = tx.retailer_id
                 GROUP BY
                    r.retailer_id, r.shop_name, r.market_location, r.payment_pattern,
                    r.outstanding_balance, r.preferred_categories
                 HAVING revenue > 0
                 ORDER BY revenue DESC
                 LIMIT 10`
            );
            res.json(rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        } finally { if (conn) conn.release(); }
    }
);

// ── GET /api/analytics/margin-per-supplier ────────────────────────────────────
router.get('/margin-per-supplier',
    checkPermission('VIEW_OPERATIONS'),
    cache('analytics:margin-per-supplier', 120),
    async (req, res) => {
        let conn;
        try {
            conn = await pool.getConnection();
            const rows = await conn.query(
                `SELECT
                    s.supplier_id,
                    s.supplier_name,
                    s.quality_rating,
                    s.delay_frequency,
                    s.trend_alignment,
                    COUNT(DISTINCT b.bale_id)     AS bales_received,
                    COUNT(DISTINCT t.than_id)     AS thans_created,
                    COALESCE(SUM(tx.quantity), 0) AS meters_sold,
                    COALESCE(SUM(tx.margin), 0)   AS realized_margin,
                    ROUND(
                        COALESCE(SUM(tx.margin), 0) /
                        NULLIF(COALESCE(SUM(tx.quantity), 0), 0),
                        2
                    ) AS margin_per_meter,
                    ROUND(
                        COALESCE(SUM(tx.margin), 0) /
                        NULLIF(COALESCE(SUM(tx.margin), 0) + COALESCE(SUM(t.remaining_stock * t.cost_per_meter), 0), 0) * 100,
                        1
                    ) AS capital_efficiency_pct
                 FROM suppliers s
                 LEFT JOIN bales b ON s.supplier_id = b.supplier_id
                 LEFT JOIN thans t ON b.bale_id = t.bale_id
                 LEFT JOIN (
                    SELECT than_id,
                           SUM(quantity) AS quantity,
                           SUM(margin)   AS margin
                    FROM transactions
                    GROUP BY than_id
                 ) tx ON t.than_id = tx.than_id
                 GROUP BY
                    s.supplier_id, s.supplier_name, s.quality_rating,
                    s.delay_frequency, s.trend_alignment
                 ORDER BY realized_margin DESC`
            );
            res.json(rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        } finally { if (conn) conn.release(); }
    }
);

// ── GET /api/analytics/margin-per-retailer ───────────────────────────────────
router.get('/margin-per-retailer',
    checkPermission('VIEW_OPERATIONS'),
    cache('analytics:margin-per-retailer', 120),
    async (req, res) => {
        let conn;
        try {
            conn = await pool.getConnection();
            const rows = await conn.query(
                `SELECT
                    r.retailer_id,
                    r.shop_name,
                    r.market_location,
                    r.payment_pattern,
                    r.outstanding_balance,
                    r.preferred_categories,
                    COUNT(tx.transaction_id)                               AS order_count,
                    COALESCE(SUM(tx.quantity), 0)                          AS meters_bought,
                    COALESCE(SUM(tx.price * tx.quantity - tx.discount), 0) AS revenue,
                    COALESCE(SUM(tx.margin), 0)                            AS total_margin,
                    ROUND(
                        COALESCE(SUM(tx.margin), 0) /
                        NULLIF(COUNT(tx.transaction_id), 0),
                        2
                    ) AS avg_margin_per_order,
                    ROUND(
                        COALESCE(SUM(tx.margin), 0) /
                        NULLIF(COALESCE(SUM(tx.price * tx.quantity - tx.discount), 0), 0) * 100,
                        1
                    ) AS margin_pct
                 FROM retailers r
                 LEFT JOIN transactions tx ON r.retailer_id = tx.retailer_id
                 GROUP BY
                    r.retailer_id, r.shop_name, r.market_location, r.payment_pattern,
                    r.outstanding_balance, r.preferred_categories
                 HAVING revenue > 0
                 ORDER BY total_margin DESC
                 LIMIT 15`
            );
            res.json(rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        } finally { if (conn) conn.release(); }
    }
);

// ── GET /api/analytics/bale-performance ──────────────────────────────────────────
// Returns best and worst performing bales by total margin.
// ?mode=best|worst&limit=5
//
// NOTE: The subquery aggregates transactions per than_id and exposes only
//   quantity, margin, revenue_tx  — raw columns like price/discount are
//   NOT available on the derived table alias `tx`.
router.get('/bale-performance',
    checkPermission('VIEW_OPERATIONS'),
    cache('analytics:bale-performance', 120),
    async (req, res) => {
        const mode  = req.query.mode  === 'worst' ? 'worst' : 'best';
        const limit = Math.min(parseInt(req.query.limit || '5', 10), 20);
        const orderDir = mode === 'best' ? 'DESC' : 'ASC';
        let conn;
        try {
            conn = await pool.getConnection();
            const rows = await conn.query(
                `SELECT
                    b.bale_id,
                    b.bale_code,
                    b.arrival_date,
                    s.supplier_name,
                    COUNT(DISTINCT t.than_id)               AS than_count,
                    COALESCE(SUM(tx.quantity), 0)           AS meters_sold,
                    COALESCE(SUM(t.remaining_stock), 0)     AS meters_remaining,
                    COALESCE(SUM(tx.revenue_tx), 0)         AS revenue,
                    COALESCE(SUM(tx.margin), 0)             AS total_margin,
                    ROUND(
                        COALESCE(SUM(tx.margin), 0) /
                        NULLIF(COALESCE(SUM(tx.revenue_tx), 0), 0) * 100,
                        1
                    ) AS margin_pct,
                    ROUND(
                        COALESCE(SUM(tx.quantity), 0) /
                        NULLIF(COALESCE(SUM(tx.quantity), 0) + COALESCE(SUM(t.remaining_stock), 0), 0) * 100,
                        1
                    ) AS sell_through_pct,
                    DATEDIFF(CURDATE(), DATE(b.arrival_date)) AS days_since_arrival
                 FROM bales b
                 LEFT JOIN suppliers s  ON b.supplier_id = s.supplier_id
                 LEFT JOIN thans t      ON t.bale_id     = b.bale_id
                 LEFT JOIN (
                    SELECT than_id,
                           SUM(quantity)                    AS quantity,
                           SUM(margin)                      AS margin,
                           SUM(price * quantity - discount) AS revenue_tx
                    FROM transactions
                    GROUP BY than_id
                 ) tx ON t.than_id = tx.than_id
                 GROUP BY b.bale_id, b.bale_code, b.arrival_date, s.supplier_name
                 HAVING meters_sold > 0
                 ORDER BY total_margin ${orderDir}
                 LIMIT ?`,
                [limit]
            );
            res.json({ mode, rows });
        } catch (err) {
            res.status(500).json({ error: err.message });
        } finally { if (conn) conn.release(); }
    }
);

export default router;

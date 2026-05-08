import express from 'express';
import pool from '../db.js';
import { checkPermission } from '../middleware/checkPermission.js';
import { cache } from '../middleware/cacheMiddleware.js';

const router = express.Router();

const money  = (v) => Number(v || 0);
const meters = (v) => Number(v || 0);

// ── GET /api/analytics/top-retailers ─────────────────────────────────────────
// Returns top 10 retailers ranked by realized revenue with order count,
// payment pattern, outstanding balance, and top-bought category.
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
                    COUNT(tx.transaction_id)                                    AS order_count,
                    COALESCE(SUM(tx.quantity), 0)                               AS meters_bought,
                    COALESCE(SUM(tx.price * tx.quantity - tx.discount), 0)      AS revenue,
                    COALESCE(SUM(tx.margin), 0)                                 AS margin,
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
// Returns margin realized per supplier: total margin, margin per meter sold,
// bales received, quality rating, and delay frequency.
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

export default router;

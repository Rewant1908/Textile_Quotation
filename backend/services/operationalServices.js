// services/operationalServices.js
// Phase 9: Dealer Operational Service Layer
//
// Safe, scoped SQL functions called by the WhatsApp dealer agent.
// The AI NEVER generates raw SQL — it calls these functions.
//
// All functions:
//   - Accept dealerId (user_id) as first param for scope isolation
//   - Return plain JS objects ready for formatters
//   - Throw on DB error (caller catches + replies gracefully)
//
// Exports:
//   getDashboardSummary(dealerId)
//   getMyQuotations(dealerId, limit?)
//   getPendingOrders(dealerId)
//   getReceivablesAgeing(dealerId)
//   getDispatchStatus(dealerId, ref?)
//   getAgingStockOffers(limit?)

import pool   from '../db.js'
import logger from '../logger.js'

// ── Dashboard Summary ──────────────────────────────────────────────────────────
export async function getDashboardSummary(dealerId) {
    let conn
    try {
        conn = await pool.getConnection()

        const [qRow] = await conn.query(
            `SELECT
                COUNT(*)                    AS pending_quotations,
                COALESCE(SUM(total_amount), 0) AS pending_value
             FROM quotations
             WHERE user_id = ? AND status IN ('draft','sent')`,
            [dealerId]
        )

        const [rxRow] = await conn.query(
            `SELECT COALESCE(SUM(t.amount_due), 0) AS total_outstanding
             FROM transactions t
             JOIN retailers r ON r.retailer_id = t.retailer_id
             WHERE r.assigned_user_id = ? AND t.amount_due > 0`,
            [dealerId]
        )

        const [stockRow] = await conn.query(
            `SELECT COUNT(*) AS offers_available
             FROM thans
             WHERE movement_speed IN ('slow','dead')
               AND remaining_stock > 0
               AND status = 'active'`
        )

        const [lastRow] = await conn.query(
            `SELECT MAX(updated_at) AS last_activity
             FROM quotations
             WHERE user_id = ? AND status = 'accepted'`,
            [dealerId]
        )

        return {
            pending_quotations: Number(qRow?.pending_quotations  ?? 0),
            pending_value:      Number(qRow?.pending_value       ?? 0),
            total_outstanding:  Number(rxRow?.total_outstanding  ?? 0),
            offers_available:   Number(stockRow?.offers_available ?? 0),
            last_activity:      lastRow?.last_activity ?? null,
        }
    } finally {
        if (conn) conn.release()
    }
}

// ── My Quotations ──────────────────────────────────────────────────────────────
export async function getMyQuotations(dealerId, limit = 5) {
    let conn
    try {
        conn = await pool.getConnection()
        return await conn.query(
            `SELECT
                COALESCE(q.quotation_number,
                    CONCAT('KTQ-', YEAR(q.created_at), '-', LPAD(q.quotation_id, 6, '0')))
                    AS quotation_number,
                c.customer_name,
                q.total_amount,
                q.status,
                q.created_at
             FROM quotations q
             LEFT JOIN customers c ON c.customer_id = q.customer_id
             WHERE q.user_id = ?
             ORDER BY q.created_at DESC
             LIMIT ?`,
            [dealerId, Number(limit)]
        )
    } finally {
        if (conn) conn.release()
    }
}

// ── Pending Orders ─────────────────────────────────────────────────────────────
export async function getPendingOrders(dealerId) {
    let conn
    try {
        conn = await pool.getConnection()
        return await conn.query(
            `SELECT
                COALESCE(q.quotation_number,
                    CONCAT('KTQ-', YEAR(q.created_at), '-', LPAD(q.quotation_id, 6, '0')))
                    AS ref,
                c.customer_name,
                q.total_amount,
                q.status,
                q.created_at,
                DATEDIFF(NOW(), q.created_at) AS days_open
             FROM quotations q
             LEFT JOIN customers c ON c.customer_id = q.customer_id
             WHERE q.user_id = ? AND q.status IN ('draft','sent')
             ORDER BY q.created_at ASC`,
            [dealerId]
        )
    } finally {
        if (conn) conn.release()
    }
}

// ── Receivables Ageing ─────────────────────────────────────────────────────────
export async function getReceivablesAgeing(dealerId) {
    let conn
    try {
        conn = await pool.getConnection()
        const rows = await conn.query(
            `SELECT
                r.retailer_name,
                t.transaction_date,
                t.amount_due,
                DATEDIFF(NOW(), t.transaction_date) AS days_outstanding,
                CASE
                    WHEN DATEDIFF(NOW(), t.transaction_date) <= 30 THEN 'current'
                    WHEN DATEDIFF(NOW(), t.transaction_date) <= 60 THEN 'overdue_30'
                    WHEN DATEDIFF(NOW(), t.transaction_date) <= 90 THEN 'overdue_60'
                    ELSE 'overdue_90'
                END AS bucket
             FROM transactions t
             JOIN retailers r ON r.retailer_id = t.retailer_id
             WHERE r.assigned_user_id = ? AND t.amount_due > 0
             ORDER BY t.transaction_date ASC`,
            [dealerId]
        )

        const buckets = { current: 0, overdue_30: 0, overdue_60: 0, overdue_90: 0 }
        const detail  = []

        for (const row of rows) {
            buckets[row.bucket] = (buckets[row.bucket] || 0) + Number(row.amount_due)
            detail.push({
                retailer:         row.retailer_name,
                amount_due:       Number(row.amount_due),
                days_outstanding: row.days_outstanding,
                bucket:           row.bucket,
            })
        }

        return {
            total:   Object.values(buckets).reduce((a, b) => a + b, 0),
            buckets,
            detail,
        }
    } finally {
        if (conn) conn.release()
    }
}

// ── Dispatch Status ────────────────────────────────────────────────────────────
export async function getDispatchStatus(dealerId, ref = null) {
    let conn
    try {
        conn = await pool.getConnection()

        const clauses = ['q.user_id = ?', "q.status IN ('sent','accepted')"]
        const params  = [dealerId]

        if (ref) {
            clauses.push('q.quotation_number = ?')
            params.push(String(ref).toUpperCase())
        }

        return await conn.query(
            `SELECT
                COALESCE(q.quotation_number,
                    CONCAT('KTQ-', YEAR(q.created_at), '-', LPAD(q.quotation_id, 6, '0')))
                    AS ref,
                c.customer_name,
                q.status,
                q.total_amount,
                q.created_at,
                q.updated_at
             FROM quotations q
             LEFT JOIN customers c ON c.customer_id = q.customer_id
             WHERE ${clauses.join(' AND ')}
             ORDER BY q.updated_at DESC
             LIMIT 10`,
            params
        )
    } finally {
        if (conn) conn.release()
    }
}

// ── Aging Stock Offers ─────────────────────────────────────────────────────────
export async function getAgingStockOffers(limit = 8) {
    let conn
    try {
        conn = await pool.getConnection()
        return await conn.query(
            `SELECT
                t.than_code,
                t.fabric_type,
                t.color,
                t.design,
                t.remaining_stock,
                t.selling_price,
                t.movement_speed,
                t.warehouse_location,
                t.image_url,
                p.product_name,
                p.category,
                DATEDIFF(NOW(), t.updated_at) AS days_since_movement
             FROM thans t
             LEFT JOIN products p ON p.product_id = t.product_id
             WHERE t.movement_speed IN ('slow','dead')
               AND t.remaining_stock > 0
               AND t.status = 'active'
             ORDER BY
                CASE t.movement_speed WHEN 'dead' THEN 0 ELSE 1 END,
                days_since_movement DESC
             LIMIT ?`,
            [Number(limit)]
        )
    } finally {
        if (conn) conn.release()
    }
}

/**
 * /api/dealers
 *
 * All routes are scoped to the currently logged-in user (req.user.user_id).
 * A dealer NEVER sees another dealer's data — every query filters by user_id.
 *
 * Routes:
 *   GET  /api/dealers/me             → Dealer's own retailer profile (or null if not registered yet)
 *   POST /api/dealers                → Register / update this dealer's profile
 *   GET  /api/dealers/cockpit/kpis   → 4 KPI counters for the dashboard (scoped to this user only)
 */
import { Router } from 'express';
import pool from '../db.js';
import { checkPermission } from '../middleware/checkPermission.js';
import logger from '../logger.js';

const router = Router();

// ── GET /api/dealers/me ───────────────────────────────────────────────────────
// Returns this dealer's own retailer profile.
// If the user has never registered, returns { success: true, profile: null }
// so the frontend can prompt them to fill in their details.
router.get('/me', checkPermission('VIEW_RETAILERS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();

        // assigned_user_id was added in migration_v4.sql
        // If the column doesn't exist yet (migration not run), we fall back gracefully.
        const [profile] = await conn.query(
            `SELECT retailer_id, shop_name, phone_number, market_location,
                    outstanding_balance, created_at
             FROM retailers
             WHERE assigned_user_id = ?
               AND (is_deleted = 0 OR is_deleted IS NULL)
             ORDER BY created_at ASC
             LIMIT 1`,
            [req.user.user_id]
        );

        res.json({ success: true, profile: profile || null });
    } catch (err) {
        logger.error({ err }, '[dealers] GET /me');
        // If assigned_user_id column missing (migration not run yet), return null gracefully
        if (err.code === 'ER_BAD_FIELD_ERROR') {
            return res.json({ success: true, profile: null, _migrationPending: true });
        }
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── GET /api/dealers/cockpit/kpis ─────────────────────────────────────────────
// Returns 4 real KPI numbers, all scoped to THIS dealer's user_id only.
// No cross-dealer data ever leaks.
router.get('/cockpit/kpis', checkPermission('VIEW_QUOTATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const uid = req.user.user_id;

        // All counts come from quotations WHERE user_id = uid — already isolated per dealer
        const [[kpis]] = await conn.query(`
            SELECT
              COUNT(*)                                              AS total_quotations,
              SUM(status IN ('draft','pending'))                    AS draft_count,
              SUM(status = 'sent')                                  AS sent_count,
              SUM(status = 'accepted')                              AS accepted_count,
              SUM(status = 'declined')                              AS declined_count,
              COALESCE(SUM(CASE WHEN status = 'accepted'
                               THEN total_amount END), 0)           AS total_accepted_value
            FROM quotations
            WHERE user_id = ?`, [uid]);

        res.json({ success: true, kpis });
    } catch (err) {
        logger.error({ err }, '[dealers] GET /cockpit/kpis');
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── POST /api/dealers ─────────────────────────────────────────────────────────
// Register or update this dealer's own retailer profile.
// Body: { company_name, contact_number, address }
// Creates a retailers row linked to this user if none exists; updates if it does.
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
               AND (is_deleted = 0 OR is_deleted IS NULL)
             LIMIT 1`,
            [req.user.user_id]
        );

        if (existing) {
            await conn.query(
                `UPDATE retailers
                 SET shop_name        = COALESCE(?, shop_name),
                     phone_number     = COALESCE(?, phone_number),
                     market_location  = COALESCE(?, market_location),
                     updated_at       = NOW()
                 WHERE retailer_id = ?`,
                [
                    company_name.trim(),
                    contact_number?.trim() || null,
                    address?.trim() || null,
                    existing.retailer_id
                ]
            );
            return res.json({ success: true, retailer_id: existing.retailer_id, action: 'updated' });
        }

        // New registration — link to this user
        const result = await conn.query(
            `INSERT INTO retailers
               (shop_name, phone_number, market_location, assigned_user_id)
             VALUES (?, ?, ?, ?)`,
            [
                company_name.trim(),
                contact_number?.trim() || null,
                address?.trim() || null,
                req.user.user_id
            ]
        );
        res.status(201).json({
            success: true,
            retailer_id: Number(result.insertId),
            action: 'created'
        });
    } catch (err) {
        logger.error({ err }, '[dealers] POST /');
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

export default router;

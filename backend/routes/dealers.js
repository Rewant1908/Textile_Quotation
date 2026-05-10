/**
 * /api/dealers
 *
 * GET  /api/dealers/me   → Returns the retailer profile linked to the logged-in user.
 *                          Creates a stub profile if none exists yet.
 * POST /api/dealers      → Upsert dealer profile (company_name, contact_number, address).
 *
 * Uses VIEW_RETAILERS / CREATE_RETAILER permissions (already granted to 'dealer' + 'user' roles).
 */
import { Router } from 'express';
import pool from '../db.js';
import { checkPermission } from '../middleware/checkPermission.js';
import logger from '../logger.js';

const router = Router();

// ── GET /api/dealers/me ───────────────────────────────────────────────────────
router.get('/me', checkPermission('VIEW_RETAILERS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const [profile] = await conn.query(
            `SELECT retailer_id, shop_name, contact_person, phone, market_location, notes, created_at
             FROM retailers
             WHERE assigned_user_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
             ORDER BY created_at ASC
             LIMIT 1`,
            [req.user.user_id]
        );
        if (profile) return res.json({ success: true, profile });

        // No profile yet — return empty placeholder (frontend can prompt to register)
        res.json({ success: true, profile: null });
    } catch (err) {
        logger.error({ err }, '[dealers] GET /me');
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── POST /api/dealers ─────────────────────────────────────────────────────────
// Body: { company_name, contact_number, address }
// Creates a retailer row linked to the current user if one doesn't exist;
// updates it if it does.
router.post('/', checkPermission('CREATE_RETAILER'), async (req, res) => {
    const { company_name, contact_number, address } = req.body;
    if (!company_name?.trim())
        return res.status(400).json({ error: 'company_name is required' });

    let conn;
    try {
        conn = await pool.getConnection();

        const [existing] = await conn.query(
            `SELECT retailer_id FROM retailers
             WHERE assigned_user_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
             LIMIT 1`,
            [req.user.user_id]
        );

        if (existing) {
            // Update
            await conn.query(
                `UPDATE retailers
                 SET shop_name       = COALESCE(?, shop_name),
                     phone           = COALESCE(?, phone),
                     market_location = COALESCE(?, market_location)
                 WHERE retailer_id = ?`,
                [company_name.trim(), contact_number?.trim() || null, address?.trim() || null, existing.retailer_id]
            );
            return res.json({ success: true, retailer_id: existing.retailer_id, action: 'updated' });
        }

        // Insert
        const result = await conn.query(
            `INSERT INTO retailers (shop_name, phone, market_location, assigned_user_id)
             VALUES (?, ?, ?, ?)`,
            [company_name.trim(), contact_number?.trim() || null, address?.trim() || null, req.user.user_id]
        );
        res.status(201).json({ success: true, retailer_id: Number(result.insertId), action: 'created' });
    } catch (err) {
        logger.error({ err }, '[dealers] POST /');
        res.status(500).json({ success: false, error: err.message });
    } finally { if (conn) conn.release(); }
});

export default router;

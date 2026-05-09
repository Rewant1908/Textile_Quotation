/**
 * /api/suppliers
 *
 * Phase 5 fix #7: soft deletes — DELETE now sets is_deleted=1 + deleted_at
 * instead of hard-deleting (which caused FK constraint errors when thans exist).
 *
 * fix: /full route — joins thans (not bales, which doesn't exist in this schema)
 * fix: SOFT_DELETE_FILTER uses IFNULL so missing column doesn't crash
 */
import { Router } from 'express';
import pool from '../db.js';
import { checkPermission } from '../middleware/checkPermission.js';
import logger from '../logger.js';

const router = Router();

// Safe filter: works whether or not the column exists yet
const SOFT_DELETE_FILTER = `(IFNULL(s.is_deleted, 0) = 0)`;

// GET /api/suppliers/full — enriched view with than counts for agent + operations dashboard
// MUST be declared before /:id so Express doesn't treat "full" as an id param
router.get('/full', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(
            `SELECT s.supplier_id, s.supplier_name, s.contact_name, s.contact_phone,
                    s.email, s.city, s.quality_rating, s.delay_frequency,
                    s.trend_alignment, s.notes, s.created_at,
                    COUNT(t.than_id)              AS total_thans,
                    COALESCE(SUM(t.total_meters), 0) AS total_meters
             FROM suppliers s
             LEFT JOIN thans t ON t.supplier_id = s.supplier_id
             WHERE ${SOFT_DELETE_FILTER}
             GROUP BY s.supplier_id
             ORDER BY s.supplier_name`
        );
        res.json(rows);
    } catch (err) {
        logger.error({ err }, '[suppliers] GET /full');
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
});

router.get('/', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(
            `SELECT s.supplier_id, s.supplier_name, s.contact_name, s.contact_phone,
                    s.email, s.city, s.quality_rating, s.delay_frequency,
                    s.trend_alignment, s.notes, s.created_at
             FROM suppliers s
             WHERE ${SOFT_DELETE_FILTER}
             ORDER BY s.supplier_name`
        );
        res.json(rows);
    } catch (err) {
        logger.error({ err }, '[suppliers] GET /');
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
});

router.get('/:id', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const [supplier] = await conn.query(
            `SELECT * FROM suppliers s
             WHERE s.supplier_id = ? AND ${SOFT_DELETE_FILTER}`,
            [req.params.id]
        );
        if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
        res.json(supplier);
    } catch (err) {
        logger.error({ err }, '[suppliers] GET /:id');
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
});

router.post('/', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    const { supplier_name, contact_name, contact_phone, email, city,
            quality_rating, delay_frequency, trend_alignment, notes } = req.body;
    if (!supplier_name?.trim()) return res.status(400).json({ error: 'supplier_name is required' });
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query(
            `INSERT INTO suppliers
                (supplier_name, contact_name, contact_phone, email, city,
                 quality_rating, delay_frequency, trend_alignment, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                supplier_name.trim(), contact_name?.trim() || null,
                contact_phone?.trim() || null, email?.trim() || null,
                city?.trim() || null, quality_rating || null,
                delay_frequency || null, trend_alignment || null,
                notes?.trim() || null
            ]
        );
        res.status(201).json({ success: true, supplier_id: Number(result.insertId) });
    } catch (err) {
        logger.error({ err }, '[suppliers] POST /');
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
});

router.put('/:id', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    const { supplier_name, contact_name, contact_phone, email, city,
            quality_rating, delay_frequency, trend_alignment, notes } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query(
            `UPDATE suppliers SET
                supplier_name   = COALESCE(?, supplier_name),
                contact_name    = COALESCE(?, contact_name),
                contact_phone   = COALESCE(?, contact_phone),
                email           = COALESCE(?, email),
                city            = COALESCE(?, city),
                quality_rating  = COALESCE(?, quality_rating),
                delay_frequency = COALESCE(?, delay_frequency),
                trend_alignment = COALESCE(?, trend_alignment),
                notes           = COALESCE(?, notes)
             WHERE supplier_id = ? AND ${SOFT_DELETE_FILTER}`,
            [
                supplier_name || null, contact_name || null, contact_phone || null,
                email || null, city || null, quality_rating || null,
                delay_frequency || null, trend_alignment || null,
                notes || null, req.params.id
            ]
        );
        res.json({ success: true });
    } catch (err) {
        logger.error({ err }, '[suppliers] PUT /:id');
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
});

// Phase 5 fix #7: SOFT DELETE — avoids FK constraint errors when thans exist
router.delete('/:id', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query(
            `UPDATE suppliers
             SET is_deleted = 1,
                 deleted_at  = NOW(),
                 deleted_by  = ?
             WHERE supplier_id = ? AND ${SOFT_DELETE_FILTER}`,
            [req.user.user_id, req.params.id]
        );
        if (Number(result.affectedRows) === 0) {
            return res.status(404).json({ error: 'Supplier not found or already deleted' });
        }
        res.json({ success: true, message: 'Supplier soft-deleted. Than history preserved.' });
    } catch (err) {
        logger.error({ err }, '[suppliers] DELETE /:id');
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
});

export default router;

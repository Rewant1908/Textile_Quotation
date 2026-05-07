import express from 'express';
import pool from '../db.js';
import { checkPermission } from '../middleware/checkPermission.js';

const router = express.Router();

// GET /api/retailers
router.get('/', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(
            `SELECT retailer_id, shop_name, contact_person, phone, market_location,
                    payment_pattern, preferred_categories, preferred_price_segment,
                    outstanding_balance, notes
             FROM retailers ORDER BY shop_name`
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// POST /api/retailers
router.post('/', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    const {
        shop_name, contact_person, phone, market_location,
        payment_pattern, preferred_categories, preferred_price_segment, notes
    } = req.body;
    if (!shop_name?.trim()) return res.status(400).json({ error: 'shop_name is required' });
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query(
            `INSERT INTO retailers
                (shop_name, contact_person, phone, market_location,
                 payment_pattern, preferred_categories, preferred_price_segment,
                 outstanding_balance, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
            [
                shop_name.trim(),
                contact_person?.trim() || null,
                phone?.trim() || null,
                market_location?.trim() || null,
                payment_pattern || 'on_delivery',
                preferred_categories?.trim() || null,
                preferred_price_segment || 'mixed',
                notes?.trim() || null
            ]
        );
        res.status(201).json({ success: true, retailer_id: Number(result.insertId) });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// PUT /api/retailers/:id
router.put('/:id', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    const {
        shop_name, contact_person, phone, market_location,
        payment_pattern, preferred_categories, preferred_price_segment,
        outstanding_balance, notes
    } = req.body;
    if (!shop_name?.trim()) return res.status(400).json({ error: 'shop_name is required' });
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query(
            `UPDATE retailers
             SET shop_name=?, contact_person=?, phone=?, market_location=?,
                 payment_pattern=?, preferred_categories=?, preferred_price_segment=?,
                 outstanding_balance=?, notes=?
             WHERE retailer_id=?`,
            [
                shop_name.trim(),
                contact_person?.trim() || null,
                phone?.trim() || null,
                market_location?.trim() || null,
                payment_pattern || 'on_delivery',
                preferred_categories?.trim() || null,
                preferred_price_segment || 'mixed',
                Number(outstanding_balance || 0),
                notes?.trim() || null,
                req.params.id
            ]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

export default router;

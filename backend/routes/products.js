import express from 'express';
import pool from '../db.js';
import { checkPermission } from '../middleware/checkPermission.js';

const router = express.Router();

// ── GET /api/products ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(
            'SELECT product_id, product_name, category, base_price FROM products'
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// ── POST /api/products ────────────────────────────────────────────────────────
router.post('/', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    const { product_name, category, base_price } = req.body;
    if (!product_name || !category || !base_price)
        return res.status(400).json({ error: 'All fields required' });
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query(
            'INSERT INTO products (product_name, category, base_price) VALUES (?, ?, ?)',
            [product_name.trim(), category.trim(), base_price]
        );
        res.status(201).json({ success: true, product_id: Number(result.insertId) });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// ── PUT /api/products/:id ─────────────────────────────────────────────────────
router.put('/:id', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    const { product_name, category, base_price } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query(
            'UPDATE products SET product_name = ?, category = ?, base_price = ? WHERE product_id = ?',
            [product_name, category, base_price, req.params.id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// ── DELETE /api/products/:id ──────────────────────────────────────────────────
router.delete('/:id', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query('DELETE FROM products WHERE product_id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

export default router;

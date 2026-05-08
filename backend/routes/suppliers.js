import express from 'express';
import pool from '../db.js';

const router = express.Router();

// ── GET /api/suppliers ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(
            'SELECT supplier_id, supplier_name, factory_name FROM suppliers ORDER BY supplier_name'
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

export default router;

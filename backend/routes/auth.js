import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';

const router     = express.Router();
const JWT_SECRET  = process.env.JWT_SECRET   || 'CHANGE_ME_IN_PRODUCTION';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '8h';
const SALT_ROUNDS = 10;
const emailRegex  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── POST /api/signup ──────────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
    const { username, password, email } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    if (password.length < 4)   return res.status(400).json({ error: 'Password must be at least 4 characters' });
    if (email && !emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email format' });
    let conn;
    try {
        conn = await pool.getConnection();
        const [existing] = await conn.query('SELECT user_id FROM users WHERE username = ?', [username]);
        if (existing) return res.status(409).json({ error: 'Username already taken' });
        if (email) {
            const [emailExists] = await conn.query('SELECT user_id FROM users WHERE email = ?', [email]);
            if (emailExists) return res.status(409).json({ error: 'Email already registered' });
        }
        const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
        const result = await conn.query(
            'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)',
            [username, password_hash, email || null, 'user']
        );
        res.status(201).json({ success: true, user_id: Number(result.insertId) });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// ── POST /api/login ───────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    let conn;
    try {
        conn = await pool.getConnection();
        const [user] = await conn.query(
            'SELECT user_id, username, password, role FROM users WHERE username = ?', [username]
        );
        if (!user) return res.status(401).json({ error: 'Invalid username or password' });
        const hash  = Buffer.isBuffer(user.password) ? user.password.toString() : String(user.password);
        const match = await bcrypt.compare(password, hash);
        if (!match) return res.status(401).json({ error: 'Invalid username or password' });

        const token = jwt.sign(
            { user_id: user.user_id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES }
        );
        res.json({ success: true, token, user_id: user.user_id, username: user.username, role: user.role });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

export default router;

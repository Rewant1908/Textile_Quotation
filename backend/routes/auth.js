// routes/auth.js — authentication routes
// POST /api/signup
// POST /api/login
// POST /api/forgot-password   — Phase 4 Issue 5: password reset request stub
// POST /api/reset-password    — Phase 4 Issue 5: password reset execution stub
//
// The forgot/reset routes are production-ready stubs:
//   - Token is generated and stored in DB (requires password_resets table — see DEPLOYMENT.md)
//   - Email send is a no-op stub: replace the TODO block with your email provider
//     (Resend, Nodemailer, SendGrid) without changing any other code.
//   - reset-password validates the token, checks expiry, and updates the hash.
//
// Rate limiting is applied at server.js mount level (authLimiter: 10 req/min).

import express  from 'express';
import bcrypt   from 'bcrypt';
import jwt      from 'jsonwebtoken';
import crypto   from 'crypto';
import pool     from '../db.js';
import logger   from '../logger.js';

const router      = express.Router();
const JWT_SECRET  = process.env.JWT_SECRET    || 'CHANGE_ME_IN_PRODUCTION';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '8h';
const SALT_ROUNDS = 10;
const emailRegex  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Reset token TTL: 1 hour
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

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
        logger.info({ username, user_id: Number(result.insertId) }, 'New user registered');
        res.status(201).json({ success: true, user_id: Number(result.insertId) });
    } catch (err) {
        logger.error({ err: err.message, username }, 'Signup failed');
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
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
        logger.info({ username, user_id: user.user_id, role: user.role }, 'User logged in');
        res.json({ success: true, token, user_id: user.user_id, username: user.username, role: user.role });
    } catch (err) {
        logger.error({ err: err.message, username }, 'Login failed');
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── POST /api/forgot-password ─────────────────────────────────────────────────
// Issue 5: password reset request.
// Generates a secure token, stores it in password_resets table, and
// (stub) would send an email with the reset link.
//
// Always returns 200 regardless of whether email exists (prevents user enumeration).
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email || !emailRegex.test(email))
        return res.status(400).json({ error: 'Valid email required' });

    let conn;
    try {
        conn = await pool.getConnection();
        const [user] = await conn.query(
            'SELECT user_id, username FROM users WHERE email = ?', [email]
        );

        // Always respond 200 — never reveal whether email is registered
        if (!user) {
            logger.info({ email }, 'forgot-password: email not found (silent)');
            return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
        }

        // Generate a cryptographically secure token
        const token     = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

        // Store token — requires password_resets table (see DEPLOYMENT.md for migration)
        await conn.query(
            `INSERT INTO password_resets (user_id, token, expires_at)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE token = VALUES(token), expires_at = VALUES(expires_at)`,
            [user.user_id, token, expiresAt]
        );

        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;

        // ── TODO: replace this block with your email provider ──────────────────
        // Example with Resend (already used in this project):
        //
        // import { Resend } from 'resend'
        // const resend = new Resend(process.env.RESEND_API_KEY)
        // await resend.emails.send({
        //   from:    'KT Impex <no-reply@ktimpex.com>',
        //   to:      email,
        //   subject: 'Reset your KT Impex password',
        //   html:    `<p>Click to reset: <a href="${resetUrl}">${resetUrl}</a></p><p>Expires in 1 hour.</p>`,
        // })
        // ── END TODO ────────────────────────────────────────────────────────────

        logger.info({ email, user_id: user.user_id, resetUrl }, 'Password reset token generated (email stub)');
        res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    } catch (err) {
        logger.error({ err: err.message, email }, 'forgot-password failed');
        res.status(500).json({ error: 'Internal server error' });
    } finally { if (conn) conn.release(); }
});

// ── POST /api/reset-password ──────────────────────────────────────────────────
// Issue 5: password reset execution.
// Validates token, checks expiry, updates password hash.
router.post('/reset-password', async (req, res) => {
    const { token, password } = req.body;
    if (!token)                  return res.status(400).json({ error: 'token required' });
    if (!password || password.length < 4)
        return res.status(400).json({ error: 'New password must be at least 4 characters' });

    let conn;
    try {
        conn = await pool.getConnection();
        const [reset] = await conn.query(
            'SELECT user_id, expires_at FROM password_resets WHERE token = ?', [token]
        );

        if (!reset)                          return res.status(400).json({ error: 'Invalid or expired reset token' });
        if (new Date(reset.expires_at) < new Date()) {
            await conn.query('DELETE FROM password_resets WHERE token = ?', [token]);
            return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
        }

        const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
        await conn.query('UPDATE users SET password = ? WHERE user_id = ?', [password_hash, reset.user_id]);
        await conn.query('DELETE FROM password_resets WHERE token = ?', [token]);

        logger.info({ user_id: reset.user_id }, 'Password reset successful');
        res.json({ success: true, message: 'Password updated. You can now log in.' });
    } catch (err) {
        logger.error({ err: err.message }, 'reset-password failed');
        res.status(500).json({ error: 'Internal server error' });
    } finally { if (conn) conn.release(); }
});

export default router;

// server.js — KT IMPEX backend bootstrap
// Phase 4 fix: added rate limiting (express-rate-limit) and structured logging (pino).
// All console.log / console.error replaced with logger calls.

import express        from 'express';
import cors           from 'cors';
import rateLimit      from 'express-rate-limit';
import pool           from './db.js';
import { isReady }    from './cache.js';
import { checkPermission } from './middleware/checkPermission.js';
import { flush }      from './cache.js';
import { recalculateSpeeds } from './routes/operations.js';
import logger         from './logger.js';

// ── Route modules ──────────────────────────────────────────────────────────────
import authRoutes        from './routes/auth.js';
import productRoutes     from './routes/products.js';
import supplierRoutes    from './routes/suppliers.js';
import baleRoutes        from './routes/bales.js';
import operationsRoutes  from './routes/operations.js';
import retailerRoutes    from './routes/retailers.js';
import salesRoutes       from './routes/sales.js';
import agentRoutes       from './routes/agents.js';
import analyticsRoutes   from './routes/analytics.js';
import quotationRoutes   from './routes/quotations.js';

const app = express();

// ─── Make pool available to routes that need it (e.g. agents memory manager)
app.locals.db = pool;

// ─── CORS ─────────────────────────────────────────────────────────────────────
// ALLOWED_ORIGIN env var must be set in Railway to your frontend URL.
// Supports comma-separated list: https://foo.up.railway.app,https://bar.up.railway.app
const envOrigins = process.env.ALLOWED_ORIGIN
    ? process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim()).filter(Boolean)
    : [];

const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5500',
    ...envOrigins,
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin '${origin}' is not allowed. Add it to ALLOWED_ORIGIN env var.`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
}));

app.use(express.json());

// ─── RATE LIMITING (Issue 3) ───────────────────────────────────────────────────
// Global limiter: 200 requests per minute per IP.
// Agent limiter:  20  requests per minute per IP (Gemini API cost protection).
// Auth limiter:   10  requests per minute per IP (brute-force protection).
//
// All limits are configurable via env vars so Railway can tune without deploys.
const globalLimiter = rateLimit({
    windowMs:    60 * 1000,
    max:         parseInt(process.env.RATE_LIMIT_GLOBAL  || '200', 10),
    standardHeaders: true,
    legacyHeaders:   false,
    message: { error: 'Too many requests — please slow down.' },
});

const agentLimiter = rateLimit({
    windowMs:    60 * 1000,
    max:         parseInt(process.env.RATE_LIMIT_AGENTS  || '20', 10),
    standardHeaders: true,
    legacyHeaders:   false,
    message: { error: 'Agent rate limit reached — wait 60 seconds before retrying.' },
    skip: (req) => req.user?.role === 'admin', // admins bypass agent limit
});

const authLimiter = rateLimit({
    windowMs:    60 * 1000,
    max:         parseInt(process.env.RATE_LIMIT_AUTH    || '10', 10),
    standardHeaders: true,
    legacyHeaders:   false,
    message: { error: 'Too many login attempts — please wait 60 seconds.' },
});

// Apply global limiter to all routes
app.use(globalLimiter);

// ─── MOUNT ROUTES ─────────────────────────────────────────────────────────────
app.use('/api',              authLimiter, authRoutes);    // POST /api/signup, /api/login, /api/forgot-password
app.use('/api/products',     productRoutes);
app.use('/api/suppliers',    supplierRoutes);
app.use('/api/bales',        baleRoutes);
app.use('/api/operations',   operationsRoutes);
app.use('/api',              operationsRoutes);           // /api/thans, /api/inventory/search, /api/admin/*
app.use('/api/retailers',    retailerRoutes);
app.use('/api/transactions',  salesRoutes);
app.use('/api/agents',       agentLimiter, agentRoutes); // strict limit — each call hits Gemini
app.use('/api/analytics',    analyticsRoutes);
app.use('/api/quotations',   quotationRoutes);

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const [db] = await conn.query('SELECT DATABASE() AS database_name');
        res.json({ api: 'ok', database: 'connected', database_name: db?.database_name || null });
    } catch (err) {
        res.status(503).json({ api: 'ok', database: 'disconnected', error: err.code || err.message });
    } finally { if (conn) conn.release(); }
});

// ─── CACHE STATUS (admin debug) ───────────────────────────────────────────────
app.get('/api/cache/status', checkPermission('VIEW_OPERATIONS'), (req, res) => {
    res.json({
        redis: isReady() ? 'connected' : 'unavailable',
        cache_enabled: process.env.CACHE_ENABLED !== 'false'
    });
});

// ─── CRON: recalculate movement speeds every 24h ──────────────────────────────
setInterval(async () => {
    try {
        const updated = await recalculateSpeeds();
        flush('thans:*').catch(() => {});
        flush('dashboard').catch(() => {});
        logger.info({ updated }, '[cron] movement_speed recalculated');
    } catch (err) {
        logger.error({ err: err.message }, '[cron] recalculateSpeeds failed');
    }
}, 24 * 60 * 60 * 1000);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    logger.info({ port: PORT, origins: allowedOrigins }, 'KT IMPEX API started');
});

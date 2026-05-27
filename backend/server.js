/**
 * server.js — KT IMPEX API entry point
 *
 * Phase 7:  /api/admin/settings route registered
 * Phase 8:  /api/whatsapp route registered + rawBody middleware for Meta signature verification
 * Phase 9:  /api/dealers route registered (dealer profile endpoints)
 * Fix: dotenv is loaded via --import ./load-env.js (see package.json start script)
 *      so all process.env vars are available before any ES module import runs.
 *
 * rawBody fix: captured via express.json({ verify }) so the stream is only consumed
 * once. The previous approach (manual stream listener before express.json) drained
 * the body stream before express.json could parse it, leaving req.body undefined.
 */
import express       from 'express';
import cors          from 'cors';
import helmet        from 'helmet';
import rateLimit     from 'express-rate-limit';
import logger        from './logger.js';
import pool          from './db.js';

// ── Routes ────────────────────────────────────────────────────────────────
import authRouter       from './routes/auth.js';
import operationsRouter from './routes/operations.js';
import salesRouter      from './routes/sales.js';
import retailersRouter  from './routes/retailers.js';
import suppliersRouter  from './routes/suppliers.js';
import productsRouter   from './routes/products.js';
import agentRouter      from './routes/agents.js';
import settingsRouter   from './routes/settings.js';
import analyticsRouter  from './routes/analytics.js';
import balesRouter      from './routes/bales.js';
import quotationsRouter from './routes/quotations.js';
import whatsappRouter   from './routes/whatsapp.js';
import dealersRouter    from './routes/dealers.js';
import agentChatRouter  from './routes/agentChat.js';

// ── App ───────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 5000;

// ── Security ───────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));

// ── Body parsing ───────────────────────────────────────────────────────
app.use(express.json({
    limit: '2mb',
    verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));

// ── CORS ───────────────────────────────────────────────────────────────────
const ALLOWED = [
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'http://localhost:5174', 'http://127.0.0.1:5174',
    'http://localhost:3000', 'http://127.0.0.1:3000',
    'http://127.0.0.1:5500',
];
app.use(cors({
    origin: (origin, cb) => (!origin || ALLOWED.includes(origin) ? cb(null, true) : cb(new Error('CORS'))),
    credentials: true,
}));

// ── Rate limiting ───────────────────────────────────────────────────────────
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }));

// ── Mount routes ─────────────────────────────────────────────────────────────
app.use('/api/auth',                   authRouter);
app.use('/api/analytics',              analyticsRouter);
app.use('/api/bales',                  balesRouter);
app.use('/api/quotations',             quotationsRouter);
app.use('/api/transactions',           salesRouter);
app.use('/api/retailers',              retailersRouter);
app.use('/api/suppliers',              suppliersRouter);
app.use('/api/products',               productsRouter);
app.use('/api/agents',                 agentRouter);
app.use('/api/admin/settings',         settingsRouter);
app.use('/api/admin',                  operationsRouter);
app.use('/api/operations',             operationsRouter);
app.use('/api/thans',                  operationsRouter);
app.use('/api/inventory',              operationsRouter);
app.use('/api/whatsapp',               whatsappRouter);
app.use('/webhooks/whatsapp',          whatsappRouter);
app.use('/api/dealers',                dealersRouter);  // Phase 9
app.use('/api/agents/user-chat',       agentChatRouter);

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Global error handler ──────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error' });
});

// ── Start ───────────────────────────────────────────────────────────────────
async function start() {
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query('SELECT 1');
    } finally { if (conn) conn.release(); }

    app.listen(PORT, () => {
        logger.info({ port: String(PORT), origins: ALLOWED }, 'KT IMPEX API started');
    });

    // ── Crons ─────────────────────────────────────────────────────────────
    const { recalculateSpeeds } = await import('./routes/operations.js');
    const { flush }             = await import('./cache.js');

    setInterval(async () => {
        try {
            const n = await recalculateSpeeds();
            await flush('thans:*');
            await flush('dashboard');
            logger.info({ updated: n }, '[cron] movement speeds recalculated');
        } catch (err) {
            logger.error({ err }, '[cron] recalculateSpeeds failed');
        }
    }, 24 * 60 * 60 * 1000);
}

start().catch(err => { logger.error({ err }, 'Fatal startup error'); process.exit(1); });

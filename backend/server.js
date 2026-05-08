import express from 'express';
import cors from 'cors';
import pool from './db.js';
import { isReady } from './cache.js';
import { checkPermission } from './middleware/checkPermission.js';
import { flush } from './cache.js';
import { recalculateSpeeds } from './routes/operations.js';

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

const app = express();

// ─── Make pool available to routes that need it (e.g. agents memory manager)
app.locals.db = pool;

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5174',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5500'
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true
}));

app.use(express.json());

// ─── MOUNT ROUTES ─────────────────────────────────────────────────────────────
app.use('/api',              authRoutes);        // POST /api/signup, POST /api/login
app.use('/api/products',     productRoutes);     // CRUD /api/products
app.use('/api/suppliers',    supplierRoutes);    // GET  /api/suppliers
app.use('/api/bales',        baleRoutes);        // CRUD /api/bales + /api/bales/:id/thans
app.use('/api',              operationsRoutes);  // GET  /api/thans, /api/operations/dashboard, /api/inventory/search, /api/admin/recalculate-speeds
app.use('/api/retailers',    retailerRoutes);    // CRUD /api/retailers
app.use('/api/transactions',  salesRoutes);      // CRUD /api/transactions
app.use('/api/agents',       agentRoutes);       // POST /api/agents/chat
app.use('/api/analytics',    analyticsRoutes);   // GET  /api/analytics/top-retailers, /api/analytics/margin-per-supplier

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
        console.log(`[cron] movement_speed recalculated — ${updated} thans updated`);
    } catch (err) {
        console.error('[cron] recalculateSpeeds failed:', err.message);
    }
}, 24 * 60 * 60 * 1000);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

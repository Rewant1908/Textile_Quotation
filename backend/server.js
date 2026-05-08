import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import pool from './db.js';
import { checkPermission } from './middleware/checkPermission.js';
import retailerRoutes from './routes/retailers.js';
import salesRoutes from './routes/sales.js';
import agentRoutes from './routes/agents.js';

const app = express();

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

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.use('/api/agents', agentRoutes);
app.use('/api/retailers', retailerRoutes);
app.use('/api/transactions', salesRoutes);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SALT_ROUNDS = 10;

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

// ─── AUTH: SIGNUP ─────────────────────────────────────────────────────────────
app.post('/api/signup', async (req, res) => {
    const { username, password, email } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
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

// ─── AUTH: LOGIN ──────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    let conn;
    try {
        conn = await pool.getConnection();
        const [user] = await conn.query(
            'SELECT user_id, username, password, role FROM users WHERE username = ?', [username]
        );
        if (!user) return res.status(401).json({ error: 'Invalid username or password' });
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Invalid username or password' });
        res.json({ success: true, user_id: user.user_id, username: user.username, role: user.role });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
app.get('/api/products', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query('SELECT product_id, product_name, category, base_price FROM products');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

app.post('/api/products', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
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

app.put('/api/products/:id', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
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

app.delete('/api/products/:id', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query('DELETE FROM products WHERE product_id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// ─── SUPPLIERS ────────────────────────────────────────────────────────────────
app.get('/api/suppliers', async (req, res) => {
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

// ─── BALES ────────────────────────────────────────────────────────────────────
app.post('/api/bales', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    const {
        bale_code, supplier_id, factory_name, arrival_date,
        purchase_cost, transport_cost, total_rolls,
        fabric_category, purchase_invoice
    } = req.body;

    if (!bale_code || !arrival_date || !purchase_cost || !total_rolls || !fabric_category)
        return res.status(400).json({ error: 'bale_code, arrival_date, purchase_cost, total_rolls, fabric_category are required' });
    if (Number(purchase_cost) < 0 || Number(transport_cost || 0) < 0)
        return res.status(400).json({ error: 'Costs cannot be negative' });
    if (!Number.isInteger(Number(total_rolls)) || Number(total_rolls) < 1)
        return res.status(400).json({ error: 'total_rolls must be a positive integer' });

    let conn;
    try {
        conn = await pool.getConnection();
        const [existing] = await conn.query('SELECT bale_id FROM bales WHERE bale_code = ?', [bale_code.trim()]);
        if (existing) return res.status(409).json({ error: 'Bale code already exists' });

        const result = await conn.query(
            `INSERT INTO bales
                (bale_code, supplier_id, factory_name, arrival_date, purchase_cost,
                 transport_cost, total_rolls, fabric_category, purchase_invoice, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'received')`,
            [
                bale_code.trim(), supplier_id || null, factory_name?.trim() || null,
                arrival_date, Number(purchase_cost), Number(transport_cost || 0),
                Number(total_rolls), fabric_category.trim(), purchase_invoice?.trim() || null
            ]
        );
        res.status(201).json({ success: true, bale_id: Number(result.insertId) });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

app.get('/api/bales', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(
            `SELECT b.bale_id, b.bale_code, b.arrival_date, b.fabric_category,
                    b.purchase_cost, b.transport_cost, b.total_rolls, b.status,
                    b.purchase_invoice,
                    s.supplier_name,
                    COALESCE(b.factory_name, s.factory_name) AS factory_name,
                    COUNT(t.than_id) AS thans_created,
                    COALESCE(SUM(t.remaining_stock), 0) AS total_remaining
             FROM bales b
             LEFT JOIN suppliers s ON b.supplier_id = s.supplier_id
             LEFT JOIN thans t ON t.bale_id = b.bale_id
             GROUP BY
                b.bale_id, b.bale_code, b.arrival_date, b.fabric_category,
                b.purchase_cost, b.transport_cost, b.total_rolls, b.status,
                b.purchase_invoice, s.supplier_name, b.factory_name
             ORDER BY b.arrival_date DESC, b.bale_id DESC`
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

app.get('/api/bales/:id', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
    const baleId = Number(req.params.id);
    if (!Number.isInteger(baleId) || baleId <= 0)
        return res.status(400).json({ error: 'Invalid bale ID' });
    let conn;
    try {
        conn = await pool.getConnection();
        const [bale] = await conn.query(
            `SELECT b.*, s.supplier_name,
                    COALESCE(b.factory_name, s.factory_name) AS resolved_factory
             FROM bales b
             LEFT JOIN suppliers s ON b.supplier_id = s.supplier_id
             WHERE b.bale_id = ?`,
            [baleId]
        );
        if (!bale) return res.status(404).json({ error: 'Bale not found' });
        res.json(bale);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

app.post('/api/bales/:id/thans', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    const baleId = Number(req.params.id);
    if (!Number.isInteger(baleId) || baleId <= 0)
        return res.status(400).json({ error: 'Invalid bale ID' });

    const { thans } = req.body;
    if (!Array.isArray(thans) || thans.length === 0)
        return res.status(400).json({ error: 'thans array is required and must not be empty' });

    for (let i = 0; i < thans.length; i++) {
        const t = thans[i];
        if (!t.than_code || !t.fabric_type)
            return res.status(400).json({ error: `Row ${i + 1}: than_code and fabric_type are required` });
        if (!t.cost_per_meter || Number(t.cost_per_meter) <= 0)
            return res.status(400).json({ error: `Row ${i + 1}: cost_per_meter must be > 0` });
        if (!t.selling_price || Number(t.selling_price) <= 0)
            return res.status(400).json({ error: `Row ${i + 1}: selling_price must be > 0` });
        if (!t.meter_length || Number(t.meter_length) <= 0)
            return res.status(400).json({ error: `Row ${i + 1}: meter_length must be > 0` });
        if (Number(t.selling_price) < Number(t.cost_per_meter))
            return res.status(400).json({
                error: `Row ${i + 1}: selling_price (${t.selling_price}) is below cost (${t.cost_per_meter}) — please confirm`
            });
    }

    let conn;
    try {
        conn = await pool.getConnection();
        const [bale] = await conn.query('SELECT bale_id, status FROM bales WHERE bale_id = ?', [baleId]);
        if (!bale) return res.status(404).json({ error: 'Bale not found' });

        await conn.beginTransaction();

        const insertedIds = [];
        for (const t of thans) {
            const [dup] = await conn.query('SELECT than_id FROM thans WHERE than_code = ?', [t.than_code.trim()]);
            if (dup) {
                await conn.rollback();
                return res.status(409).json({ error: `than_code "${t.than_code}" already exists — rolled back` });
            }

            const meterLength = Number(t.meter_length);
            const result = await conn.query(
                `INSERT INTO thans
                    (than_code, bale_id, product_id, fabric_type, color, design, gsm,
                     meter_length, cost_per_meter, selling_price, remaining_stock,
                     warehouse_location, movement_speed, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 'available')`,
                [
                    t.than_code.trim(), baleId, t.product_id || null,
                    t.fabric_type.trim(), t.color?.trim() || null, t.design?.trim() || null,
                    t.gsm ? Number(t.gsm) : null, meterLength,
                    Number(t.cost_per_meter), Number(t.selling_price), meterLength,
                    t.warehouse_location?.trim() || null
                ]
            );
            const thanId = Number(result.insertId);
            insertedIds.push(thanId);

            await conn.query(
                `INSERT INTO inventory_movements
                    (than_id, movement_type, quantity, from_location, to_location,
                     reference_type, reference_id, notes, movement_date)
                 VALUES (?, 'stock_in', ?, NULL, ?, 'bale', ?, ?, current_timestamp())`,
                [thanId, meterLength, t.warehouse_location?.trim() || null, baleId, `Breakdown from bale ${baleId}`]
            );
        }

        await conn.query(
            `UPDATE bales SET status = 'opened' WHERE bale_id = ? AND status = 'received'`,
            [baleId]
        );

        await conn.commit();
        res.status(201).json({ success: true, inserted: insertedIds.length, than_ids: insertedIds });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
});

app.get('/api/bales/:id/thans', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
    const baleId = Number(req.params.id);
    if (!Number.isInteger(baleId) || baleId <= 0)
        return res.status(400).json({ error: 'Invalid bale ID' });
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(
            `SELECT t.than_id, t.than_code, t.fabric_type, t.color, t.design,
                    t.gsm, t.meter_length, t.cost_per_meter, t.selling_price,
                    t.remaining_stock, t.warehouse_location, t.movement_speed,
                    t.status, p.product_name, p.category,
                    ROUND(t.selling_price - t.cost_per_meter, 2) AS margin_per_meter
             FROM thans t
             LEFT JOIN products p ON t.product_id = p.product_id
             WHERE t.bale_id = ?
             ORDER BY t.than_id`,
            [baleId]
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// ─── OPERATIONS DASHBOARD ─────────────────────────────────────────────────────
app.get('/api/operations/dashboard', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();

        const [summary] = await conn.query(
            `SELECT
                COUNT(DISTINCT b.bale_id)  AS total_bales,
                COUNT(DISTINCT t.than_id)  AS total_thans,
                COALESCE(SUM(t.remaining_stock), 0)                                           AS available_meters,
                COALESCE(SUM(t.remaining_stock * t.cost_per_meter), 0)                        AS stock_cost_value,
                COALESCE(SUM(t.remaining_stock * t.selling_price), 0)                         AS stock_retail_value,
                COALESCE(SUM((t.selling_price - t.cost_per_meter) * t.remaining_stock), 0)    AS unrealized_margin,
                SUM(CASE WHEN t.movement_speed = 'dead' THEN 1 ELSE 0 END)                    AS dead_than_count,
                COALESCE(SUM(CASE WHEN t.movement_speed = 'dead'
                    THEN t.remaining_stock * t.cost_per_meter ELSE 0 END), 0)                 AS dead_stock_value
             FROM thans t
             LEFT JOIN bales b ON t.bale_id = b.bale_id`
        );

        const categoryMovement = await conn.query(
            `SELECT
                COALESCE(p.category, t.fabric_type) AS category,
                COUNT(DISTINCT t.than_id)            AS than_count,
                COALESCE(SUM(t.remaining_stock), 0)  AS remaining_meters,
                COALESCE(SUM(tx.quantity), 0)         AS sold_meters,
                COALESCE(SUM(tx.margin), 0)           AS realized_margin,
                ROUND(
                    COALESCE(SUM(tx.quantity), 0) /
                    NULLIF(COALESCE(SUM(tx.quantity), 0) + COALESCE(SUM(t.remaining_stock), 0), 0),
                    3
                ) AS sell_through_rate
             FROM thans t
             LEFT JOIN products p ON t.product_id = p.product_id
             LEFT JOIN (
                SELECT than_id, SUM(quantity) AS quantity, SUM(margin) AS margin
                FROM transactions
                GROUP BY than_id
             ) tx ON tx.than_id = t.than_id
             GROUP BY COALESCE(p.category, t.fabric_type)
             ORDER BY sold_meters DESC, realized_margin DESC
             LIMIT 8`
        );

        const deadStock = await conn.query(
            `SELECT
                t.than_id,
                t.than_code,
                t.fabric_type,
                t.color,
                t.design,
                t.remaining_stock,
                t.cost_per_meter,
                t.selling_price,
                ROUND(t.remaining_stock * t.cost_per_meter, 2) AS cost_value,
                t.warehouse_location,
                t.movement_speed,
                DATEDIFF(CURDATE(),
                    DATE(COALESCE(
                        MAX(im.movement_date),
                        t.created_at
                    ))
                ) AS days_without_movement
             FROM thans t
             LEFT JOIN inventory_movements im ON im.than_id = t.than_id
             WHERE t.remaining_stock > 0
             GROUP BY
                t.than_id, t.than_code, t.fabric_type, t.color, t.design,
                t.remaining_stock, t.cost_per_meter, t.selling_price,
                t.warehouse_location, t.movement_speed, t.created_at
             ORDER BY
                CASE t.movement_speed
                    WHEN 'dead' THEN 0
                    WHEN 'slow' THEN 1
                    WHEN 'new'  THEN 2
                    ELSE 3
                END,
                days_without_movement DESC,
                t.remaining_stock DESC
             LIMIT 15`
        );

        const retailerSignals = await conn.query(
            `SELECT
                r.retailer_id, r.shop_name, r.market_location, r.payment_pattern,
                r.preferred_categories, r.preferred_price_segment, r.outstanding_balance,
                COUNT(tx.transaction_id)                           AS order_count,
                COALESCE(SUM(tx.quantity), 0)                      AS meters_bought,
                COALESCE(SUM(tx.price * tx.quantity - tx.discount), 0) AS revenue,
                COALESCE(SUM(tx.margin), 0)                        AS margin
             FROM retailers r
             LEFT JOIN transactions tx ON r.retailer_id = tx.retailer_id
             GROUP BY
                r.retailer_id, r.shop_name, r.market_location, r.payment_pattern,
                r.preferred_categories, r.preferred_price_segment, r.outstanding_balance
             ORDER BY revenue DESC, meters_bought DESC
             LIMIT 8`
        );

        const supplierSignals = await conn.query(
            `SELECT
                s.supplier_id, s.supplier_name, s.quality_rating,
                s.delay_frequency, s.trend_alignment,
                COUNT(DISTINCT b.bale_id)    AS bales_received,
                COUNT(DISTINCT t.than_id)    AS thans_created,
                COALESCE(SUM(tx.quantity), 0) AS meters_sold,
                COALESCE(SUM(tx.margin), 0)   AS realized_margin
             FROM suppliers s
             LEFT JOIN bales b ON s.supplier_id = b.supplier_id
             LEFT JOIN thans t ON b.bale_id = t.bale_id
             LEFT JOIN (
                SELECT than_id, SUM(quantity) AS quantity, SUM(margin) AS margin
                FROM transactions
                GROUP BY than_id
             ) tx ON t.than_id = tx.than_id
             GROUP BY s.supplier_id, s.supplier_name, s.quality_rating, s.delay_frequency, s.trend_alignment
             ORDER BY realized_margin DESC, meters_sold DESC`
        );

        res.json({ summary, categoryMovement, deadStock, retailerSignals, supplierSignals });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
});

// ─── INVENTORY SEARCH ─────────────────────────────────────────────────────────
app.get('/api/inventory/search', async (req, res) => {
    const q        = String(req.query.q || '').trim();
    const maxPrice = req.query.max_price ? Number(req.query.max_price) : null;
    const params   = [];
    const clauses  = ['t.remaining_stock > 0'];

    if (q) {
        clauses.push(`(
            t.than_code        LIKE ? OR t.fabric_type LIKE ? OR t.color LIKE ?
            OR t.design        LIKE ? OR COALESCE(p.category, '') LIKE ?
            OR t.warehouse_location LIKE ?
        )`);
        const like = `%${q}%`;
        params.push(like, like, like, like, like, like);
    }
    if (maxPrice !== null && !isNaN(maxPrice)) {
        clauses.push('t.selling_price <= ?');
        params.push(maxPrice);
    }

    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(
            `SELECT t.than_id, t.than_code, t.fabric_type, t.color, t.design,
                    t.gsm, t.remaining_stock, t.selling_price, t.cost_per_meter,
                    t.warehouse_location, t.movement_speed,
                    ROUND(t.selling_price - t.cost_per_meter, 2) AS margin_per_meter,
                    p.product_name, p.category
             FROM thans t
             LEFT JOIN products p ON t.product_id = p.product_id
             WHERE ${clauses.join(' AND ')}
             ORDER BY
                CASE t.movement_speed
                    WHEN 'fast'   THEN 0
                    WHEN 'medium' THEN 1
                    WHEN 'slow'   THEN 2
                    WHEN 'new'    THEN 3
                    WHEN 'dead'   THEN 4
                END,
                t.remaining_stock DESC
             LIMIT 100`,
            params
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// ─── CUSTOMER ENQUIRY (dealer registration) ───────────────────────────────────
// POST /api/enquiry — called by CustomerForm.jsx
// Bug 3 fix: this route was completely missing; frontend was hitting a 404.
app.post('/api/enquiry', async (req, res) => {
    const { customer_name, contact_phone, email } = req.body;
    if (!customer_name?.trim())
        return res.status(400).json({ error: 'customer_name is required' });
    if (email && !emailRegex.test(email))
        return res.status(400).json({ error: 'Invalid email format' });
    let conn;
    try {
        conn = await pool.getConnection();
        const [existing] = await conn.query(
            'SELECT customer_id FROM customers WHERE customer_name = ?', [customer_name.trim()]
        );
        if (existing)
            return res.status(409).json({ error: 'A customer with this name already exists', customer_id: existing.customer_id });
        const result = await conn.query(
            'INSERT INTO customers (customer_name, contact_phone, email) VALUES (?, ?, ?)',
            [customer_name.trim(), contact_phone?.trim() || null, email?.trim() || null]
        );
        res.status(201).json({ success: true, customer_id: Number(result.insertId) });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// ─── QUOTATIONS ───────────────────────────────────────────────────────────────
// Bug 3 fix: all four quotation routes were completely missing from server.js.
// QuotationForm, QuotationHistory were calling endpoints that returned 404.
// PATCH /quotations/:id/status is guarded by MANAGE_QUOTATION_STATUS (admin only).

// POST /api/create-quotation — called by QuotationForm.jsx
app.post('/api/create-quotation', async (req, res) => {
    const { customer_id, user_id, items } = req.body;
    if (!customer_id) return res.status(400).json({ error: 'customer_id is required' });
    if (!Array.isArray(items) || items.length === 0)
        return res.status(400).json({ error: 'items array must not be empty' });
    for (let i = 0; i < items.length; i++) {
        if (!items[i].product_id || !items[i].quantity || Number(items[i].quantity) <= 0)
            return res.status(400).json({ error: `Item ${i + 1}: product_id and quantity > 0 required` });
    }
    let conn;
    try {
        conn = await pool.getConnection();
        const [customer] = await conn.query('SELECT customer_id FROM customers WHERE customer_id = ?', [customer_id]);
        if (!customer) return res.status(404).json({ error: 'Customer not found' });

        await conn.beginTransaction();

        // Build line items with prices from products table
        let subtotal = 0;
        const lineItems = [];
        for (const item of items) {
            const [product] = await conn.query(
                'SELECT product_id, product_name, base_price FROM products WHERE product_id = ?',
                [item.product_id]
            );
            if (!product) {
                await conn.rollback();
                return res.status(404).json({ error: `Product ${item.product_id} not found` });
            }
            const unit_price = Number(product.base_price);
            const qty        = Number(item.quantity);
            const line_total = unit_price * qty;
            subtotal        += line_total;
            lineItems.push({ product_id: product.product_id, product_name: product.product_name, quantity: qty, unit_price, line_total });
        }

        const vat         = subtotal * 0.13;
        const grand_total = subtotal + vat;

        const qResult = await conn.query(
            `INSERT INTO quotations (customer_id, user_id, subtotal, vat, grand_total, status, created_at)
             VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
            [customer_id, user_id || null, subtotal, vat, grand_total]
        );
        const quotation_id = Number(qResult.insertId);

        for (const li of lineItems) {
            await conn.query(
                `INSERT INTO quotation_items (quotation_id, product_id, quantity, unit_price, line_total)
                 VALUES (?, ?, ?, ?, ?)`,
                [quotation_id, li.product_id, li.quantity, li.unit_price, li.line_total]
            );
        }

        await conn.commit();
        res.status(201).json({ success: true, quotation_id, subtotal, vat, grand_total });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
});

// GET /api/quotations — list quotations; admin sees all, user sees own
app.get('/api/quotations', async (req, res) => {
    const user_id = req.query.user_id ? Number(req.query.user_id) : null;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    let conn;
    try {
        conn = await pool.getConnection();
        const [requestingUser] = await conn.query('SELECT role FROM users WHERE user_id = ?', [user_id]);
        if (!requestingUser) return res.status(401).json({ error: 'User not found' });

        let rows;
        if (requestingUser.role === 'admin') {
            rows = await conn.query(
                `SELECT q.quotation_id, q.status, q.subtotal, q.vat, q.grand_total, q.created_at,
                        c.customer_name, u.username
                 FROM quotations q
                 LEFT JOIN customers c ON q.customer_id = c.customer_id
                 LEFT JOIN users     u ON q.user_id     = u.user_id
                 ORDER BY q.created_at DESC`
            );
        } else {
            rows = await conn.query(
                `SELECT q.quotation_id, q.status, q.subtotal, q.vat, q.grand_total, q.created_at,
                        c.customer_name
                 FROM quotations q
                 LEFT JOIN customers c ON q.customer_id = c.customer_id
                 WHERE q.user_id = ?
                 ORDER BY q.created_at DESC`,
                [user_id]
            );
        }
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// GET /api/quotations/:id — get single quotation with line items
app.get('/api/quotations/:id', async (req, res) => {
    const quotation_id = Number(req.params.id);
    if (!Number.isInteger(quotation_id) || quotation_id <= 0)
        return res.status(400).json({ error: 'Invalid quotation ID' });
    let conn;
    try {
        conn = await pool.getConnection();
        const [q] = await conn.query(
            `SELECT q.*, c.customer_name, u.username
             FROM quotations q
             LEFT JOIN customers c ON q.customer_id = c.customer_id
             LEFT JOIN users     u ON q.user_id     = u.user_id
             WHERE q.quotation_id = ?`,
            [quotation_id]
        );
        if (!q) return res.status(404).json({ error: 'Quotation not found' });

        const items = await conn.query(
            `SELECT qi.*, p.product_name
             FROM quotation_items qi
             LEFT JOIN products p ON qi.product_id = p.product_id
             WHERE qi.quotation_id = ?`,
            [quotation_id]
        );
        res.json({ ...q, items });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// PATCH /api/quotations/:id/status — admin only (Bug 3 fix: checkPermission guard)
app.patch('/api/quotations/:id/status', checkPermission('MANAGE_QUOTATION_STATUS'), async (req, res) => {
    const quotation_id = Number(req.params.id);
    if (!Number.isInteger(quotation_id) || quotation_id <= 0)
        return res.status(400).json({ error: 'Invalid quotation ID' });

    const { status, decline_reason } = req.body;
    const allowed = ['pending', 'accepted', 'declined'];
    if (!allowed.includes(status))
        return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    if (status === 'declined' && !decline_reason?.trim())
        return res.status(400).json({ error: 'decline_reason is required when declining' });

    let conn;
    try {
        conn = await pool.getConnection();
        const [q] = await conn.query('SELECT quotation_id FROM quotations WHERE quotation_id = ?', [quotation_id]);
        if (!q) return res.status(404).json({ error: 'Quotation not found' });

        await conn.query(
            `UPDATE quotations SET status = ?, decline_reason = ?, updated_at = NOW() WHERE quotation_id = ?`,
            [status, status === 'declined' ? decline_reason.trim() : null, quotation_id]
        );
        res.json({ success: true, quotation_id, status });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// ─── BATCH movement_speed RECALCULATION ──────────────────────────────────────
app.post('/api/admin/recalculate-speeds', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const thans = await conn.query(
            `SELECT t.than_id, t.remaining_stock,
                    DATEDIFF(CURDATE(), DATE(COALESCE(MAX(im.movement_date), t.created_at))) AS idle_days,
                    (SELECT COUNT(*) FROM inventory_movements
                     WHERE than_id = t.than_id AND movement_type = 'stock_out') AS sale_count
             FROM thans t
             LEFT JOIN inventory_movements im ON im.than_id = t.than_id
             WHERE t.remaining_stock > 0
             GROUP BY t.than_id, t.remaining_stock, t.created_at`
        );

        let updated = 0;
        for (const row of thans) {
            const idle  = Number(row.idle_days || 0);
            const sales = Number(row.sale_count || 0);
            let speed;
            if (sales === 0)      speed = 'new';
            else if (idle >= 90)  speed = 'dead';
            else if (idle >= 45)  speed = 'slow';
            else if (idle >= 14)  speed = 'medium';
            else                  speed = 'fast';

            await conn.query('UPDATE thans SET movement_speed = ? WHERE than_id = ?', [speed, row.than_id]);
            updated++;
        }
        res.json({ success: true, updated });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

import express                      from 'express';
import cors                         from 'cors';
import bcrypt                       from 'bcryptjs';
import pool                         from './db.js';
import { checkPermission }          from './middleware/checkPermission.js';
import salesRouter                  from './routes/sales.js';
import retailersRouter              from './routes/retailers.js';
import agentsRouter                 from './routes/agents.js';

const app = express();

app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:4173',
        process.env.FRONTEND_URL
    ].filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'x-user-id']
}));
app.use(express.json());

// ─── Route mounts ──────────────────────────────────────────────────────────
app.use('/api/transactions', salesRouter);
app.use('/api/retailers',    retailersRouter);
app.use('/api/agents',       agentsRouter);

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
    try {
        const conn = await pool.getConnection();
        await conn.query('SELECT 1');
        conn.release();
        res.json({ api: 'ok', database: 'connected' });
    } catch (err) {
        res.status(503).json({ api: 'ok', database: 'disconnected', error: err.code || err.message });
    }
});

// ─── AUTH ─────────────────────────────────────────────────────────────────
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
        const hash   = await bcrypt.hash(password, 10);
        const result = await conn.query(
            'INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)',
            [username, hash, email || null]
        );
        res.status(201).json({ success: true, user_id: Number(result.insertId) });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    let conn;
    try {
        conn = await pool.getConnection();
        const [user] = await conn.query(
            'SELECT user_id, username, password_hash, role FROM users WHERE username = ?', [username]
        );
        if (!user) return res.status(401).json({ error: 'Invalid username or password' });
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Invalid username or password' });
        res.json({ user_id: user.user_id, username: user.username, role: user.role });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// ─── PRODUCTS ─────────────────────────────────────────────────────────────
app.get('/api/products', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(
            'SELECT product_id, product_name, category, base_price, description FROM products ORDER BY category, product_name'
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

app.post('/api/products', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    const { product_name, category, base_price, description } = req.body;
    if (!product_name || !category || !base_price)
        return res.status(400).json({ error: 'All fields required' });
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query(
            'INSERT INTO products (product_name, category, base_price, description) VALUES (?, ?, ?, ?)',
            [product_name.trim(), category.trim(), Number(base_price), description?.trim() || null]
        );
        res.status(201).json({ success: true, product_id: Number(result.insertId) });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

app.put('/api/products/:id', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid product ID' });
    const { product_name, category, base_price, description } = req.body;
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query(
            'UPDATE products SET product_name=?, category=?, base_price=?, description=? WHERE product_id=?',
            [product_name, category, Number(base_price), description || null, id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

app.delete('/api/products/:id', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid product ID' });
    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query('DELETE FROM products WHERE product_id = ?', [id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// ─── SUPPLIERS ────────────────────────────────────────────────────────────
app.get('/api/suppliers', async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query('SELECT * FROM suppliers ORDER BY supplier_name');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// ─── BALES ────────────────────────────────────────────────────────────────
app.post('/api/bales', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    const {
        bale_code, arrival_date, purchase_cost, transport_cost,
        total_rolls, fabric_category, purchase_invoice
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
        const [existing] = await conn.query('SELECT bale_id FROM bales WHERE bale_code = ?', [bale_code]);
        if (existing) return res.status(409).json({ error: 'Bale code already exists' });
        const result = await conn.query(
            `INSERT INTO bales
                (bale_code, arrival_date, purchase_cost,
                 transport_cost, total_rolls, fabric_category, purchase_invoice, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'received')`,
            [
                bale_code.trim(), arrival_date,
                Number(purchase_cost), Number(transport_cost || 0),
                Number(total_rolls), fabric_category.trim(),
                purchase_invoice?.trim() || null
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
            `SELECT b.bale_id, b.bale_code, b.fabric_category, b.arrival_date,
                    b.purchase_cost, b.transport_cost, b.total_rolls, b.status,
                    b.purchase_invoice,
                    COUNT(t.than_id) AS registered_thans,
                    COALESCE(SUM(t.remaining_stock), 0) AS total_remaining_stock
             FROM bales b
             LEFT JOIN thans t ON t.bale_id = b.bale_id
             GROUP BY b.bale_id, b.bale_code, b.fabric_category, b.arrival_date,
                    b.purchase_cost, b.transport_cost, b.total_rolls, b.status,
                    b.purchase_invoice
             ORDER BY b.arrival_date DESC, b.bale_id DESC`
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

app.get('/api/bales/:id', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
    const baleId = Number(req.params.id);
    if (!baleId) return res.status(400).json({ error: 'Invalid bale ID' });
    let conn;
    try {
        conn = await pool.getConnection();
        const [bale] = await conn.query(
            `SELECT b.*, COUNT(t.than_id) AS registered_thans,
                    COALESCE(SUM(t.remaining_stock), 0) AS total_remaining_stock
             FROM bales b
             LEFT JOIN thans t ON t.bale_id = b.bale_id
             WHERE b.bale_id = ?
             GROUP BY b.bale_id`,
            [baleId]
        );
        if (!bale) return res.status(404).json({ error: 'Bale not found' });
        res.json(bale);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

app.post('/api/bales/:id/thans', checkPermission('MANAGE_PRODUCTS'), async (req, res) => {
    const baleId = Number(req.params.id);
    if (!baleId) return res.status(400).json({ error: 'Invalid bale ID' });
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
        if (t.selling_price < t.cost_per_meter)
            return res.status(400).json({
                error: `Row ${i + 1}: selling_price (${t.selling_price}) must be >= cost_per_meter (${t.cost_per_meter})`
            });
    }

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        const [bale] = await conn.query('SELECT bale_id, status FROM bales WHERE bale_id = ?', [baleId]);
        if (!bale) return res.status(404).json({ error: 'Bale not found' });

        const insertedIds = [];
        for (const t of thans) {
            const [dup] = await conn.query(
                'SELECT than_id FROM thans WHERE than_code = ?', [t.than_code]
            );
            if (dup) {
                await conn.rollback();
                return res.status(409).json({ error: `than_code "${t.than_code}" already exists — rolled back` });
            }
            const r = await conn.query(
                `INSERT INTO thans
                     (bale_id, product_id, than_code, fabric_type, color, design,
                      gsm, meter_length, remaining_stock, cost_per_meter, selling_price,
                      warehouse_location, movement_speed, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 'in_stock')`,
                [
                    baleId,
                    t.product_id   || null,
                    t.than_code.trim(),
                    t.fabric_type.trim(),
                    t.color?.trim()             || null,
                    t.design?.trim()            || null,
                    t.gsm            ? Number(t.gsm)            : null,
                    Number(t.meter_length),
                    Number(t.meter_length),
                    Number(t.cost_per_meter),
                    Number(t.selling_price),
                    t.warehouse_location?.trim() || null
                ]
            );
            insertedIds.push(Number(r.insertId));

            await conn.query(
                `INSERT INTO inventory_movements
                    (than_id, movement_type, quantity, from_location, to_location,
                     reference_type, reference_id, notes, movement_date)
                 VALUES (?, 'stock_in', ?, NULL, ?, 'bale', ?, ?, current_timestamp())`,
                [
                    Number(r.insertId),
                    Number(t.meter_length),
                    t.warehouse_location?.trim() || null,
                    baleId,
                    `Initial intake from bale ${baleId}`
                ]
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
    if (!baleId) return res.status(400).json({ error: 'Invalid bale ID' });
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query(
            `SELECT t.than_id, t.than_code, t.fabric_type, t.color, t.design,
                    t.gsm, t.meter_length,
                    t.remaining_stock, t.warehouse_location, t.movement_speed,
                    t.status, p.product_name, p.category,
                    t.cost_per_meter, t.selling_price,
                    ROUND(t.selling_price - t.cost_per_meter, 2) AS margin_per_meter,
                    t.created_at
             FROM thans t
             LEFT JOIN products p ON t.product_id = p.product_id
             WHERE t.bale_id = ?
             ORDER BY t.created_at DESC`,
            [baleId]
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// ─── OPERATIONS DASHBOARD ─────────────────────────────────────────────────
app.get('/api/operations/dashboard', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const [summary] = await conn.query(
            `SELECT
                COUNT(*)                                                                        AS total_thans,
                SUM(CASE WHEN t.status = 'in_stock' THEN 1 ELSE 0 END)                         AS in_stock_thans,
                SUM(CASE WHEN t.status = 'sold_out' THEN 1 ELSE 0 END)                         AS sold_out_thans,
                ROUND(SUM(t.remaining_stock), 2)                                                AS total_remaining_meters,
                ROUND(SUM(t.remaining_stock * t.selling_price), 2)                             AS retail_value,
                ROUND(SUM(t.remaining_stock * t.cost_per_meter), 2)                            AS cost_value,
                SUM(CASE WHEN t.movement_speed = 'dead' THEN 1 ELSE 0 END)                     AS dead_than_count,
                COALESCE(SUM(CASE WHEN t.movement_speed = 'dead'
                    THEN t.remaining_stock * t.cost_per_meter ELSE 0 END), 0)                  AS dead_stock_value,
                SUM(CASE WHEN t.movement_speed = 'slow' THEN 1 ELSE 0 END)                     AS slow_than_count,
                COALESCE(SUM(CASE WHEN t.movement_speed IN ('dead','slow')
                    THEN t.remaining_stock ELSE 0 END), 0)                                     AS idle_meters,
                SUM(CASE WHEN t.movement_speed = 'fast'   THEN 1 ELSE 0 END)                   AS fast_count,
                SUM(CASE WHEN t.movement_speed = 'medium' THEN 1 ELSE 0 END)                   AS medium_count,
                SUM(CASE WHEN t.movement_speed = 'new'    THEN 1 ELSE 0 END)                   AS new_count
             FROM thans t`
        );

        const categoryBreakdown = await conn.query(
            `SELECT COALESCE(p.category, t.fabric_type) AS category,
                    COUNT(*) AS than_count,
                    ROUND(SUM(t.remaining_stock), 2) AS meters,
                    ROUND(SUM(t.remaining_stock * t.selling_price), 2) AS retail_value,
                    SUM(CASE WHEN t.movement_speed IN ('dead','slow') THEN 1 ELSE 0 END) AS idle_count
             FROM thans t
             LEFT JOIN products p ON t.product_id = p.product_id
             GROUP BY COALESCE(p.category, t.fabric_type)
             ORDER BY retail_value DESC`
        );

        const recentBales = await conn.query(
            `SELECT b.bale_id, b.bale_code, b.fabric_category, b.arrival_date,
                    b.purchase_cost, b.transport_cost, b.total_rolls, b.status,
                    COUNT(t.than_id) AS registered_thans,
                    COALESCE(SUM(t.remaining_stock), 0) AS remaining_stock
             FROM bales b
             LEFT JOIN thans t ON t.bale_id = b.bale_id
             GROUP BY b.bale_id, b.bale_code, b.fabric_category, b.arrival_date,
                      b.purchase_cost, b.transport_cost, b.total_rolls, b.status
             ORDER BY b.arrival_date DESC
             LIMIT 10`
        );

        const deadStockDetail = await conn.query(
            `SELECT t.than_id, t.than_code, t.fabric_type, t.color, t.design,
                    t.remaining_stock, t.cost_per_meter, t.selling_price,
                    t.warehouse_location, t.movement_speed,
                    ROUND(t.remaining_stock * t.cost_per_meter, 2) AS locked_value,
                    DATEDIFF(CURDATE(), DATE(COALESCE(MAX(im.movement_date), t.created_at))) AS idle_days,
                    p.category,
                    CASE t.movement_speed
                        WHEN 'dead' THEN 1 WHEN 'slow' THEN 2
                        WHEN 'medium' THEN 3 WHEN 'new' THEN 4 ELSE 5
                    END AS speed_rank
             FROM thans t
             LEFT JOIN products p ON t.product_id = p.product_id
             LEFT JOIN inventory_movements im ON im.than_id = t.than_id
             WHERE t.movement_speed IN ('dead','slow') AND t.remaining_stock > 0
             GROUP BY t.than_id, t.than_code, t.fabric_type, t.color, t.design,
                      t.remaining_stock, t.cost_per_meter, t.selling_price,
                      t.warehouse_location, t.movement_speed, p.category
             ORDER BY speed_rank, locked_value DESC
             LIMIT 50`
        );

        res.json({ summary, categoryBreakdown, recentBales, deadStockDetail });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// ─── INVENTORY SEARCH ─────────────────────────────────────────────────────
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

// ─── ENQUIRY / CUSTOMER REGISTRATION ──────────────────────────────────────
app.post('/api/enquiry', async (req, res) => {
    const { customer_name, contact_phone, email } = req.body;
    if (!customer_name?.trim())
        return res.status(400).json({ error: 'customer_name is required' });
    let conn;
    try {
        conn = await pool.getConnection();
        const result = await conn.query(
            'INSERT INTO customers (customer_name, contact_phone, email) VALUES (?, ?, ?)',
            [customer_name.trim(), contact_phone?.trim() || null, email?.trim() || null]
        );
        res.status(201).json({ success: true, customer_id: Number(result.insertId) });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// ─── QUOTATIONS ───────────────────────────────────────────────────────────
app.post('/api/create-quotation', async (req, res) => {
    const { customer_id, user_id, items } = req.body;
    if (!customer_id || !Array.isArray(items) || items.length === 0)
        return res.status(400).json({ error: 'customer_id and items array are required' });

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        // Compute totals from live product prices
        let subtotal = 0;
        const enriched = [];
        for (const item of items) {
            const [prod] = await conn.query(
                'SELECT product_id, base_price FROM products WHERE product_id = ?',
                [Number(item.product_id)]
            );
            if (!prod) {
                await conn.rollback();
                return res.status(400).json({ error: `Product ${item.product_id} not found` });
            }
            const lineTotal = Number(prod.base_price) * Number(item.quantity);
            subtotal += lineTotal;
            enriched.push({ product_id: Number(item.product_id), quantity: Number(item.quantity), unit_price: Number(prod.base_price), line_total: lineTotal });
        }
        const vat        = Math.round(subtotal * 0.13 * 100) / 100;
        const grandTotal = Math.round((subtotal + vat) * 100) / 100;

        const result = await conn.query(
            `INSERT INTO quotations (customer_id, user_id, total_amount, vat_amount, grand_total, status)
             VALUES (?, ?, ?, ?, ?, 'pending')`,
            [Number(customer_id), user_id || null, subtotal, vat, grandTotal]
        );
        const quotationId = Number(result.insertId);

        for (const item of enriched) {
            await conn.query(
                `INSERT INTO quotation_items (quotation_id, product_id, quantity, unit_price_at_time, line_total)
                 VALUES (?, ?, ?, ?, ?)`,
                [quotationId, item.product_id, item.quantity, item.unit_price, item.line_total]
            );
        }

        await conn.commit();
        res.status(201).json({ success: true, quotation_id: quotationId, grand_total: grandTotal });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
});

app.get('/api/quotations', async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    let conn;
    try {
        conn = await pool.getConnection();
        const [requestingUser] = await conn.query(
            'SELECT role FROM users WHERE user_id = ?', [user_id]
        );
        if (!requestingUser) return res.status(401).json({ error: 'Unauthorized' });

        const isAdmin = requestingUser.role === 'admin';
        const rows = await conn.query(
            `SELECT q.quotation_id, q.status, q.total_amount, q.vat_amount, q.grand_total,
                    q.created_at, q.decline_reason,
                    c.customer_name, c.contact_phone,
                    u.username
             FROM quotations q
             LEFT JOIN customers c ON q.customer_id = c.customer_id
             LEFT JOIN users     u ON q.user_id     = u.user_id
             ${isAdmin ? '' : 'WHERE q.user_id = ?'}
             ORDER BY q.created_at DESC`,
            isAdmin ? [] : [user_id]
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

app.get('/api/quotations/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid quotation ID' });
    let conn;
    try {
        conn = await pool.getConnection();
        const [q] = await conn.query(
            `SELECT q.*, c.customer_name, c.contact_phone, u.username
             FROM quotations q
             LEFT JOIN customers c ON q.customer_id = c.customer_id
             LEFT JOIN users     u ON q.user_id     = u.user_id
             WHERE q.quotation_id = ?`,
            [id]
        );
        if (!q) return res.status(404).json({ error: 'Quotation not found' });
        const items = await conn.query(
            `SELECT qi.*, p.product_name, p.category
             FROM quotation_items qi
             LEFT JOIN products p ON qi.product_id = p.product_id
             WHERE qi.quotation_id = ?`,
            [id]
        );
        res.json({ ...q, items });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// Bug 3 fix: added checkPermission('MANAGE_QUOTATION_STATUS') — previously unguarded
app.patch('/api/quotations/:id/status', checkPermission('MANAGE_QUOTATION_STATUS'), async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid quotation ID' });
    const { status, decline_reason } = req.body;
    const VALID = ['pending', 'accepted', 'declined'];
    if (!VALID.includes(status))
        return res.status(400).json({ error: `status must be one of: ${VALID.join(', ')}` });
    if (status === 'declined' && !decline_reason?.trim())
        return res.status(400).json({ error: 'decline_reason is required when declining' });
    let conn;
    try {
        conn = await pool.getConnection();
        const [q] = await conn.query('SELECT quotation_id FROM quotations WHERE quotation_id = ?', [id]);
        if (!q) return res.status(404).json({ error: 'Quotation not found' });
        await conn.query(
            'UPDATE quotations SET status = ?, decline_reason = ? WHERE quotation_id = ?',
            [status, decline_reason?.trim() || null, id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

// ─── BATCH movement_speed RECALCULATION ───────────────────────────────────
// POST /api/admin/recalculate-speeds
// Backfill movement_speed for existing thans using same 90/45/14-day thresholds.
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
            const idle  = Number(row.idle_days  || 0);
            const sales = Number(row.sale_count || 0);
            let speed;
            if      (sales === 0)    speed = 'new';
            else if (idle >= 90)     speed = 'dead';   // aligned with refreshMovementSpeed
            else if (idle >= 45)     speed = 'slow';
            else if (idle >= 14)     speed = 'medium';
            else                      speed = 'fast';
            await conn.query('UPDATE thans SET movement_speed = ? WHERE than_id = ?', [speed, row.than_id]);
            updated++;
        }
        res.json({ success: true, updated });
    } catch (err) { res.status(500).json({ error: err.message }); }
    finally { if (conn) conn.release(); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

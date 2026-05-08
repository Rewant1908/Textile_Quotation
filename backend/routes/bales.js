import express from 'express';
import pool from '../db.js';
import { checkPermission } from '../middleware/checkPermission.js';
import { invalidate } from '../middleware/cacheMiddleware.js';
import { cache } from '../middleware/cacheMiddleware.js';
import { flush } from '../cache.js';

const router = express.Router();

// ── POST /api/bales ───────────────────────────────────────────────────────────
router.post('/', checkPermission('MANAGE_PRODUCTS'), invalidate('dashboard'), async (req, res) => {
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

// ── GET /api/bales ────────────────────────────────────────────────────────────
router.get('/', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
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

// ── GET /api/bales/:id ────────────────────────────────────────────────────────
router.get('/:id', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
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

// ── POST /api/bales/:id/thans — breakdown bale into thans ─────────────────────
router.post('/:id/thans', checkPermission('MANAGE_PRODUCTS'), invalidate('dashboard'), async (req, res) => {
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
        flush('thans:*').catch(() => {});

        res.status(201).json({ success: true, inserted: insertedIds.length, than_ids: insertedIds });
    } catch (err) {
        if (conn) await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally { if (conn) conn.release(); }
});

// ── GET /api/bales/:id/thans ──────────────────────────────────────────────────
router.get('/:id/thans', checkPermission('VIEW_OPERATIONS'), async (req, res) => {
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

export default router;

// routes/whatsapp.js — Meta Cloud API WhatsApp webhook
// Phase 9: Dealer identity resolution wired in
//
// Endpoints:
//   GET  /api/whatsapp/webhook  — Meta verification handshake
//   POST /api/whatsapp/webhook  — inbound message handler (async pattern)
//   GET  /webhooks/whatsapp     — Meta verification handshake (public alias)
//   POST /webhooks/whatsapp     — inbound message handler (public alias)
//   POST /api/whatsapp/send     — internal programmatic send (admin use)
//
// Inbound text message flow:
//   resolveDealer(phone)
//     → known dealer  : dealerAgentFallback  (personalised, scoped to user_id)
//     → unknown phone : fmtUnknownDealer()   (onboarding prompt)
//     → inventory Q   : parseIntent → queryInventory → formatReply (fast path)
//
// Inbound image message flow:
//   fetchMetaMediaUrl → update thans.image_url by caption=than_code

import { Router }          from 'express'
import { createHmac }      from 'crypto'
import { checkPermission } from '../middleware/checkPermission.js'
import logger              from '../logger.js'
import pool                from '../db.js'
import {
    parseIntent,
    queryInventory,
    confidenceCheck,
    formatReply,
    sendWhatsAppMessage,
    fetchMetaMediaUrl,
    fallbackToSalesperson,
    agentFallback,
    dealerAgentFallback,
} from '../services/whatsappService.js'
import { resolveDealer }           from '../services/dealerResolver.js'
import {
    fmtUnknownDealer,
    fmtPendingOrders,
    fmtReceivables,
    fmtDispatch,
    fmtStockOffers,
} from '../services/dealerMessageFormatter.js'

const router = Router()

// ── Signature verification ────────────────────────────────────────────────────
function verifySignature(rawBody, signatureHeader) {
    if (!signatureHeader?.startsWith('sha256=')) return false
    const secret = process.env.WHATSAPP_APP_SECRET
    if (!secret) {
        logger.warn('[whatsapp] WHATSAPP_APP_SECRET not set — skipping signature check (dev mode)')
        return true
    }
    const expected = 'sha256=' + createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex')
    const a = Buffer.from(expected)
    const b = Buffer.from(signatureHeader)
    if (a.length !== b.length) return false
    let diff = 0
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
    return diff === 0
}

// ── GET /api/whatsapp/webhook — Meta verification ────────────────────────────
function verifyWebhookChallenge(req, res) {
    const mode      = req.query['hub.mode']
    const token     = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        logger.info('[whatsapp] Webhook verified by Meta')
        return res.status(200).send(challenge)
    }
    logger.warn({ mode, token }, '[whatsapp] Webhook verification failed')
    res.sendStatus(403)
}

router.get('/', verifyWebhookChallenge)
router.get('/webhook', verifyWebhookChallenge)

// ── POST /api/whatsapp/webhook — inbound message handler ─────────────────────
// Returns 200 immediately — all processing is async.
function acceptWebhook(req, res) {
    const sig     = req.headers['x-hub-signature-256']
    const rawBody = req.rawBody
    if (rawBody && !verifySignature(rawBody, sig)) {
        logger.warn('[whatsapp] Invalid signature — rejecting')
        return res.sendStatus(403)
    }
    res.sendStatus(200)
    handleInboundAsync(req.body).catch(err =>
        logger.error({ err }, '[whatsapp] Unhandled async error in handleInboundAsync')
    )
}

router.post('/', acceptWebhook)
router.post('/webhook', acceptWebhook)

// ── Dealer command routing ───────────────────────────────────────────────────
function parseDealerCommand(text) {
    const t = String(text || '').trim().toLowerCase()
    if (!t) return { command: null }

    const refMatch = t.match(/\b(?:ktq-\d{4}-\d{1,6}|quote\s*#?\s*\d+|quotation\s*#?\s*\d+|order\s*#?\s*\d+|dispatch\s*#?\s*\d+)\b/i)
    const ref = refMatch?.[0]
        ?.replace(/^(quote|quotation|order|dispatch)\s*#?\s*/i, '')
        ?.trim()

    if (/\b(dispatch|shipment|tracking|track|delivery|order status|where is my order)\b/.test(t)) {
        return { command: 'dispatch', ref }
    }
    if (/\b(pending order|pending orders|open order|open orders|pending quote|pending quotes|my orders)\b/.test(t)) {
        return { command: 'pending_orders' }
    }
    if (/\b(receivable|receivables|ageing|aging|outstanding|overdue|balance|balances|dues?)\b/.test(t)) {
        return { command: 'receivables' }
    }
    if (/\b(ageing stock|aging stock|stock offer|stock offers|offers|offer stock|clearance|slow stock|dead stock|discount)\b/.test(t)) {
        return { command: 'stock_offers' }
    }
    return { command: null }
}

async function handleDealerCommand(from, dealer, text) {
    const { command, ref } = parseDealerCommand(text)
    if (!command) return false

    let reply
    if (command === 'dispatch') {
        reply = fmtDispatch(await getDealerDispatchRows(dealer.user_id, ref), ref)
    } else if (command === 'pending_orders') {
        reply = fmtPendingOrders(await getDealerPendingOrders(dealer.user_id))
    } else if (command === 'receivables') {
        reply = fmtReceivables(await getDealerReceivables(dealer.user_id))
    } else if (command === 'stock_offers') {
        reply = fmtStockOffers(await getDealerStockOffers())
    }

    if (!reply) return false
    await sendWhatsAppMessage(from, reply)
    return true
}

async function getDealerPendingOrders(userId) {
    let conn
    try {
        conn = await pool.getConnection()
        return await conn.query(
            `SELECT
                COALESCE(q.quotation_number, CONCAT('KTQ-', YEAR(q.created_at), '-', LPAD(q.quotation_id, 6, '0'))) AS ref,
                c.customer_name,
                q.total_amount,
                q.status,
                DATEDIFF(CURDATE(), DATE(q.created_at)) AS days_open
             FROM quotations q
             LEFT JOIN customers c ON c.customer_id = q.customer_id
             WHERE q.user_id = ?
               AND q.status IN ('draft', 'pending', 'sent')
             ORDER BY q.created_at DESC
             LIMIT ?`,
            [userId, 10]
        )
    } finally {
        if (conn) {
            conn.release()
            conn = null
        }
    }
}

async function getDealerReceivables(userId) {
    let conn
    try {
        conn = await pool.getConnection()
        const rows = await conn.query(
            `SELECT
                q.total_amount,
                DATEDIFF(CURDATE(), DATE(q.updated_at)) AS days_outstanding
             FROM quotations q
             WHERE q.user_id = ?
               AND q.status = 'accepted'`,
            [userId]
        )
        const buckets = { current: 0, overdue_30: 0, overdue_60: 0, overdue_90: 0 }
        let total = 0
        for (const row of rows) {
            const amount = Number(row.total_amount || 0)
            const days = Number(row.days_outstanding || 0)
            total += amount
            if (days <= 30) buckets.current += amount
            else if (days <= 60) buckets.overdue_30 += amount
            else if (days <= 90) buckets.overdue_60 += amount
            else buckets.overdue_90 += amount
        }
        return { total, buckets }
    } finally {
        if (conn) conn.release()
    }
}

async function getDealerStockOffers() {
    let conn
    try {
        conn = await pool.getConnection()
        return await conn.query(
            `SELECT
                t.than_code,
                t.fabric_type,
                t.color,
                t.design,
                t.remaining_stock,
                t.selling_price,
                t.movement_speed,
                t.image_url,
                CASE
                  WHEN t.movement_speed = 'dead'
                   AND DATEDIFF(CURDATE(), DATE(COALESCE(MAX(im.movement_date), t.created_at))) > ? THEN ?
                  WHEN t.movement_speed = 'dead' THEN ?
                  ELSE ?
                END AS discount_pct,
                ROUND(
                  t.selling_price * (
                    1 - CASE
                          WHEN t.movement_speed = 'dead'
                           AND DATEDIFF(CURDATE(), DATE(COALESCE(MAX(im.movement_date), t.created_at))) > ? THEN ?
                          WHEN t.movement_speed = 'dead' THEN ?
                          ELSE ?
                        END
                  ), 2
                ) AS offer_price
             FROM thans t
             LEFT JOIN inventory_movements im ON im.than_id = t.than_id
             WHERE t.remaining_stock > 0
               AND t.movement_speed IN ('slow', 'dead')
             GROUP BY t.than_id, t.than_code, t.fabric_type, t.color, t.design,
                      t.remaining_stock, t.selling_price, t.movement_speed, t.image_url, t.created_at
             ORDER BY CASE t.movement_speed WHEN 'dead' THEN 0 ELSE 1 END,
                      DATEDIFF(CURDATE(), DATE(COALESCE(MAX(im.movement_date), t.created_at))) DESC
             LIMIT ?`,
            [60, 25, 15, 10, 60, 0.25, 0.15, 0.10, 10]
        )
    } finally {
        if (conn) conn.release()
    }
}

async function getDealerDispatchRows(userId, ref) {
    let conn
    try {
        conn = await pool.getConnection()
        const params = [userId]
        let refClause = ''
        if (ref) {
            const refDigits = String(ref).replace(/\D/g, '')
            refClause = `
              AND (
                   q.quotation_number = ?
                OR q.quotation_id = ?
                OR o.order_id = ?
                OR d.dispatch_id = ?
                OR d.tracking_number = ?
              )`
            params.push(String(ref), Number(refDigits || 0), Number(refDigits || 0), Number(refDigits || 0), String(ref))
        }

        return await conn.query(
            `SELECT
                COALESCE(q.quotation_number, CONCAT('KTQ-', YEAR(q.created_at), '-', LPAD(q.quotation_id, 6, '0'))) AS ref,
                c.customer_name,
                q.total_amount,
                COALESCE(d.delivery_status, o.status, q.status) AS status,
                COALESCE(d.dispatch_date, o.expected_dispatch, q.updated_at) AS updated_at
             FROM quotations q
             LEFT JOIN customers  c ON c.customer_id = q.customer_id
             LEFT JOIN orders     o ON o.quotation_id = q.quotation_id
             LEFT JOIN dispatches d ON d.order_id = o.order_id
             WHERE q.user_id = ?
               AND q.status = 'accepted'
               ${refClause}
             ORDER BY COALESCE(d.dispatch_date, q.updated_at) DESC
             LIMIT ?`,
            [...params, ref ? 5 : 10]
        )
    } catch (err) {
        if (err.code !== 'ER_NO_SUCH_TABLE' && err.code !== 'ER_BAD_FIELD_ERROR') throw err
        if (conn) {
            conn.release()
            conn = null
        }
        conn = await pool.getConnection()
        const params = [userId]
        let refClause = ''
        if (ref) {
            const refDigits = String(ref).replace(/\D/g, '')
            refClause = ` AND (q.quotation_number = ? OR q.quotation_id = ?)`
            params.push(String(ref), Number(refDigits || 0))
        }
        return await conn.query(
            `SELECT
                COALESCE(q.quotation_number, CONCAT('KTQ-', YEAR(q.created_at), '-', LPAD(q.quotation_id, 6, '0'))) AS ref,
                c.customer_name,
                q.total_amount,
                q.status,
                q.updated_at
             FROM quotations q
             LEFT JOIN customers c ON c.customer_id = q.customer_id
             WHERE q.user_id = ?
               AND q.status = 'accepted'
               ${refClause}
             ORDER BY q.updated_at DESC
             LIMIT ?`,
            [...params, ref ? 5 : 10]
        )
    } finally {
        if (conn) conn.release()
    }
}

// ── Async inbound handler ─────────────────────────────────────────────────────
async function handleInboundAsync(body) {
    const entry   = body?.entry?.[0]
    const changes = entry?.changes?.[0]
    if (changes?.field !== 'messages') return

    const value    = changes.value
    const messages = value?.messages
    if (!messages?.length) return

    const msg  = messages[0]
    const from = msg.from

    logger.info({ from, type: msg.type }, '[whatsapp] inbound message')

    // ── Resolve dealer identity first ────────────────────────────────────────
    const dealer = await resolveDealer(from, pool)

    // ── Text message ─────────────────────────────────────────────────────────
    if (msg.type === 'text') {
        const text = msg.text?.body?.trim()
        if (!text) return

        // Unknown phone — send onboarding prompt and stop
        if (!dealer) {
            logger.info({ from }, '[whatsapp] unknown phone — sending onboarding prompt')
            await sendWhatsAppMessage(from, fmtUnknownDealer())
            return
        }

        logger.info(
            { from, user_id: dealer.user_id, role: dealer.role },
            '[whatsapp] dealer identified'
        )

        if (await handleDealerCommand(from, dealer, text)) {
            return
        }

        const intent = parseIntent(text)
        logger.debug({ intent }, '[whatsapp] parsed intent')

        // ── Help message — fast path ──────────────────────────────────────
        if (intent.intent === 'help') {
            await sendWhatsAppMessage(from, formatReply([], intent))
            return
        }

        // ── Image request — fast path ─────────────────────────────────────
        if (intent.intent === 'image_request') {
            await handleImageRequest(from, intent.than_code)
            return
        }

        // ── Inventory search — fast path ──────────────────────────────────
        let results = []
        try {
            results = await queryInventory(intent, pool)
        } catch (err) {
            logger.error({ err }, '[whatsapp] queryInventory failed')
        }

        const { confident } = confidenceCheck(results, intent)
        if (confident) {
            await sendWhatsAppMessage(from, formatReply(results, intent))
            return
        }

        // ── Dealer agent fallback — personalised, scoped to user_id ──────
        logger.info({ from, user_id: dealer.user_id }, '[whatsapp] routing to dealerAgentFallback')
        const agentReply = await dealerAgentFallback(text, pool, {
            userId:   dealer.user_id,
            phone:    from,
            shopName: dealer.retailer_name || dealer.full_name || dealer.username,
        })

        if (agentReply) {
            await sendWhatsAppMessage(from, agentReply)
            return
        }

        // Final fallback — human salesperson
        await fallbackToSalesperson(from, text)
    }

    // ── Image message — image cataloging pipeline ─────────────────────────────
    else if (msg.type === 'image') {
        const mediaId = msg.image?.id
        const caption = msg.image?.caption?.trim()?.toUpperCase()
        if (!mediaId) return

        logger.info({ from, mediaId, caption }, '[whatsapp] inbound image')

        try {
            const imageUrl = await fetchMetaMediaUrl(mediaId)

            if (caption) {
                let conn
                try {
                    conn = await pool.getConnection()
                    const result = await conn.query(
                        'UPDATE thans SET image_url = ? WHERE UPPER(than_code) = ?',
                        [imageUrl, caption]
                    )
                    const matched = Number(result.affectedRows) > 0
                    logger.info({ caption, matched }, '[whatsapp] image cataloged')
                    await sendWhatsAppMessage(from,
                        matched
                            ? `Image saved for ${caption}. Thank you!`
                            : `Image received but than code "${caption}" was not found. Please check and resend.`
                    )
                } finally {
                    if (conn) conn.release()
                }
            } else {
                await sendWhatsAppMessage(from,
                    'Image received! To attach it to a product, resend with the than code as caption (e.g. T-112).'
                )
            }
        } catch (err) {
            logger.error({ err }, '[whatsapp] image cataloging failed')
            await sendWhatsAppMessage(from, 'Sorry, could not process the image. Please try again.').catch(() => {})
        }
    }
}

// ── Image request handler ─────────────────────────────────────────────────────
async function handleImageRequest(from, thanCode) {
    let conn
    try {
        conn = await pool.getConnection()
        const [row] = await conn.query(
            `SELECT than_id, than_code, fabric_type, color, design,
                    remaining_stock, selling_price, image_url
             FROM thans WHERE UPPER(than_code) = ?`,
            [thanCode.toUpperCase()]
        )
        if (!row) {
            await sendWhatsAppMessage(from, `Than code "${thanCode}" not found. Please check and try again.`)
            return
        }
        if (!row.image_url) {
            await sendWhatsAppMessage(from,
                `${thanCode} — ${row.fabric_type} ${row.color || ''}\n` +
                `Rs. ${row.selling_price}/m | ${row.remaining_stock}m available\n\n` +
                `No image uploaded yet for this item.`
            )
            return
        }
        await sendWhatsAppMessage(from,
            `${thanCode} — ${[row.fabric_type, row.color, row.design].filter(Boolean).join(' ')}\n` +
            `Rs. ${row.selling_price}/m | ${row.remaining_stock}m available\n\n` +
            `${row.image_url}`
        )
    } catch (err) {
        logger.error({ err }, '[whatsapp] handleImageRequest failed')
        await sendWhatsAppMessage(from, 'Sorry, could not fetch that image right now.').catch(() => {})
    } finally {
        if (conn) conn.release()
    }
}

// ── POST /api/whatsapp/send — internal programmatic send ─────────────────────
router.post('/send', checkPermission('MANAGE_SYSTEM'), async (req, res) => {
    const { to, message } = req.body
    if (!to || !message) {
        return res.status(400).json({ error: 'to and message are required' })
    }
    if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
        return res.status(503).json({ error: 'WhatsApp not configured.' })
    }
    try {
        const result = await sendWhatsAppMessage(to, message)
        res.json({ ok: true, meta: result })
    } catch (err) {
        logger.error({ err }, '[whatsapp] /send error')
        res.status(500).json({ error: err.message })
    }
})

export default router

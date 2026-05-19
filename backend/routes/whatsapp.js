// routes/whatsapp.js — Meta Cloud API WhatsApp webhook
// Phase 9: Dealer identity resolution wired in
//
// Endpoints:
//   GET  /api/whatsapp/webhook  — Meta verification handshake
//   POST /api/whatsapp/webhook  — inbound message handler (async pattern)
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
import { fmtUnknownDealer }        from '../services/dealerMessageFormatter.js'

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
router.get('/webhook', (req, res) => {
    const mode      = req.query['hub.mode']
    const token     = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        logger.info('[whatsapp] Webhook verified by Meta')
        return res.status(200).send(challenge)
    }
    logger.warn({ mode, token }, '[whatsapp] Webhook verification failed')
    res.sendStatus(403)
})

// ── POST /api/whatsapp/webhook — inbound message handler ─────────────────────
// Returns 200 immediately — all processing is async.
router.post('/webhook', (req, res) => {
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
})

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

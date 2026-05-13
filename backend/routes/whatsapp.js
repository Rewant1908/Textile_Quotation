// routes/whatsapp.js — Meta Cloud API WhatsApp webhook
// Phase 8: WhatsApp AI System
//
// Endpoints:
//   GET  /api/whatsapp/webhook  — Meta verification handshake
//   POST /api/whatsapp/webhook  — inbound message handler (async pattern)
//   POST /api/whatsapp/send     — internal programmatic send (admin use)
//
// Security:
//   - GET  uses hub.verify_token (shared secret set in Meta App Dashboard)
//   - POST uses X-Hub-Signature-256 HMAC-SHA256 verification
//   - POST returns 200 immediately, processing is async (Meta retries on non-200)
//
// Flow per inbound text message:
//   parseIntent → queryInventory → confidenceCheck
//     → confident  : formatReply → sendWhatsAppMessage
//     → no_results : agentFallback → if still null → fallbackToSalesperson
//     → unknown    : fallbackToSalesperson
//
// Flow per inbound image message:
//   fetchMetaMediaUrl → save image_url on matching than (if caption = than_code)

import { Router }            from 'express'
import { createHmac }        from 'crypto'
import { checkPermission }   from '../middleware/checkPermission.js'
import logger                from '../logger.js'
import pool                  from '../db.js'
import {
    parseIntent,
    queryInventory,
    confidenceCheck,
    formatReply,
    formatWhatsAppNumber,
    sendWhatsAppMessage,
    fetchMetaMediaUrl,
    fallbackToSalesperson,
    agentFallback,
    dealerAgentFallback,
} from '../services/whatsappService.js'

const router = Router()
const DEFAULT_COUNTRY_CODE = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '977'

// ── Signature verification helper ────────────────────────────────────────────
function verifySignature(rawBody, signatureHeader) {
    if (!signatureHeader?.startsWith('sha256=')) return false
    const secret = process.env.WHATSAPP_APP_SECRET
    if (!secret) {
        logger.warn('[whatsapp] WHATSAPP_APP_SECRET not set — skipping signature check (dev mode)')
        return true  // Allow in dev; enforce in production
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

function getPhoneCandidates(input) {
    const raw = String(input || '').replace(/\D/g, '')
    const normalised = formatWhatsAppNumber(raw, DEFAULT_COUNTRY_CODE)
    const local = normalised.startsWith(DEFAULT_COUNTRY_CODE)
        ? normalised.slice(DEFAULT_COUNTRY_CODE.length)
        : raw.replace(/^0+/, '')
    const last10 = normalised.slice(-10)
    return [...new Set([raw, normalised, local, last10].filter(Boolean))]
}

async function findDealerProfileByWhatsapp(from) {
    const candidates = getPhoneCandidates(from)
    if (!candidates.length) return null
    const placeholders = candidates.map(() => '?').join(', ')

    const attempts = [
        { expr: 'COALESCE(r.whatsapp_number, r.phone_number, r.phone)' },
        { expr: 'COALESCE(r.phone_number, r.phone)' },
        { expr: 'COALESCE(r.phone, r.phone_number)' },
        { expr: 'r.phone' },
        { expr: 'r.phone_number' },
    ]

    let conn
    try {
        conn = await pool.getConnection()
        for (const attempt of attempts) {
            try {
                const [row] = await conn.query(
                    `SELECT r.retailer_id, r.shop_name, r.assigned_user_id AS user_id,
                            ${attempt.expr} AS source_phone
                     FROM retailers r
                     WHERE (r.is_deleted = 0 OR r.is_deleted IS NULL)
                       AND r.assigned_user_id IS NOT NULL
                       AND REPLACE(REPLACE(REPLACE(COALESCE(${attempt.expr}, ''), '+', ''), ' ', ''), '-', '')
                           IN (${placeholders})
                     LIMIT 1`,
                    candidates
                )
                if (row) return row
            } catch (err) {
                if (err.code !== 'ER_BAD_FIELD_ERROR') throw err
            }
        }
        return null
    } finally {
        if (conn) conn.release()
    }
}

// ── GET /api/whatsapp/webhook — Meta verification handshake ──────────────────
// Meta sends: hub.mode=subscribe, hub.verify_token, hub.challenge
// We must echo back hub.challenge with 200 if verify_token matches.
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
// IMPORTANT: Must return 200 immediately. All processing is async.
// Meta retries delivery if it receives a non-2xx response.
router.post('/webhook', (req, res) => {
    // Verify signature using raw body buffer attached by server.js
    const sig     = req.headers['x-hub-signature-256']
    const rawBody = req.rawBody  // attached by the rawBody middleware in server.js
    if (rawBody && !verifySignature(rawBody, sig)) {
        logger.warn('[whatsapp] Invalid signature — rejecting')
        return res.sendStatus(403)
    }

    // Acknowledge immediately
    res.sendStatus(200)

    // Process async — errors must not crash the server
    handleInboundAsync(req.body).catch(err =>
        logger.error({ err }, '[whatsapp] Unhandled async error in handleInboundAsync')
    )
})

// ── Async inbound handler ─────────────────────────────────────────────────────
async function handleInboundAsync(body) {
    // Guard: must be a WhatsApp message webhook
    const entry   = body?.entry?.[0]
    const changes = entry?.changes?.[0]
    if (changes?.field !== 'messages') return

    const value    = changes.value
    const messages = value?.messages
    if (!messages?.length) return

    const msg  = messages[0]
    const from = msg.from  // Customer phone number, e.g. '977981234567'

    logger.info({ from, type: msg.type }, '[whatsapp] Inbound message')

    // ── Text message ─────────────────────────────────────────────────────────
    if (msg.type === 'text') {
        const text   = msg.text?.body?.trim()
        if (!text) return
        const dealerProfile = await findDealerProfileByWhatsapp(from)

        if (dealerProfile?.user_id) {
            logger.info({ from, user_id: dealerProfile.user_id }, '[whatsapp] Dealer message detected')
            const lower = text.toLowerCase()
            if (/^(hi|hello|hey|help|menu|start)(\s|$|!)/i.test(lower)) {
                await sendWhatsAppMessage(from, [
                    `Hello ${dealerProfile.shop_name || 'Dealer'} 👋`,
                    '',
                    'You can ask:',
                    '• Show my pending orders',
                    '• Show my receivables',
                    '• My quotation KPIs',
                    '• Ageing stock offers',
                    '• Search red cotton under 180',
                ].join('\n'))
                return
            }

            const dealerReply = await dealerAgentFallback(text, pool, {
                userId: dealerProfile.user_id,
                phone: from,
                shopName: dealerProfile.shop_name,
            })
            if (dealerReply) {
                await sendWhatsAppMessage(from, dealerReply)
                return
            }

            await fallbackToSalesperson(from, `[DEALER:${dealerProfile.user_id}] ${text}`)
            return
        }

        const intent  = parseIntent(text)
        logger.debug({ intent }, '[whatsapp] Parsed intent')

        // Image request — look up than by code and send image URL
        if (intent.intent === 'image_request') {
            await handleImageRequest(from, intent.than_code)
            return
        }

        // Help message
        if (intent.intent === 'help') {
            const reply = formatReply([], intent)
            await sendWhatsAppMessage(from, reply)
            return
        }

        // Inventory search
        let results = []
        try {
            results = await queryInventory(intent, pool)
        } catch (err) {
            logger.error({ err }, '[whatsapp] queryInventory failed')
        }

        const { confident, reason } = confidenceCheck(results, intent)

        if (confident) {
            const reply = formatReply(results, intent)
            await sendWhatsAppMessage(from, reply)
            return
        }

        // Not confident — try agent fallback first
        if (reason === 'no_results' || reason === 'unknown_intent') {
            logger.info({ from, reason }, '[whatsapp] Low confidence — trying agent fallback')
            const agentReply = await agentFallback(text, pool)
            if (agentReply) {
                await sendWhatsAppMessage(from, agentReply)
                return
            }
        }

        // Final fallback — human salesperson
        await fallbackToSalesperson(from, text)
    }

    // ── Image message — image cataloging pipeline ─────────────────────────────
    // Customer sends a photo with caption = than_code (e.g. "T-112")
    // We fetch the image URL from Meta and store it on the than record.
    else if (msg.type === 'image') {
        const mediaId  = msg.image?.id
        const caption  = msg.image?.caption?.trim()?.toUpperCase()
        if (!mediaId) return

        logger.info({ from, mediaId, caption }, '[whatsapp] Inbound image')

        try {
            const imageUrl = await fetchMetaMediaUrl(mediaId)

            if (caption) {
                // Try to attach to a than by caption = than_code
                let conn
                try {
                    conn = await pool.getConnection()
                    const result = await conn.query(
                        'UPDATE thans SET image_url = ? WHERE UPPER(than_code) = ?',
                        [imageUrl, caption]
                    )
                    const matched = Number(result.affectedRows) > 0
                    logger.info({ caption, matched }, '[whatsapp] Image cataloged')

                    const reply = matched
                        ? `Image saved for ${caption}. Thank you!`
                        : `Image received but than code "${caption}" was not found. Please check the code and resend.`
                    await sendWhatsAppMessage(from, reply)
                } finally {
                    if (conn) conn.release()
                }
            } else {
                await sendWhatsAppMessage(from,
                    'Image received! To attach it to a product, please resend with the than code as the caption (e.g. T-112).'
                )
            }
        } catch (err) {
            logger.error({ err }, '[whatsapp] Image cataloging failed')
            await sendWhatsAppMessage(from, 'Sorry, could not process the image. Please try again.')
                .catch(() => {})
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
        // Send details + image URL (WhatsApp will auto-preview https:// URLs)
        await sendWhatsAppMessage(from,
            `${thanCode} — ${row.fabric_type} ${row.color || ''} ${row.design || ''}\n`.trim() +
            `Rs. ${row.selling_price}/m | ${row.remaining_stock}m available\n\n` +
            `${row.image_url}`
        )
    } catch (err) {
        logger.error({ err }, '[whatsapp] handleImageRequest failed')
        await sendWhatsAppMessage(from, 'Sorry, could not fetch that image right now.')
            .catch(() => {})
    } finally {
        if (conn) conn.release()
    }
}

// ── POST /api/whatsapp/send — internal programmatic send ─────────────────────
// Admin-only endpoint. Used for testing or sending proactive messages.
router.post('/send', checkPermission('MANAGE_SYSTEM'), async (req, res) => {
    const { to, message } = req.body
    if (!to || !message) {
        return res.status(400).json({ error: 'to and message are required' })
    }
    if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
        return res.status(503).json({ error: 'WhatsApp not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.' })
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

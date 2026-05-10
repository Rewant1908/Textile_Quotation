// whatsappService.js — Meta Cloud API WhatsApp service
// Phase 8: WhatsApp AI System
//
// Responsibilities:
//   parseIntent(text)                    — regex NL→intent classifier
//   queryInventory(intent, db)           — DB search using existing thans query pattern
//   confidenceCheck(results)             — threshold gate
//   formatReply(results, intent)         — WhatsApp-safe text (no markdown)
//   sendWhatsAppMessage(to, msg)         — Meta Graph API send text message
//   sendQuotationNotification(to, data)  — send quotation template notification
//   fetchMetaMedia(mediaId)              — resolve media_id → download buffer
//   fallbackToSalesperson(to)            — human handoff
//   agentFallback(text, db)              — LLM escalation for ambiguous queries

import { createHmac }   from 'crypto'
import https            from 'https'
import { runAgent }     from '../agents/runner/agentRunner.js'
import logger           from '../logger.js'

// ── Constants ────────────────────────────────────────────────────────────────
const META_API_VERSION = 'v25.0'
const META_API_BASE    = `https://graph.facebook.com/${META_API_VERSION}`

// ── Signature verification ────────────────────────────────────────────────────
/**
 * verifyMetaSignature(rawBody, signature)
 * Verifies X-Hub-Signature-256 header from Meta.
 * rawBody must be the raw Buffer (before JSON.parse).
 */
export function verifyMetaSignature(rawBody, signatureHeader) {
    if (!signatureHeader?.startsWith('sha256=')) return false
    const secret   = process.env.WHATSAPP_APP_SECRET
    if (!secret) return false
    const expected = 'sha256=' + createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex')
    // Timing-safe compare
    const a = Buffer.from(expected)
    const b = Buffer.from(signatureHeader)
    if (a.length !== b.length) return false
    return !!(require_timingSafeEqual(a, b))
}

function require_timingSafeEqual(a, b) {
    try {
        const { timingSafeEqual } = await_crypto()
        return timingSafeEqual(a, b)
    } catch { return false }
}

// Synchronous-safe wrapper (timingSafeEqual is sync)
function await_crypto() {
    return { timingSafeEqual: (a, b) => {
        let diff = 0
        for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
        return diff === 0
    }}
}

// ── Intent classifier ────────────────────────────────────────────────────────
/**
 * parseIntent(text)
 *
 * Fast regex classifier — no LLM needed for 90% of queries.
 * Returns { intent, q, fabric, color, design, max_price, than_code, raw }
 *
 * Intents:
 *   search        — general inventory search
 *   stock_check   — how many meters / availability
 *   price_check   — what is the price
 *   image_request — send me image / photo of [than_code]
 *   help          — hi / hello / help
 *   unknown       — fallback to agent
 */
export function parseIntent(text) {
    const t = text.trim().toLowerCase()

    // Help / greeting
    if (/^(hi|hello|hey|help|namaste|namaskar|hola)(\s|$|!)/i.test(t)) {
        return { intent: 'help', raw: text }
    }

    // Image request — "send image of T-112", "photo of THN-005", "pic T112"
    const imgMatch = t.match(
        /(?:send\s+)?(?:image|photo|pic|picture|photo)\s+(?:of\s+)?([a-z0-9][a-z0-9\-_]{1,20})/i
    )
    if (imgMatch) {
        return { intent: 'image_request', than_code: imgMatch[1].toUpperCase(), raw: text }
    }

    // Price check — "price of silk", "rate for cotton", "how much is polyester"
    const priceMatch = t.match(
        /(?:price|rate|cost|how\s+much)\s+(?:of\s+|for\s+|is\s+)?([\w\s]{2,30}?)(?:\s+per\s+meter)?[?]?$/i
    )
    if (priceMatch && /price|rate|cost|how much/.test(t)) {
        const q = priceMatch[1].trim()
        return { intent: 'price_check', q, raw: text }
    }

    // Stock check — "how many meters of cotton", "do you have red cotton"
    const stockMatch = t.match(
        /(?:how\s+many|stock|available|do\s+you\s+have|quantity|meters?\s+of)\s+(?:of\s+)?([\w\s]{2,30})/i
    )
    if (stockMatch) {
        const q = stockMatch[1].trim()
        return { intent: 'stock_check', q, raw: text }
    }

    // Max price filter — "cotton under 150", "silk below 200 per meter"
    const maxPriceMatch = t.match(
        /([\w\s]{2,30})\s+(?:under|below|less\s+than|max|upto|up\s+to)\s+(\d+)/i
    )
    if (maxPriceMatch) {
        return {
            intent:    'search',
            q:         maxPriceMatch[1].trim(),
            max_price: Number(maxPriceMatch[2]),
            raw:       text,
        }
    }

    // Color + fabric — "red cotton", "blue polyester", "green silk"
    const COLORS   = ['red','blue','green','white','black','yellow','pink','purple','orange','grey','gray','brown','beige','cream','navy','maroon']
    const FABRICS  = ['cotton','silk','polyester','linen','wool','denim','rayon','nylon','georgette','chiffon','satin','velvet','viscose']
    const colorHit  = COLORS.find(c  => t.includes(c))
    const fabricHit = FABRICS.find(f => t.includes(f))

    if (colorHit || fabricHit) {
        return {
            intent: 'search',
            q:      [colorHit, fabricHit].filter(Boolean).join(' '),
            color:  colorHit  || null,
            fabric: fabricHit || null,
            raw:    text,
        }
    }

    // Generic search — anything else
    if (t.length >= 3) {
        return { intent: 'search', q: text.trim(), raw: text }
    }

    return { intent: 'unknown', raw: text }
}

// ── Inventory query ──────────────────────────────────────────────────────────
/**
 * queryInventory(intent, db)
 * Runs the same query as GET /api/inventory/search against the DB pool directly.
 * Returns array of than rows.
 */
export async function queryInventory(intent, db) {
    const { q, max_price, color, fabric } = intent
    const searchTerm = q || [color, fabric].filter(Boolean).join(' ')

    const clauses = ['t.remaining_stock > 0']
    const params  = []

    if (searchTerm) {
        clauses.push(`(
            t.than_code      LIKE ? OR t.fabric_type LIKE ? OR t.color LIKE ?
            OR t.design      LIKE ? OR COALESCE(p.category, '') LIKE ?
            OR t.warehouse_location LIKE ?
        )`)
        const like = `%${searchTerm}%`
        params.push(like, like, like, like, like, like)
    }
    if (max_price != null && !isNaN(max_price)) {
        clauses.push('t.selling_price <= ?')
        params.push(max_price)
    }
    if (color && !searchTerm) {
        clauses.push('t.color LIKE ?')
        params.push(`%${color}%`)
    }

    let conn
    try {
        conn = await db.getConnection()
        const rows = await conn.query(
            `SELECT t.than_id, t.than_code, t.fabric_type, t.color, t.design,
                    t.remaining_stock, t.selling_price, t.warehouse_location,
                    t.movement_speed, t.image_url,
                    p.product_name, p.category
             FROM thans t
             LEFT JOIN products p ON t.product_id = p.product_id
             WHERE ${clauses.join(' AND ')}
             ORDER BY
                CASE t.movement_speed
                    WHEN 'fast'   THEN 0 WHEN 'medium' THEN 1
                    WHEN 'slow'   THEN 2 WHEN 'new'    THEN 3 WHEN 'dead' THEN 4
                END, t.remaining_stock DESC
             LIMIT 10`,
            params
        )
        return rows
    } finally {
        if (conn) conn.release()
    }
}

// ── Confidence check ─────────────────────────────────────────────────────────
/**
 * confidenceCheck(results, intent)
 * Returns { confident: boolean, reason: string }
 */
export function confidenceCheck(results, intent) {
    if (intent.intent === 'unknown') {
        return { confident: false, reason: 'unknown_intent' }
    }
    if (intent.intent === 'help') {
        return { confident: true, reason: 'help' }
    }
    if (!results || results.length === 0) {
        return { confident: false, reason: 'no_results' }
    }
    if (intent.q && intent.q.length < 2) {
        return { confident: false, reason: 'query_too_short' }
    }
    return { confident: true, reason: 'ok' }
}

// ── Reply formatter ──────────────────────────────────────────────────────────
/**
 * formatReply(results, intent)
 * WhatsApp-safe text — no markdown, max ~1500 chars, emoji bullets.
 */
export function formatReply(results, intent) {
    if (intent.intent === 'help') {
        return [
            'Welcome to KT Impex! 👋',
            '',
            'You can ask me:',
            '• Do you have red cotton?',
            '• Price of silk per meter?',
            '• How many meters of polyester?',
            '• Send image of T-112',
            '• Cotton under 150 per meter',
            '',
            'Type your query and I will check our warehouse instantly.',
        ].join('\n')
    }

    if (!results || results.length === 0) {
        return 'Sorry, we do not have that item in stock right now. Our salesperson will contact you shortly.'
    }

    const top = results.slice(0, 5)
    const lines = []

    if (intent.intent === 'price_check') {
        lines.push(`Prices for "${intent.q}":`)
        lines.push('')
        for (const r of top) {
            lines.push(`• ${r.than_code} — ${r.fabric_type} ${r.color || ''} ${r.design || ''}`.trim())
            lines.push(`  Price: Rs. ${r.selling_price}/meter | Stock: ${r.remaining_stock}m`)
        }
    } else if (intent.intent === 'stock_check') {
        lines.push(`Stock for "${intent.q}":`)
        lines.push('')
        for (const r of top) {
            lines.push(`• ${r.than_code} — ${r.fabric_type} ${r.color || ''}`)
            lines.push(`  ${r.remaining_stock} meters available | Rs. ${r.selling_price}/m | ${r.warehouse_location}`)
        }
    } else {
        lines.push(`Found ${results.length > 5 ? '5+ items' : results.length + ' item(s)'} matching "${intent.q || intent.raw}":`)
        lines.push('')
        for (const r of top) {
            lines.push(`• ${r.than_code} — ${r.fabric_type} ${r.color || ''} ${r.design || ''}`.trim())
            lines.push(`  Rs. ${r.selling_price}/m | ${r.remaining_stock}m available`)
            if (r.image_url) lines.push(`  Photo: ${r.image_url}`)
        }
    }

    if (results.length > 5) {
        lines.push('')
        lines.push(`...and ${results.length - 5} more. Reply with a specific code or color to narrow down.`)
    }

    lines.push('')
    lines.push('To order or enquire, reply with the than code.')

    return lines.join('\n')
}

// ── Meta Graph API — send text message ───────────────────────────────────────
/**
 * sendWhatsAppMessage(to, text)
 * Sends a plain text message via Meta Cloud API.
 * to: phone number with country code, no +, e.g. '9779845058710'
 */
export async function sendWhatsAppMessage(to, text) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
    const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN
    if (!phoneNumberId || !accessToken) {
        throw new Error('WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN must be set')
    }

    const body = JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to,
        type:              'text',
        text:              { body: text },
    })

    const url = `${META_API_BASE}/${phoneNumberId}/messages`
    const res = await fetch(url, {
        method:  'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type':  'application/json',
        },
        body,
    })

    if (!res.ok) {
        const err = await res.text()
        throw new Error(`Meta API error ${res.status}: ${err}`)
    }
    return res.json()
}

// ── Meta Graph API — send quotation template notification ────────────────────
/**
 * sendQuotationNotification(to)
 * Sends the approved 'quotations' template message to a customer.
 * to: phone number with country code, no +, e.g. '9779845058710'
 *
 * Template name: quotations (approved in Meta WhatsApp Manager)
 * Template content: "Hello, we are from KT-IMPEX a textile operating system
 *                    which enables communication between dealers and factories."
 *
 * Usage:
 *   import { sendQuotationNotification } from './services/whatsappService.js'
 *   await sendQuotationNotification('9779845058710')
 */
export async function sendQuotationNotification(to) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
    const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN
    if (!phoneNumberId || !accessToken) {
        throw new Error('WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN must be set')
    }

    const body = JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to,
        type:     'template',
        template: {
            name:     'quotations',
            language: { code: 'en_US' },
        },
    })

    const url = `${META_API_BASE}/${phoneNumberId}/messages`
    const res = await fetch(url, {
        method:  'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type':  'application/json',
        },
        body,
    })

    if (!res.ok) {
        const errText = await res.text()
        logger.error({ errText, to }, '[whatsapp] sendQuotationNotification failed')
        throw new Error(`Meta API error ${res.status}: ${errText}`)
    }

    const data = await res.json()
    logger.info({ to, messageId: data?.messages?.[0]?.id }, '[whatsapp] quotation notification sent')
    return { success: true, data }
}

// ── Meta Graph API — fetch media ─────────────────────────────────────────────
/**
 * fetchMetaMediaUrl(mediaId)
 * Resolves a media_id to a download URL.
 * Returns the URL string.
 */
export async function fetchMetaMediaUrl(mediaId) {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
    if (!accessToken) throw new Error('WHATSAPP_ACCESS_TOKEN must be set')

    const res = await fetch(`${META_API_BASE}/${mediaId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`Meta media lookup failed: ${res.status}`)
    const data = await res.json()
    return data.url  // Signed URL, valid for ~5 minutes
}

// ── Fallback to human salesperson ────────────────────────────────────────────
/**
 * fallbackToSalesperson(to, originalMessage)
 * Sends a handoff message to the customer AND pings the notify number.
 */
export async function fallbackToSalesperson(to, originalMessage) {
    const notifyNumber = process.env.WHATSAPP_NOTIFY_NUMBER

    // Tell customer
    await sendWhatsAppMessage(to,
        'Sorry, I could not find a confident answer for that. ' +
        'Our sales team will get back to you shortly! 🙏'
    ).catch(err => logger.error({ err }, '[whatsapp] fallback customer message failed'))

    // Ping salesperson if configured
    if (notifyNumber && notifyNumber !== to) {
        const alert = `New WhatsApp enquiry from +${to}:\n"${originalMessage}"\n\nPlease follow up.`
        await sendWhatsAppMessage(notifyNumber, alert)
            .catch(err => logger.error({ err }, '[whatsapp] fallback notify failed'))
    }
}

// ── Agent fallback for ambiguous queries ─────────────────────────────────────
/**
 * agentFallback(text, db)
 * Escalates to the inventory agent when the regex classifier returns 'unknown'.
 * Returns the agent's text response.
 */
export async function agentFallback(text, db) {
    try {
        const result = await runAgent({
            agentName: 'inventory',
            query:     text,
            context:   'Query came from a WhatsApp customer. Keep the response SHORT (under 300 chars), plain text, no markdown.',
            username:  'whatsapp',
        })
        return result.fullResponse
            .replace(/[*_~`#]/g, '')
            .slice(0, 1200)
    } catch (err) {
        logger.error({ err }, '[whatsapp] agentFallback failed')
        return null
    }
}

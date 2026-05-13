// whatsappService.js — Meta Cloud API WhatsApp service
// Phase 8: WhatsApp AI System
//
// Responsibilities:
//   parseIntent(text)                    — regex NL→intent classifier
//   queryInventory(intent, db)           — DB search using existing thans query pattern
//   confidenceCheck(results, intent)     — threshold gate
//   formatReply(results, intent)         — WhatsApp-safe text (no markdown)
//   formatWhatsAppNumber(phone, cc)      — normalise phone → E.164 without +
//   sendWhatsAppMessage(to, msg)         — Meta Graph API send text message
//   sendQuotationNotification(to)        — send template notification
//   fetchMetaMediaUrl(mediaId)           — resolve media_id → download URL
//   fallbackToSalesperson(to, msg)       — human handoff
//   agentFallback(text, db)              — LLM escalation for ambiguous queries
//
// Template strategy:
//   NODE_ENV=development → 'hello_world' (en_US) — works with Meta test number
//   NODE_ENV=production  → 'quotations'  (en)    — works with real registered number

import { createHmac }   from 'crypto'
import { runAgent }     from '../agents/runner/agentRunner.js'
import { runWithTools } from '../agents/runner/toolRunner.js'
import { buildDealerTools } from '../agents/tools/dealerTools.js'
import { get as cacheGet, set as cacheSet } from '../cache.js'
import logger           from '../logger.js'

// ── Constants ────────────────────────────────────────────────────────────────
const META_API_VERSION = 'v25.0'
const META_API_BASE    = `https://graph.facebook.com/${META_API_VERSION}`

const IS_PROD = process.env.NODE_ENV === 'production'

// Template config — switch automatically based on environment
const TEMPLATE_NAME = IS_PROD ? 'quotations'  : 'hello_world'
const TEMPLATE_LANG = IS_PROD ? 'en'          : 'en_US'

// Default country code used when phone number has no prefix.
// Override via env: WHATSAPP_DEFAULT_COUNTRY_CODE=91  (India)
//                   WHATSAPP_DEFAULT_COUNTRY_CODE=977 (Nepal)
const DEFAULT_COUNTRY_CODE = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '977'
const DEALER_SESSION_TTL_SECONDS = 12 * 60 * 60
const DEALER_SESSION_MAX_MESSAGES = 20

// ── Phone number normaliser ───────────────────────────────────────────────────
/**
 * formatWhatsAppNumber(phone, countryCode?)
 *
 * Accepts any of:
 *   '9845058710'        → '9779845058710'   (10-digit, no prefix)
 *   '+9779845058710'    → '9779845058710'   (leading + stripped)
 *   '9779845058710'     → '9779845058710'   (already correct)
 *   '09845058710'       → '9779845058710'   (leading 0 stripped)
 *
 * Returns a string of digits only, ready to pass to the Meta API.
 */
export function formatWhatsAppNumber(phone, countryCode = DEFAULT_COUNTRY_CODE) {
    // Strip everything except digits
    let cleaned = String(phone).replace(/\D/g, '')

    // Already has the country code prefix → return as-is
    if (cleaned.startsWith(countryCode)) {
        return cleaned
    }

    // Strip a leading 0 (common national-dial format)
    if (cleaned.startsWith('0')) {
        cleaned = cleaned.slice(1)
    }

    return `${countryCode}${cleaned}`
}

// ── Signature verification ────────────────────────────────────────────────────
/**
 * verifyMetaSignature(rawBody, signatureHeader)
 * Verifies X-Hub-Signature-256 header from Meta.
 * rawBody must be the raw Buffer (before JSON.parse).
 */
export function verifyMetaSignature(rawBody, signatureHeader) {
    if (!signatureHeader?.startsWith('sha256=')) return false
    const secret = process.env.WHATSAPP_APP_SECRET
    if (!secret) return false
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

// ── Intent classifier ────────────────────────────────────────────────────────
/**
 * parseIntent(text)
 * Fast regex classifier — no LLM needed for 90% of queries.
 * Returns { intent, q, fabric, color, design, max_price, than_code, raw }
 *
 * Intents: search | stock_check | price_check | image_request | help | unknown
 */
export function parseIntent(text) {
    const t = text.trim().toLowerCase()

    if (/^(hi|hello|hey|help|namaste|namaskar|hola)(\s|$|!)/i.test(t)) {
        return { intent: 'help', raw: text }
    }

    const imgMatch = t.match(
        /(?:send\s+)?(?:image|photo|pic|picture)\s+(?:of\s+)?([a-z0-9][a-z0-9\-_]{1,20})/i
    )
    if (imgMatch) {
        return { intent: 'image_request', than_code: imgMatch[1].toUpperCase(), raw: text }
    }

    const priceMatch = t.match(
        /(?:price|rate|cost|how\s+much)\s+(?:of\s+|for\s+|is\s+)?([\w\s]{2,30}?)(?:\s+per\s+meter)?[?]?$/i
    )
    if (priceMatch && /price|rate|cost|how much/.test(t)) {
        return { intent: 'price_check', q: priceMatch[1].trim(), raw: text }
    }

    const stockMatch = t.match(
        /(?:how\s+many|stock|available|do\s+you\s+have|quantity|meters?\s+of)\s+(?:of\s+)?([\w\s]{2,30})/i
    )
    if (stockMatch) {
        return { intent: 'stock_check', q: stockMatch[1].trim(), raw: text }
    }

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

    const COLORS  = ['red','blue','green','white','black','yellow','pink','purple','orange','grey','gray','brown','beige','cream','navy','maroon']
    const FABRICS = ['cotton','silk','polyester','linen','wool','denim','rayon','nylon','georgette','chiffon','satin','velvet','viscose']
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

    if (t.length >= 3) {
        return { intent: 'search', q: text.trim(), raw: text }
    }

    return { intent: 'unknown', raw: text }
}

// ── Inventory query ───────────────────────────────────────────────────────────
/**
 * queryInventory(intent, db)
 * Runs the same query as GET /api/inventory/search against the DB pool directly.
 */
export async function queryInventory(intent, db) {
    const { q, max_price, color, fabric } = intent
    const searchTerm = q || [color, fabric].filter(Boolean).join(' ')

    const clauses = ['t.remaining_stock > 0']
    const params  = []

    if (searchTerm) {
        clauses.push(`(
            t.than_code LIKE ? OR t.fabric_type LIKE ? OR t.color LIKE ?
            OR t.design LIKE ? OR COALESCE(p.category, '') LIKE ?
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

// ── Confidence check ──────────────────────────────────────────────────────────
export function confidenceCheck(results, intent) {
    if (intent.intent === 'unknown') return { confident: false, reason: 'unknown_intent' }
    if (intent.intent === 'help')    return { confident: true,  reason: 'help' }
    if (!results || results.length === 0) return { confident: false, reason: 'no_results' }
    if (intent.q && intent.q.length < 2)  return { confident: false, reason: 'query_too_short' }
    return { confident: true, reason: 'ok' }
}

// ── Reply formatter ───────────────────────────────────────────────────────────
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

    const top   = results.slice(0, 5)
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
 * to: any phone format — country code is auto-prepended if missing.
 */
export async function sendWhatsAppMessage(to, text) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
    const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN
    if (!phoneNumberId || !accessToken) {
        throw new Error('WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN must be set')
    }

    const normalised = formatWhatsAppNumber(to)
    logger.info({ to, normalised }, '[whatsapp] sendWhatsAppMessage')

    const res = await fetch(`${META_API_BASE}/${phoneNumberId}/messages`, {
        method:  'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type':  'application/json',
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type:    'individual',
            to: normalised,
            type: 'text',
            text: { body: text },
        }),
    })

    if (!res.ok) {
        const err = await res.text()
        throw new Error(`Meta API error ${res.status}: ${err}`)
    }
    return res.json()
}

// ── Meta Graph API — send quotation template notification ─────────────────────
/**
 * sendQuotationNotification(to)
 * Sends the appropriate template based on NODE_ENV:
 *   development → 'hello_world' (en_US) — Meta test number only
 *   production  → 'quotations'  (en)    — real registered number
 *
 * to: any phone format — country code is auto-prepended if missing.
 */
export async function sendQuotationNotification(to, template = {}) {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
    const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN
    if (!phoneNumberId || !accessToken) {
        throw new Error('WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN must be set')
    }

    const normalised = formatWhatsAppNumber(to)
    const body = {
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to: normalised,
        type:     'template',
        template: {
            name:     template.name || TEMPLATE_NAME,
            language: { code: template.language || TEMPLATE_LANG },
        },
    }
    if (Array.isArray(template.components) && template.components.length > 0) {
        body.template.components = template.components
    }

    logger.info({ to, normalised, template: body.template.name, env: process.env.NODE_ENV },
        '[whatsapp] sending template notification')

    const res = await fetch(`${META_API_BASE}/${phoneNumberId}/messages`, {
        method:  'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type':  'application/json',
        },
        body: JSON.stringify(body),
    })

    if (!res.ok) {
        const errText = await res.text()
        logger.error({ errText, to: normalised }, '[whatsapp] sendQuotationNotification failed')
        throw new Error(`Meta API error ${res.status}: ${errText}`)
    }

    const data = await res.json()
    logger.info({ to: normalised, messageId: data?.messages?.[0]?.id, template: body.template.name },
        '[whatsapp] template notification sent')
    return { success: true, data }
}

// ── Meta Graph API — fetch media URL ─────────────────────────────────────────
/**
 * fetchMetaMediaUrl(mediaId)
 * Resolves a media_id to a signed download URL (valid ~5 minutes).
 */
export async function fetchMetaMediaUrl(mediaId) {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
    if (!accessToken) throw new Error('WHATSAPP_ACCESS_TOKEN must be set')

    const res = await fetch(`${META_API_BASE}/${mediaId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`Meta media lookup failed: ${res.status}`)
    const data = await res.json()
    return data.url
}

// ── Fallback to human salesperson ────────────────────────────────────────────
/**
 * fallbackToSalesperson(to, originalMessage)
 * Tells the customer a human will follow up, and pings the notify number.
 */
export async function fallbackToSalesperson(to, originalMessage) {
    const notifyNumber = process.env.WHATSAPP_NOTIFY_NUMBER

    await sendWhatsAppMessage(to,
        'Sorry, I could not find a confident answer for that. ' +
        'Our sales team will get back to you shortly! 🙏'
    ).catch(err => logger.error({ err }, '[whatsapp] fallback customer message failed'))

    if (notifyNumber && notifyNumber !== to) {
        const normalised = formatWhatsAppNumber(to)
        const alert = `New WhatsApp enquiry from +${normalised}:\n"${originalMessage}"\n\nPlease follow up.`
        await sendWhatsAppMessage(notifyNumber, alert)
            .catch(err => logger.error({ err }, '[whatsapp] fallback notify failed'))
    }
}

// ── Agent fallback for ambiguous queries ──────────────────────────────────────
/**
 * agentFallback(text, db)
 * Escalates to the inventory agent when regex classifier returns 'unknown'.
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

function dealerSessionKey(phone) {
    return `whatsapp:dealer:session:${formatWhatsAppNumber(phone)}`
}

export async function getDealerConversation(phone) {
    const key = dealerSessionKey(phone)
    const history = await cacheGet(key)
    return Array.isArray(history) ? history : []
}

export async function appendDealerConversation(phone, role, content) {
    const key = dealerSessionKey(phone)
    const history = await getDealerConversation(phone)
    history.push({ role, content: String(content || '') })
    const trimmed = history.slice(-DEALER_SESSION_MAX_MESSAGES)
    await cacheSet(key, trimmed, DEALER_SESSION_TTL_SECONDS)
}

export async function dealerAgentFallback(text, db, { userId, phone, shopName }) {
    const history = await getDealerConversation(phone)
    const safeHistory = history
        .filter(h => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
        .slice(-DEALER_SESSION_MAX_MESSAGES)

    try {
        const response = await runWithTools({
            systemPrompt: [
                'You are KT Impex WhatsApp assistant for registered dealers.',
                `Dealer user_id=${userId}. Shop=${shopName || 'unknown'}.`,
                'Only use tools for this dealer context.',
                'Never disclose other dealers\' data.',
                'Keep answers plain text, concise, and practical.',
            ].join(' '),
            tools: buildDealerTools(userId),
            userMessage: text,
            history: safeHistory,
            db,
            emit: () => {},
        })

        const cleaned = String(response || '')
            .replace(/[*_~`#]/g, '')
            .slice(0, 1200)

        await appendDealerConversation(phone, 'user', text)
        await appendDealerConversation(phone, 'assistant', cleaned)
        return cleaned
    } catch (err) {
        logger.error({ err, userId }, '[whatsapp] dealerAgentFallback failed')
        return null
    }
}

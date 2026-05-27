// services/dealerResolver.js
// Phase 9: Dealer Identity Resolution
//
// Maps an inbound WhatsApp phone number → a dealer/user record in the DB.
//
// Strategy:
//   1. Normalise the phone number (strip +, spaces, country code variants)
//   2. Look up users/retailers by registered phone (last-10-digit suffix match)
//   3. Cache result in Redis for 10 minutes to avoid repeated DB lookups
//   4. If not found → return null (caller sends onboarding prompt)
//
// Exported:
//   resolveDealer(phone, db?)    → DealerRecord | null
//   clearDealerCache(phone)      → void
//   formatDealerPhone(phone)     → string (digits only, no +)

import pool   from '../db.js'
import logger from '../logger.js'
import { get as cacheGet, set as cacheSet, del as cacheDel } from '../cache.js'

const CACHE_PREFIX   = 'dealer:phone:'
const CACHE_TTL_S    = 600   // 10 minutes for found records
const CACHE_MISS_TTL = 60    // 1 minute for not-found (re-registration works fast)

/**
 * formatDealerPhone(phone)
 * Strips all non-digit characters and leading zeros.
 */
export function formatDealerPhone(phone) {
    return String(phone).replace(/\D/g, '').replace(/^0+/, '')
}

/**
 * resolveDealer(phone, db?)
 *
 * Resolves an inbound WhatsApp phone to a user record.
 * Matches on last 10 digits to handle country-code variants:
 *   '9779845058710' → suffix '9845058710'
 *   '919845058710'  → suffix '9845058710'
 *
 * @returns {Promise<DealerRecord|null>}
 * DealerRecord: { user_id, username, full_name, email, role,
 *                 whatsapp_phone, contact_phone, is_active,
 *                 retailer_id, retailer_name }
 */
export async function resolveDealer(phone, db = pool) {
    const cleaned = formatDealerPhone(phone)
    if (!cleaned) return null

    const cacheKey = CACHE_PREFIX + cleaned

    // ── Cache check ──────────────────────────────────────────────────────────
    try {
        const cached = await cacheGet(cacheKey)
        if (cached !== null && cached !== undefined) {
            logger.debug({ phone: cleaned }, '[dealerResolver] cache hit')
            // cacheGet may return parsed object already depending on cache.js impl
            return typeof cached === 'string' ? JSON.parse(cached) : cached
        }
    } catch (_) { /* Redis miss is non-fatal */ }

    // ── DB lookup ─────────────────────────────────────────────────────────────
    let conn
    try {
        conn = await db.getConnection()

        // Match on last 10 digits to tolerate country-code / local phone variants.
        const suffix = cleaned.slice(-10)

        const rows = await conn.query(
            `SELECT
                u.user_id,
                u.username,
                u.full_name,
                u.email,
                u.role,
                u.whatsapp_phone,
                u.contact_phone,
                u.is_active,
                r.retailer_id,
                r.shop_name AS retailer_name
             FROM users u
             LEFT JOIN retailers r
                    ON r.assigned_user_id = u.user_id
                   AND r.is_deleted = 0
             WHERE u.is_active = 1
               AND (
                    RIGHT(REPLACE(REPLACE(REPLACE(COALESCE(u.whatsapp_phone,''),'+',''),'-',''),' ',''), 10) = ?
                 OR RIGHT(REPLACE(REPLACE(REPLACE(COALESCE(u.contact_phone,''),'+',''),'-',''),' ',''), 10) = ?
                 OR RIGHT(REPLACE(REPLACE(REPLACE(COALESCE(r.phone_number,''),'+',''),'-',''),' ',''), 10) = ?
               )
             LIMIT 1`,
            [suffix, suffix, suffix]
        )

        const dealer = rows?.[0] ?? null

        // ── Cache result ─────────────────────────────────────────────────────
        try {
            await cacheSet(cacheKey, dealer, dealer ? CACHE_TTL_S : CACHE_MISS_TTL)
        } catch (_) { /* non-fatal */ }

        if (dealer) {
            logger.info(
                { user_id: dealer.user_id, role: dealer.role, phone: cleaned },
                '[dealerResolver] dealer identified'
            )
        } else {
            logger.info({ phone: cleaned }, '[dealerResolver] unknown phone — no match')
        }

        return dealer
    } catch (err) {
        logger.error({ err, phone: cleaned }, '[dealerResolver] DB lookup failed')
        return null
    } finally {
        if (conn) conn.release()
    }
}

/**
 * clearDealerCache(phone)
 * Invalidates the cache entry for a given phone number.
 * Call after updating a user's whatsapp_phone.
 */
export async function clearDealerCache(phone) {
    const cleaned = formatDealerPhone(phone)
    if (!cleaned) return
    try {
        await cacheDel(CACHE_PREFIX + cleaned)
    } catch (_) { /* non-fatal */ }
}

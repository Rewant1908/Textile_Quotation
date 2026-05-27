// services/dealerMessageFormatter.js
// Phase 9: WhatsApp response formatters for dealer operational data
//
// All output is WhatsApp-safe:
//   - No markdown (* _ ~ ` #)
//   - Soft cap ~1500 chars per message
//   - Emoji for visual structure
//
// Exports:
//   fmtUnknownDealer()
//   fmtDashboard(summary, dealerName)
//   fmtQuotations(rows)
//   fmtPendingOrders(rows)
//   fmtReceivables(ageing)
//   fmtDispatch(rows, ref?)
//   fmtStockOffers(rows)

const Rs = (n) => `Rs. ${Number(n).toLocaleString('en-IN')}`

const STATUS_EMOJI = {
    draft:    '📝',
    sent:     '📤',
    accepted: '✅',
    declined: '❌',
    pending:  '⏳',
}

function shortDate(d) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
    })
}

// ── Unknown dealer ────────────────────────────────────────────────────────────
export function fmtUnknownDealer() {
    return [
        'Hello! 👋 Welcome to KT Impex.',
        '',
        'Your WhatsApp number is not linked to a dealer account yet.',
        '',
        'Please contact your KT Impex representative to register your number, or visit our portal.',
    ].join('\n')
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function fmtDashboard(summary, dealerName) {
    const name = dealerName || 'Dealer'
    return [
        `Hello ${name}! Here is your KT Impex summary:`,
        '',
        `📋 Pending Quotations : ${summary.pending_quotations}`,
        `💰 Pending Value      : ${Rs(summary.pending_value)}`,
        `⚠️  Outstanding Due    : ${Rs(summary.total_outstanding)}`,
        `🏷️  Stock Offers       : ${summary.offers_available} items`,
        summary.last_activity ? `✅ Last Accepted      : ${shortDate(summary.last_activity)}` : '',
        '',
        'Reply with:',
        '• "my quotations" — view recent quotations',
        '• "pending orders" — check open orders',
        '• "overdue" — view receivables',
        '• "offers" — discounted stock today',
    ].filter(l => l !== null).join('\n')
}

// ── Quotations ────────────────────────────────────────────────────────────────
export function fmtQuotations(rows) {
    if (!rows?.length) {
        return 'You have no quotations yet.'
    }
    const lines = [`Your last ${rows.length} quotation(s):`, '']
    for (const r of rows) {
        const emoji = STATUS_EMOJI[r.status] || '📄'
        lines.push(`${emoji} ${r.quotation_number}`)
        lines.push(`   Customer : ${r.customer_name || '—'}`)
        lines.push(`   Amount   : ${Rs(r.total_amount)}`)
        lines.push(`   Status   : ${r.status}`)
        lines.push(`   Date     : ${shortDate(r.created_at)}`)
        lines.push('')
    }
    return lines.join('\n').slice(0, 1500)
}

// ── Pending Orders ────────────────────────────────────────────────────────────
export function fmtPendingOrders(rows) {
    if (!rows?.length) {
        return '✅ No pending orders right now. All caught up!'
    }
    const lines = [`You have ${rows.length} pending order(s):`, '']
    for (const r of rows) {
        lines.push(`⏳ ${r.ref}`)
        lines.push(`   Customer : ${r.customer_name || '—'}`)
        lines.push(`   Amount   : ${Rs(r.total_amount)}`)
        lines.push(`   Status   : ${r.status}`)
        lines.push(`   Open for : ${r.days_open} day(s)`)
        lines.push('')
    }
    return lines.join('\n').slice(0, 1500)
}

// ── Receivables Ageing ────────────────────────────────────────────────────────
export function fmtReceivables(ageing) {
    if (!ageing || ageing.total === 0) {
        return '✅ No outstanding receivables. All clear!'
    }
    const { total, buckets } = ageing
    const lines = [
        'Receivables Ageing:',
        '',
        `💳 Total Outstanding : ${Rs(total)}`,
        '',
        `🟢 Current (0-30d)   : ${Rs(buckets.current)}`,
        `🟡 Overdue 30-60d    : ${Rs(buckets.overdue_30)}`,
        `🟠 Overdue 60-90d    : ${Rs(buckets.overdue_60)}`,
        `🔴 Overdue 90d+      : ${Rs(buckets.overdue_90)}`,
    ]
    if (buckets.overdue_90 > 0) {
        lines.push('')
        lines.push('⚠️  Action needed on 90d+ amounts. Please follow up.')
    }
    return lines.join('\n')
}

// ── Dispatch Status ───────────────────────────────────────────────────────────
export function fmtDispatch(rows, ref) {
    if (!rows?.length) {
        return ref
            ? `Order "${ref}" not found or not dispatched yet.`
            : 'No active dispatches found.'
    }
    const lines = ['Dispatch / Order Status:', '']
    for (const r of rows) {
        const emoji = STATUS_EMOJI[r.status] || '📦'
        lines.push(`${emoji} ${r.ref}`)
        lines.push(`   Customer : ${r.customer_name || '—'}`)
        lines.push(`   Amount   : ${Rs(r.total_amount)}`)
        lines.push(`   Status   : ${r.status}`)
        lines.push(`   Updated  : ${shortDate(r.updated_at)}`)
        lines.push('')
    }
    return lines.join('\n').slice(0, 1500)
}

// ── Stock Offers ──────────────────────────────────────────────────────────────
export function fmtStockOffers(rows) {
    if (!rows?.length) {
        return 'No special stock offers right now. Check back later!'
    }
    const lines = [
        `🏷️  Special Stock Offers (${rows.length} items):`,
        '(Slow/dead stock — best prices available)',
        '',
    ]
    for (const r of rows) {
        const tag = r.movement_speed === 'dead' ? '🔴 CLEARANCE' : '🟡 SLOW MOVER'
        lines.push(`${tag} — ${r.than_code}`)
        lines.push(`   ${[r.fabric_type, r.color, r.design].filter(Boolean).join(' ')}`)
        if (r.offer_price && Number(r.offer_price) < Number(r.selling_price)) {
            lines.push(`   Offer : ${Rs(r.offer_price)}/m (${r.discount_pct}% off)`)
            lines.push(`   Was   : ${Rs(r.selling_price)}/m | Stock: ${r.remaining_stock}m`)
        } else {
            lines.push(`   Price : ${Rs(r.selling_price)}/m | Stock: ${r.remaining_stock}m`)
        }
        if (r.image_url) lines.push(`   Photo : ${r.image_url}`)
        lines.push('')
    }
    lines.push('To order, reply with the than code.')
    return lines.join('\n').slice(0, 1500)
}

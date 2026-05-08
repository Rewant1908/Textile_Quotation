# Retailer Agent Memory — KT Impex Wholesale Textile
<!-- scope: project | agent: retailer -->
<!-- Update this file by ending a response with MEMORY_UPDATE: ... END_MEMORY -->

## Retailer Intelligence Framework

### Retailer Segmentation
Retailers are segmented into 4 behavioral tiers:

**Tier 1 — Anchor Retailers** (high volume, consistent)
- Order monthly or more frequently
- Average order > 300m
- Payment: prompt (within 7 days)
- Strategy: priority service, early access to new arrivals, relationship calls monthly
- Example behavior: Pre-book festival stock 3–4 weeks in advance

**Tier 2 — Regular Retailers** (medium volume, predictable)
- Order every 4–8 weeks
- Average order 100–300m
- Payment: usually within 15 days
- Strategy: proactive recommendations when new stock arrives in their preferred category

**Tier 3 — Occasional Retailers** (low volume, price-sensitive)
- Order 4–6 times per year
- Average order < 100m
- Payment: mostly cash/immediate
- Strategy: festival timing outreach, dead stock liquidation offers

**Tier 4 — Risky Retailers** (irregular, delayed payment)
- Outstanding balance > ₹30,000 consistently
- Payment pattern: delayed (30–60 days)
- Strategy: require partial payment before new order, limit credit exposure

### Preference Tracking Rules
- When a retailer buys the same fabric type 3+ times → store as confirmed preference
- When a retailer rejects a recommendation 2+ times → remove from suggestion pool
- Price segment: inferred from average transaction price per meter over last 10 orders
- Seasonal pattern: track which months orders spike vs. drop for each retailer

### Known Category Preferences by Market
- **Birgunj main market** — Cotton prints, plain cotton, voile. Price sensitive. Under ₹85/m.
- **Raxaul cross-border buyers** — Premium fabrics, silk blends, georgette. Less price-sensitive.
- **Rural supply retailers** — Basics only. Plain cotton, polyester. Under ₹60/m.
- **Festival specialty retailers** — Embroidered, jacquard, net, silk. Buy 6–8 weeks pre-festival.

### Payment Pattern Definitions
| Pattern | Meaning | Credit Limit Recommendation |
|---|---|---|
| `prompt` | Pays within 7 days | Up to ₹50,000 |
| `regular` | Pays within 15 days | Up to ₹30,000 |
| `delayed` | Pays in 30–60 days | Up to ₹15,000 |
| `problematic` | Pays > 60 days or disputes | Cash only |

### Retailer Memory Update Protocol
When a new behavioral signal is observed (new preference, payment change, order spike), end the response with:
```
MEMORY_UPDATE:
[updated retailer intelligence content here]
END_MEMORY
```
This will be persisted automatically by the agent runner.

## RETAILER SIGNAL Format
Always end retailer-related responses with:
`RETAILER SIGNAL: [recommended action] — [reason]`
Example: `RETAILER SIGNAL: Reach out to Birgunj cotton buyers — 3 new cotton print lots arrived, matches their confirmed preference under ₹80/m`

## Retailer Outreach Calendar
- **4 weeks before Diwali** → call all Tier 1 and Tier 2 retailers, share festival stock preview
- **2 weeks before Eid** → contact voile and cotton print buyers specifically
- **Post-monsoon (Sep)** → contact retailers who ordered in the previous Oct–Nov cycle
- **January** → review outstanding balances from Diwali cycle, follow up collections

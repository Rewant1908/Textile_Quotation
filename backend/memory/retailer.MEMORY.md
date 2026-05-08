# Retailer Agent Memory — KT Impex
_scope: project | last updated: 2026-05-08_
_Per-retailer memory lives in memory/users/{username}/retailer.MEMORY.md (not committed to git)_

---

## Retailer Behavioral Archetypes

Every retailer falls into one of these archetypes. Identify the archetype and apply the matching strategy.

### 1. The Volume Buyer
- **Signals**: Large order size (>₹20,000/order), frequent visits, buys multiple categories
- **Payment**: Usually prompt — they have cash flow
- **Strategy**: Prioritize their requests, offer first look at new arrivals, loyalty discount 3–5%
- **Risk**: Low
- **Recommendation logic**: Show full catalogue, emphasize new arrivals and fast-moving stock

### 2. The Specialist
- **Signals**: Buys only 1–2 categories consistently, expert knowledge, negotiates hard
- **Payment**: Usually prompt
- **Strategy**: Stock their preferred categories deeply, alert them on new arrivals in their niche
- **Risk**: Low — but highly price-sensitive
- **Recommendation logic**: Only show their preferred categories, don't waste time on others

### 3. The Festival Buyer
- **Signals**: Dormant most of the year, large orders 4–6 weeks before festivals
- **Payment**: Usually prompt (festival stock is pre-planned)
- **Strategy**: Proactively contact 6–8 weeks before their festival, reserve stock
- **Risk**: Medium — only active seasonally
- **Recommendation logic**: Festival-specific categories only, time recommendations precisely

### 4. The Bargain Hunter
- **Signals**: Always negotiates, small orders, buys discounted/dead stock
- **Payment**: Prompt for discounted items, delayed for regular pricing
- **Strategy**: Use them for dead stock liquidation — offer liquidation deals first
- **Risk**: Low for liquidation, high for regular margin
- **Recommendation logic**: Always show dead stock first, frame as "special price"

### 5. The Credit Risk
- **Signals**: `payment_pattern = delayed`, `outstanding_balance > ₹10,000`, history of disputes
- **Payment**: Consistently late or partial
- **Strategy**: Limit credit exposure, require partial advance, reduce order size
- **Risk**: High — flag every transaction
- **Recommendation logic**: Standard recommendations but add 2–3% to quoted price to cover credit cost

### 6. The Relationship Buyer
- **Signals**: Buys consistently regardless of price, refers other retailers, trusts recommendations
- **Payment**: May delay occasionally but always settles
- **Strategy**: Invest in relationship — share market intelligence, call proactively
- **Risk**: Low — most valuable retailer type
- **Recommendation logic**: Personalized recommendations based on their shop's end-customer profile

---

## Payment Pattern Intelligence

| Pattern | Definition | Action |
|---|---|---|
| `immediate` | Pays on delivery or same day | Full credit available |
| `7-day` | Pays within a week | Standard credit |
| `30-day` | Pays within a month | Monitor outstanding balance |
| `delayed` | Pays after 30+ days or only partial | Restrict credit, require advance |

**Outstanding balance thresholds:**
- < ₹5,000: Normal — no action
- ₹5,000–15,000: Monitor — mention gently on next visit
- ₹15,000–30,000: Flag — require partial payment before new order
- > ₹30,000: Block new credit — cash only until cleared

---

## Festival Buying Intelligence

### Pre-Festival Window (6–8 weeks before)
- Retailers stock up heavily — this is when to push recommendations
- Volume buyers will place their largest orders of the year
- Festival buyers become active — proactively reach out
- Do NOT offer discounts during this window — demand is high

### Post-Festival (1–2 weeks after)
- Retailers have excess stock — they will not buy until it clears
- Do not push recommendations immediately post-festival
- Use this period for dead stock liquidation to bargain hunters

### Festival-Specific Retailer Patterns
- **Diwali**: All archetypes active — biggest buying window of the year
- **Wedding season**: Specialist and Volume buyers dominant
- **Eid**: Specific regional retailers — track which retailers buy for Eid
- **Navratri/Garba**: Strong in Gujarat — note market location of retailers

---

## Recommendation Logic

### When a retailer asks "what do you have?"
1. Check their `preferred_categories_json` — show those first
2. Check their `seasonal_trends` — align with current season
3. Check their `average_order_size` — recommend in that price range
4. Check current fast-moving thans — prioritize those
5. If they have dead stock affinity (Bargain Hunter) — show liquidation items

### When recommending proactively
1. Check upcoming festivals (next 6–8 weeks)
2. Match festival to category demand (see product.MEMORY.md)
3. Cross-reference retailer's past festival purchases
4. Recommend specific thans with stock > 20 meters (enough to fill their order)

---

## Retailer Memory Template (Per-User Scope)
```
Retailer: [shop_name] | ID: [retailer_id]
Archetype: [Volume/Specialist/Festival/Bargain/CreditRisk/Relationship]
Preferred Categories: [list from preferred_categories_json]
Avg Order Size: ₹[amount]
Payment Pattern: [immediate/7-day/30-day/delayed]
Outstanding Balance: ₹[amount]
Last Visit: [YYYY-MM-DD]
Last Purchase: [category] at ₹[price]/meter
Festival Buying: [which festivals, approx spend]
Market Location: [area/market name]
Personality Notes: [negotiates hard / trusts recommendations / price-sensitive / etc.]
Relationship Score: [1-5]
Agent Notes: [any behavioral patterns observed]
```

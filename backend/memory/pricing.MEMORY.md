# Pricing Agent Memory — KT Impex
_scope: project | last updated: 2026-05-08_

---

## Absolute Pricing Rules (Never Violate)
1. **Never price below `cost_per_meter`** — this is a hard floor, no exceptions
2. **Never give discount > 20%** without admin authorization
3. **Liquidation pricing** (dead stock only): floor at `cost_per_meter + 5%`
4. **New arrival pricing**: always start at target margin, not floor
5. **Festival pricing**: do NOT discount during peak season — demand is high, hold margin

---

## Category Margin Benchmarks (Indian Wholesale Textile)

| Category | Floor Margin | Target Margin | Premium Ceiling | Notes |
|---|---|---|---|---|
| Cotton Plain | 15% | 25% | 35% | High volume, thin margin acceptable |
| Cotton Print | 18% | 30% | 45% | Festival prints command premium |
| Synthetic | 15% | 28% | 40% | Price-sensitive segment |
| Silk | 20% | 35% | 60% | Premium segment — never liquidate cheap |
| Linen | 18% | 32% | 48% | Summer premium justified |
| Denim | 15% | 25% | 38% | Commodity category, compete on price |
| Woolen | 22% | 38% | 55% | Seasonal scarcity allows premium |
| Blended | 15% | 27% | 40% | Depends on cotton % in blend |
| Embroidered | 25% | 45% | 70% | Highest value-add, protect margin |

---

## Dynamic Pricing Logic

### Demand-Based Adjustments
- **High demand (fast movement)**: hold price or increase by 5–8%
- **Normal demand (medium movement)**: maintain target margin
- **Low demand (slow movement)**: reduce by 5–10% to stimulate
- **No demand (dead stock)**: liquidation pricing — cost + 5–10%

### Festival Pricing Strategy
- **6–8 weeks before festival**: hold or increase price by 5–10% (pre-festival stock up)
- **During festival week**: hold at peak price — do not discount
- **Post-festival (1–2 weeks after)**: begin gradual discount on unsold stock
- **Post-festival (3–4 weeks after)**: aggressive liquidation if still unsold

### Retailer-Specific Pricing
- **Premium retailers** (high avg order, low payment delay): can offer 3–5% loyalty discount
- **Regular retailers**: standard pricing
- **New retailers**: standard pricing — do not discount to acquire
- **Delayed payment retailers**: add 2–3% to cover cost of credit

---

## Liquidation Ladder
When a than reaches `movement_speed = dead`, apply this sequence:

1. **Week 1–2**: Offer to top 3 retailers with affinity for that category (standard discount 8–10%)
2. **Week 3–4**: Broaden outreach, discount 12–15%
3. **Week 5–6**: List in WhatsApp catalogue at liquidation price (cost + 5%)
4. **Week 7+**: Consider bundle pricing — pair with fast-moving item at combined discount
5. **Last resort**: Write off if no movement after 90 days at liquidation price

---

## Discount Authorization Levels
- **0–8% discount**: Sales staff can authorize
- **9–15% discount**: Manager authorization required
- **16–20% discount**: Admin authorization required
- **>20% discount**: Owner authorization only — flag immediately

---

## Price Memory — Key Signals
- If margin on a category drops below floor for 3+ consecutive transactions → flag to owner
- If a retailer consistently negotiates below floor → log as red-flag retailer
- If sell-through rate is >80% at current price → increase price by 5% on next restock
- If sell-through rate is <30% at current price → reduce price by 8% immediately

---

## Margin Velocity Formula
`margin_velocity = total_margin_generated / days_in_warehouse`

A than sitting for 45 days with ₹500 margin = velocity of ₹11/day (poor).
A than selling in 7 days with ₹500 margin = velocity of ₹71/day (excellent).

Target margin velocity: **>₹30/day per than**
Liquidation trigger: **<₹5/day and declining**

## Last Verdict
_No verdicts recorded yet. Will populate after first pricing run._

# Procurement Agent Memory — KT Impex
_scope: project | last updated: 2026-05-08_

---

## Supplier Evaluation Matrix

When recommending a supplier, score them on these 5 dimensions:

| Dimension | Weight | How to Score |
|---|---|---|
| Quality Rating | 30% | Use `suppliers.quality_rating` (1–5 scale) |
| Delivery Reliability | 25% | Inverse of `delay_frequency` (low=5, medium=3, high=1) |
| Trend Alignment | 20% | Use `trend_alignment` (strong=5, average=3, weak=1) |
| Price Competitiveness | 15% | Compare `price_range` vs market benchmarks |
| Return Issue History | 10% | Inverse of `return_issues` severity |

**Composite score = weighted average of all 5 dimensions**
Only recommend suppliers with composite score > 3.5/5.

---

## Category Buy Signals

### Strong BUY signals (act within 1 week)
- `remaining_stock < 20%` of normal holding AND `sell_through_rate > 65%`
- Festival is 6–8 weeks away AND relevant category is low
- A fast-moving than sold out completely — reorder same category
- Retailer demand exceeding current inventory for a category

### Moderate BUY signals (plan within 2–3 weeks)
- `remaining_stock < 35%` AND `movement_speed = fast` for 2+ thans in category
- New season approaching (summer/winter) AND seasonal category is low
- A competitor is reportedly out of a category (market intelligence)

### HOLD signals (do not reorder)
- Category has dead stock > 20% of total thans in that category
- Same category was purchased < 30 days ago (avoid over-stocking)
- Supplier quality_rating < 3.0 AND no alternative supplier available
- Post-festival period — wait for stock to clear before reordering

### RED FLAG — Do Not Buy
- Any supplier with `return_issues = severe` AND no quality improvement noted
- Categories where dead stock has been sitting > 90 days without movement
- Heavily discounted bales from unknown suppliers (quality risk)

---

## Seasonal Procurement Calendar

| Month | Buy | Hold | Watch |
|---|---|---|---|
| Jan | — | Woolen (season ending) | Wedding season stock |
| Feb | Linen, Light Cotton | Woolen | Holi prints |
| Mar | Summer fabrics (synthetic, linen) | Heavy cotton | Festival prints |
| Apr | Cotton Plain, Synthetic | Embroidered | Summer peak |
| May | Cotton Print (festival prep) | Woolen, Silk | Monsoon slowdown coming |
| Jun | — | All (monsoon slowdown) | Eid stock if applicable |
| Jul | Begin Diwali prep (cotton print) | Heavy inventory | Festival season approaching |
| Aug | Cotton Print, Embroidered | — | Navratri prep |
| Sep | **ALL fast categories — peak season** | Dead stock categories | Diwali in Oct/Nov |
| Oct | Silk, Embroidered, Premium Cotton | Synthetic (winter coming) | Diwali week |
| Nov | Woolen, Silk (wedding season) | Summer fabrics | Wedding season peak |
| Dec | Woolen (peak), Wedding fabrics | Linen, Light Synthetic | Year-end clearance |

---

## Reorder Quantity Logic
- **Normal reorder**: 2–3 bales (Gathris) per category
- **Festival reorder**: 4–6 bales — higher demand justifies larger buy
- **Test reorder** (new supplier/category): 1 bale only — validate quality before scaling
- **Never reorder > 6 bales** of a single category at once without owner approval

## Bale Quality Assessment at Purchase
- Request fabric samples before confirming order
- Check GSM consistency across rolls in a bale
- Verify meter count per roll (standard: 14–17 meters)
- Confirm color fastness for printed fabrics
- Inspect for weaving defects on first roll of every bale

---

## Cost Calculation Rules
`cost_per_meter = (bale_purchase_cost + transport_cost) / total_meters_in_bale`

Example:
- Bale cost: ₹15,000
- Transport: ₹500
- Total meters (15 rolls × 17m): 255 meters
- Cost per meter: ₹15,500 / 255 = **₹60.78/meter**

Always use this formula — never estimate cost per meter.

## Last Verdict
_No verdicts recorded yet. Will populate after first procurement run._

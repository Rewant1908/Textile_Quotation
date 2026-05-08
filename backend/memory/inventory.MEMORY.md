# Inventory Agent Memory — KT Impex
_scope: project | last updated: 2026-05-08_

---

## Dead Stock Classification Thresholds
- **dead**: remaining_stock > 0 AND no stock_out in **60+ days**
- **slow**: last stock_out was **30–59 days** ago
- **medium**: last stock_out was **8–29 days** ago
- **fast**: last stock_out was within **7 days**
- **new**: never sold (no stock_out recorded yet)

These thresholds are enforced by `trg_update_movement_speed_after_stock_out` DB trigger.
Do NOT override these values in responses — they are system ground truth.

---

## Category Velocity Benchmarks (Wholesale Textile — Indian Market)

| Category | Expected Sell-Through (90 days) | Dead Stock Risk | Notes |
|---|---|---|---|
| Cotton Plain | 70–85% | Low | Year-round demand, staple category |
| Cotton Print | 65–80% | Low-Medium | Festival prints move fast, plain prints slow |
| Synthetic | 50–70% | Medium | Season-sensitive, summer drops sharply |
| Silk | 40–65% | Medium-High | Festival-dependent, slow in off-season |
| Linen | 45–60% | Medium | Summer peak, near-dead in winter |
| Denim | 60–75% | Low-Medium | Consistent but slow for non-standard weights |
| Woolen | 35–55% | High | Extremely seasonal — Oct to Feb only |
| Blended | 55–70% | Medium | Depends on specific blend, cotton-poly fastest |
| Embroidered | 30–50% | High | Very festival-dependent, risky to overstock |

---

## Seasonal Movement Patterns

### Peak Demand Months (Indian Wholesale Textile)
- **January**: Wedding season stock liquidation, moderate demand
- **February–March**: Slow period — Holi prints pick up in March
- **April–May**: Summer fabrics peak (linen, light cotton, synthetic)
- **June–July**: Monsoon slowdown — minimal movement
- **August**: Raksha Bandhan + back-to-school moderate spike
- **September–October**: **PEAK** — Navratri + Dussehra + Diwali prep
- **October–November**: **HIGHEST PEAK** — Diwali season, all categories move fast
- **November–December**: Wedding season peak — silk, embroidered, premium cotton
- **December**: Year-end clearance + Christmas market (limited)

### Festival-Specific Demand Signals
- **Diwali** (Oct–Nov): Cotton print, silk, embroidered — expect 2–3x normal velocity
- **Navratri** (Sep–Oct): Chaniya choli fabrics, bright colors, embroidered — regional but strong
- **Eid** (variable): Cotton, linen, light synthetic — 6–8 weeks before Eid
- **Wedding Season** (Nov–Jan, Apr–May): Silk, embroidered, premium blended
- **Holi** (Feb–Mar): Cotton plain (for color-safe use), budget segment
- **Summer** (Apr–Jun): Linen, light cotton, light synthetic

---

## Warehouse Intelligence Rules

### Shelf Placement Priority
- Fast-moving thans → ground floor / most accessible shelves
- New arrivals → mid-shelf, awaiting velocity classification
- Slow-moving thans → back shelves, clearly labeled
- Dead stock → dedicated liquidation zone (separate from active inventory)

### Low Stock Alert Triggers
- Alert when `remaining_stock < 20% of original meter_length`
- Critical alert when `remaining_stock < 10% of original meter_length`
- Never alert on dead stock (irrelevant to reorder)

### Inventory Count Rules
- Count by `than_id` (individual roll), not by bale
- Remaining stock measured in **meters**
- Cost basis: `cost_per_meter` (includes transport cost allocation)

---

## Margin Intelligence
- Minimum acceptable margin: **15% above cost_per_meter**
- Target margin: **25–40%** depending on category
- Dead stock exception: accept **5–10% margin** to liquidate (better than zero)
- Never sell below `cost_per_meter` under any circumstance

---

## Reorder Signal Logic
- If a category has <20% remaining stock AND sell-through rate >60% → **BUY signal**
- If a category has >40% dead stock → **HOLD signal** (do not reorder)
- If a new season is 6–8 weeks away AND relevant category is low → **EARLY BUY signal**

---

## Agent Behavior Rules
- Always check `movement_speed` field before making stock recommendations
- Cross-reference `seasonal_trends` on retailer table when recommending categories
- When flagging dead stock, always suggest a specific retailer likely to buy it
- Never recommend purchasing more of a category that already has dead stock > 20% of total

## Last Verdict
_No verdicts recorded yet. Will populate after first analysis run._

# Inventory Agent Memory — KT Impex Wholesale Textile
<!-- scope: project | agent: inventory -->
<!-- Update this file by ending a response with MEMORY_UPDATE: ... END_MEMORY -->

## Inventory Structure Knowledge

### The Bale → Than Hierarchy
- **Gathri/Bale** = parent unit. Factory-packed. Contains 14–15 rolls.
- **Than (Roll)** = sellable unit. ~17 meters per roll average.
- One bale breakdown generates approximately 210–255 meters of sellable stock.
- Cost per meter = (bale purchase cost + transport cost) / total meters from that bale.

### Movement Speed Thresholds
The `movement_speed` ENUM on the `thans` table is maintained by database trigger `trg_update_movement_speed_after_stock_out`.
Thresholds (days since last stock-out):
- **`new`** — just cataloged, no stock-out event yet (< 7 days in system)
- **`fast`** — last stock-out within 14 days
- **`medium`** — last stock-out 14–45 days ago
- **`slow`** — last stock-out 45–90 days ago
- **`dead`** — no stock-out in 90+ days

IMPORTANT: `movement_speed` is only recalculated on stock-out events via trigger. Newly registered thans start as `new` and will not show `fast` until first sale.

### Dead Stock Definition and Alert Thresholds
- **Alert level 1** (slow): 45–90 days. Proactive discount suggestion (up to 8%).
- **Alert level 2** (dead): 90–120 days. Liquidation pricing recommended. Move to Zone D.
- **Alert level 3** (critical dead): 120+ days. Bundle with fast-movers. Consider write-off if < 5m remaining.
- Dead stock value > 15% of total stock value → operational capital risk. Escalate to coordinator.

### Sell-Through Rate Benchmarks
Category benchmarks (what's normal for KT Impex):
| Category | Expected Sell-Through (30 days) |
|---|---|
| Cotton prints | 70–90% |
| Plain cotton | 60–80% |
| Voile | 65–85% |
| Polyester blends | 40–60% |
| Georgette | 50–70% |
| Jacquard | 30–50% |
| Embroidered | 20–40% |
| Silk blends | 20–35% |
| Shawl / woollen | 10–25% (seasonal) |

### Margin Velocity Definition
Margin velocity = total margin earned per meter per day of storage.
Formula: `(selling_price - cost_per_meter) × quantity_sold / days_in_warehouse`

High margin velocity = fast-moving AND high-margin. These are the business's best performers.
Low margin velocity = slow-moving OR low-margin. These are capital inefficiency signals.

### Inventory Valuation Method
- Stock value = `remaining_stock × cost_per_meter` per than.
- Total portfolio value = sum of all active thans.
- Dead stock as % of total = key health metric. Target: < 10%.

### Seasonal Inventory Patterns
| Period | Expect | Action |
|---|---|---|
| Aug–Sep | New festival stock arriving | Fast bale breakdown, Zone A placement |
| Oct–Nov (Diwali) | Peak sales velocity | Monitor Zone A depletion daily |
| Dec–Jan | Post-festival slowdown | Begin dead stock review |
| Feb–Mar | Pre-Holi restocking | Cotton prints and voile demand rises |
| Apr–May | Eid preparation | Cotton and lawn print demand |
| Jun–Jul | Monsoon slowdown | Synthetic slightly better, overall slow |

## VERDICT Format
Always end inventory responses with:
`VERDICT: [stock health assessment] — [top 1–2 recommended actions]`
Example: `VERDICT: Dead stock at 18% of portfolio value (critical) — Immediate Zone D consolidation + 12% liquidation discount on jacquard and embroidered lots`

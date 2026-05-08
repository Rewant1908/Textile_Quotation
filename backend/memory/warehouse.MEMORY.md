# Warehouse Agent Memory — KT Impex Wholesale Textile
<!-- scope: project | agent: warehouse -->
<!-- Update this file by ending a response with MEMORY_UPDATE: ... END_MEMORY -->

## Warehouse Layout Knowledge

### Current Rack / Zone System
The warehouse uses a zone-rack-shelf location system: `{Zone}-{Rack}-{Shelf}`.
Example location codes: `A-1-1`, `B-3-2`, `C-2-4`.
- **Zone A** — Fast-moving stock (cotton prints, plain cotton, voile). High-rotation area near dispatch.
- **Zone B** — Medium-movement stock (polyester blends, jacquards, embroidered fabrics).
- **Zone C** — Slow and seasonal stock (heavy silks, wools, shawl fabric, festival-specific designs).
- **Zone D** — Dead stock holding area. Items here are candidates for liquidation.
- **Unassigned** — New arrivals pending cataloging. Should be cleared within 48 hours of bale breakdown.

### Placement Rules
- Fast-moving items (`movement_speed = fast`) → Zone A, lower shelves for easy retrieval.
- New arrivals (unbroken bales) → staging area near Zone B until categorized.
- Dead stock → consolidate to Zone D for visibility and liquidation packaging.
- Festival/seasonal stock → Zone C during off-season, promoted to Zone A 4–6 weeks before festival.

## Retrieval Efficiency Rules
- When a retailer requests a specific fabric type + color, check Zone A first.
- If multiple thans of same fabric/color exist, fulfill from the one with least remaining stock (FEFO — First Expiring / Fastest Expiring First) to avoid fragmentation.
- Bundle slow-moving thans with fast-moving ones for combo sales to reduce Zone D accumulation.

## Dead Stock Protocols
- A than reaching `movement_speed = dead` (90+ days no stock-out) should be physically moved to Zone D within 7 days.
- Dead stock list should be reviewed every 2 weeks.
- Liquidation candidates: anything > 120 days dead with > 20m remaining.
- Bundling strategy: pair dead stock with a complementary fast-mover at a combined discounted rate.

## Inventory Movement Types
The `inventory_movements` table tracks 6 movement types:
1. `stock_in` — new bale breakdown, than registered
2. `stock_out` — sale deduction
3. `adjustment` — manual correction (damage, miscounting)
4. `transfer` — location change within warehouse
5. `return` — stock returned by retailer
6. `write_off` — damaged/unsellable stock removed from active inventory

## Space Optimization Signals
- If Zone A occupancy > 80%: promote 20% slowest Zone A items to Zone B.
- If Zone D > 30 thans: trigger liquidation review immediately.
- After every bale breakdown: ensure all new thans have location assigned before end of day.

## Seasonal Warehouse Notes
- Pre-Diwali (Sep–Oct): Expect 30–40% surge in dispatch volume. Pre-stage fast-movers to Zone A lower shelves.
- Post-festival (Nov): Dead stock typically spikes. Begin Zone D consolidation.
- Pre-Eid (varies): Cotton prints and voile demand spikes. Move Zone B cotton to Zone A.
- Monsoon (Jul–Aug): Synthetic and polyester moves faster. Adjust Zone A accordingly.

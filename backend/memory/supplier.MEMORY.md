# Supplier Memory — KT Impex
_scope: project | last updated: 2026-05-08_
_Updated by: ProcurementAgent on analysis runs_

---

## Supplier Evaluation Framework

### 5-Dimension Scoring (use for every supplier comparison)

1. **Quality Rating** (from `suppliers.quality_rating`, 1–5 scale)
   - 5.0: Exceptional — consistent GSM, no defects, accurate meter counts
   - 4.0–4.9: Good — minor issues only, reliable overall
   - 3.0–3.9: Average — occasional quality variance, acceptable
   - 2.0–2.9: Poor — frequent defects, GSM inconsistency
   - < 2.0: Do not use — escalate to owner

2. **Delivery Reliability** (from `delay_frequency`)
   - `low`: Delivers on time consistently → score 5
   - `medium`: Occasional delays (1–2 per season) → score 3
   - `high`: Frequent delays, unreliable → score 1

3. **Trend Alignment** (from `trend_alignment`)
   - `strong`: Consistently offers trending designs, adapts to market → score 5
   - `average`: Mix of trendy and dated designs → score 3
   - `weak`: Mostly dated inventory, slow to adapt → score 1

4. **Price Competitiveness** (from `price_range`)
   - Compare against category benchmarks in product.MEMORY.md
   - Score 5 if 10%+ below market average
   - Score 3 if at market average
   - Score 1 if 10%+ above market average

5. **Return Issue History** (from `return_issues`)
   - None: score 5
   - Minor/rare: score 4
   - Occasional: score 3
   - Frequent: score 1
   - Disputed: score 0 — do not use

**Composite = (Quality×0.30) + (Delivery×0.25) + (Trend×0.20) + (Price×0.15) + (Returns×0.10)**

Minimum composite to recommend: **3.5 / 5.0**

---

## Supplier Segment Profiles

### Premium Segment Suppliers
- Specialization: Silk, Embroidered, Premium Cotton, Linen
- Expected quality_rating: 4.0–5.0
- Price range: 20–40% above commodity suppliers
- Relationship type: Long-term, trust-based — do not switch for small price differences
- Key rule: Never compromise on quality for premium categories — one bad batch destroys retailer trust

### Mid-Market Segment Suppliers
- Specialization: Cotton Plain, Cotton Print, Blended, Denim
- Expected quality_rating: 3.5–4.5
- Price range: At or slightly below market
- Relationship type: Competitive — compare 2–3 suppliers before each order
- Key rule: Negotiate on volume — larger orders command 5–8% price reduction

### Budget Segment Suppliers
- Specialization: Basic Synthetic, Budget Cotton, Commodity Blended
- Expected quality_rating: 3.0–4.0
- Price range: 15–25% below market
- Relationship type: Transactional — switch if better price available
- Key rule: Always sample before large orders — quality variance is high

---

## Procurement Red Flags

Do NOT proceed with an order if any of these apply:
- Supplier `quality_rating` < 2.5 and no improvement noted in last 3 orders
- Supplier `delay_frequency = high` during a pre-festival procurement window
- New supplier with no quality rating — order 1 test bale only, never full volume
- Supplier offering price > 30% below market average — quality risk
- Return dispute unresolved from previous order — hold all new orders
- Supplier changed factory location without notification — request samples first

---

## Order History Intelligence

### What to track after every bale purchase:
- Which supplier, which category, which bales
- Actual meter count vs stated meter count (common discrepancy)
- GSM verification on arrival
- Defect rate (% of rolls with issues)
- Time from order to delivery (actual vs promised)
- Sell-through rate of that bale's thans (tracked 90 days after intake)

### Pattern Recognition:
- If a supplier's bales consistently sell fast → increase order volume 20%
- If a supplier's bales consistently go slow/dead → reduce or stop orders
- If meter count is consistently short → negotiate compensation or switch supplier
- If quality has degraded over last 3 orders → schedule factory visit or switch

---

## Supplier Memory Template
```
Supplier: [supplier_name] | ID: [supplier_id]
Segment: [premium/mid-market/budget]
Specialization: [categories]
Quality Rating: [/5] — last assessed: [date]
Delay Frequency: [low/medium/high]
Trend Alignment: [strong/average/weak]
Price Range: ₹[low]–₹[high] per meter
Return Issues: [none/minor/occasional/frequent/disputed]
Composite Score: [/5]
Last Order: [date] | [category] | [bale count]
Last Order Notes: [quality, delivery, meter count accuracy]
Relationship Notes: [any negotiation history, credit terms, contacts]
Agent Recommendation: [PREFERRED / STANDARD / MONITOR / AVOID]
```

---
<!-- ProcurementAgent appends timestamped MEMORY_UPDATE blocks below -->

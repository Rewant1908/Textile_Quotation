# Sales Agent Memory — KT Impex Wholesale Textile
<!-- scope: project | agent: sales -->
<!-- Update this file by ending a response with MEMORY_UPDATE: ... END_MEMORY -->

## Sales Domain Knowledge

### Business Model
KT Impex operates two parallel sales channels:
1. **Direct Retail Sales** — Retailers visit the warehouse and buy individual Thans directly.
   - Negotiation is face-to-face or via phone.
   - Payment can be cash, UPI, or credit (outstanding balance).
   - Recorded via `transactions` table.
2. **Dealer Quotation Channel** — Dealers/wholesalers request bulk quotations.
   - Quotation is generated with GST, validity window, and line-item breakdown.
   - Recorded via `quotations` + `quotation_items` tables.
   - Status flow: `draft → sent → accepted / rejected`.

### Pricing Rules the Sales Agent Must Know
- **Floor price** = `cost_per_meter × 1.10` (minimum 10% margin, never go below).
- **Standard price** = `selling_price` as set in `thans` table.
- **Festival uplift** = standard price × 1.05 to 1.15 during Diwali, Eid, Navratri windows.
- **Liquidation price** = `cost_per_meter × 1.02` (dead stock — 2% margin acceptable to free capital).
- **Volume discount** = up to 8% discount for orders > 500m in a single transaction.
- Discounts above 10% require admin approval — never suggest them autonomously.

### Payment Patterns by Category
- **Prompt payers** — typically smaller retailers from local Birgunj market. Cash or same-day UPI.
- **Credit payers** — mid-size retailers with outstanding balances. 7–15 day cycle typical.
- **Delayed payers** — large multi-market retailers. 30–60 day cycle. Higher volume, higher risk.
- Outstanding balance > ₹50,000 → flag before accepting new orders without partial payment.

### Sales Velocity by Season
| Season | High Demand | Low Demand |
|---|---|---|  
| Oct–Nov (Diwali) | Cotton prints, embroidered, silk blends | Heavy woollens |
| Mar–Apr (Holi / Navratri) | Bright prints, voile, georgette | Plain cotton |
| Jun–Jul (Eid) | Cotton, voile, lawn prints | Polyester |
| Jan–Feb (off-season) | Basics, plain cotton | All festival fabrics |
| Jul–Aug (Monsoon) | Synthetic, polyester | Silk, embroidered |

### Quotation Best Practices
- Valid window: 7 days standard. 3 days for items with `movement_speed = fast` (price may change).
- Always include `quotation_number` in communication for tracking.
- For orders > 20 line items: split into fabric-category groups for readability.
- Always mention GST applicability in quotation notes.

### Common Sales Queries and How to Respond
- "Cotton print under ₹80" → filter `thans` by `fabric_type = cotton`, `selling_price <= 80`, `status != sold`.
- "What's available in blue" → filter by `color LIKE '%blue%'`, show top 5 by stock availability.
- "Festival stock available?" → filter by seasonal tags in `product.MEMORY.md`, cross-check `movement_speed`.
- "Bulk order 500m+" → apply volume discount logic, check if single than covers or multiple needed.

## SALES SIGNAL Format
When responding, always end with:
`SALES SIGNAL: [recommended action] — [reason]`
Example: `SALES SIGNAL: Offer cotton print lot at ₹75/m to Sharma Textiles — 45 days stagnant, aligns with their price segment`

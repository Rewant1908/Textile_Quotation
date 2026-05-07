# AI Wholesale Textile Operating System
## Phase Progress Report

> **Generated:** 07 May 2026 | **Author:** Rewant Agrawal | **Repo:** CSE250-TextileQuotation

---

## Overall Progress

| Phase | Title | Status | % Done |
|-------|-------|--------|--------|
| 1 | Business Modeling | ✅ Complete | 100% |
| 2 | Problem Definition | ✅ Complete | 100% |
| 3 | System Architecture | ✅ Complete | 100% |
| 4 | Technical Foundation | 🔄 In Progress | 50% |
| 5 | Database Design | 🔄 In Progress | 50% |
| 6 | AI Memory Design | 🔄 Partial | 30% |
| 7 | Inventory Intelligence | 🔶 Defined | 20% |
| 8 | WhatsApp AI System | 🔶 Defined | 10% |
| 9 | Analytics Dashboard | 🔶 Defined | 10% |
| 10 | Agent Orchestration | ⬜ Pending | 0% |
| 11 | Build Roadmap | ⬜ Pending | 0% |

**Overall Completion: ~48%** — Blueprint phases 1–3 are locked. Phases 4–6 are mid-flight. Phases 7–11 are specification-complete but unbuilt.

---

## Phase 1 — Business Modeling ✅ Complete

**Status: 100% — Fully Defined**

All five core business entities are mapped and documented: Bale/Gathri, Than (Roll), Retailer, Supplier/Factory, and Transaction. Every attribute is named, typed, and its business rationale documented. This phase is the strongest part of the blueprint — the entity model is clean, relationship-aware, and AI-ready.

### What's Done
- Gathri as the parent inventory unit with full cost attribution
- Than as the atomic sellable unit with margin, location, and movement speed
- Retailer as a behavioral entity (not just a contact record)
- Supplier modeled with quality, delay, and trend alignment attributes
- Transaction designed as training data for analytics, not just billing

### Architecture Note
Agents load from clean entity definitions. Without this phase being solid, every downstream agent fails. The entity model is the foundation of all AI memory and agent context.

---

## Phase 2 — Problem Definition ✅ Complete

**Status: 100% — All Pain Points Documented**

Six critical operational problems are precisely articulated: Dead Stock, Procurement Mistakes, Retailer Memory Loss, Pricing Inconsistency, Warehouse Confusion, and Sales Coordination. Each problem has a named AI solution.

### Problem → AI Solution Mapping

| Problem | AI Solution |
|---------|-------------|
| Dead Stock | Movement pattern analysis + liquidation alerts |
| Procurement Mistakes | Supplier comparison + trend-aligned recommendations |
| Retailer Memory Loss | Behavioral memory per retailer (preferences, payment, patterns) |
| Pricing Inconsistency | Margin optimization engine with floor prices |
| Warehouse Confusion | Shelf location tracking + retrieval optimization |
| Sales Coordination | WhatsApp automation + catalog generation |

---

## Phase 3 — System Architecture ✅ Complete

**Status: 100% — Agent Map Defined**

The multi-agent architecture is fully specified with a Central Coordinator and 6 specialized agents.

### Agent Roster

| Agent | Core Responsibility | Memory Scope |
|-------|--------------------|--------------|
| Inventory Intelligence | Dead stock detection, turnover, margins | `project` |
| Retailer Intelligence | Preferences, predictions, payment behavior | `user` |
| Procurement Intelligence | Gathri recommendations, supplier comparison | `project` |
| Warehouse Agent | Shelf location, retrieval optimization | `local` |
| Pricing Agent | Margin optimization, liquidation pricing | `project` |
| Sales Communication | WhatsApp automation, catalog, follow-ups | `user` |

### Memory Scope Strategy
Three memory scopes are used across agents:
- `user` — cross-project, persists per retailer/salesperson identity
- `project` — shared across the team via version control
- `local` — machine-specific warehouse data, not committed

---

## Phase 4 — Technical Foundation 🔄 In Progress

**Status: 50% — Stack Chosen, Not Scaffolded**

### Done
- Technology selection: Node.js + TypeScript, PostgreSQL, Redis, Claude API, Next.js, Tailwind CSS
- AI orchestration approach: LangGraph or custom agent runner
- Mobile-first via WhatsApp as the primary interface

### Pending
- [ ] Monorepo scaffold (`/apps/backend`, `/apps/frontend`, `/packages/agents`)
- [ ] Environment config (`.env.example` with all required keys)
- [ ] Database connection layer (connection pooling, migration runner)
- [ ] Agent runner bootstrap — lifecycle order:
  1. Resolve tools
  2. Init DB + MCP connections
  3. Load memory (`MEMORY.md` per agent)
  4. Build system prompt
  5. Run agent loop
  6. Finalize + persist memory snapshot

---

## Phase 5 — Database Design 🔄 In Progress

**Status: 50% — Schema Specified, Not Implemented**

### Tables Specified

```
bales          — parent inventory unit (Gathri)
thans          — atomic sellable unit (Roll)
retailers      — behavioral entity with payment history
transactions   — every sale event (analytics backbone)
inventory_movements — entry/exit/transfer events per than
```

### Pending
- [ ] SQL `CREATE TABLE` statements with full column definitions
- [ ] Migration files (Prisma or db-migrate)
- [ ] Index strategy:
  - `thans(bale_id)` — FK lookup
  - `transactions(retailer_id, created_at)` — retailer history queries
  - `inventory_movements(than_id, movement_date)` — analytics queries
  - `thans(status, arrival_date)` — dead stock detection
- [ ] Seed data for local development

### Critical Design Rule
`inventory_movements` is the analytics backbone — every agent query for dead stock, margin velocity, and retailer affinity runs against this table. Index it aggressively.

---

## Phase 6 — AI Memory Design 🔄 Partial

**Status: 30% — Concept Solid, Implementation Not Started**

### Memory Categories

| Category | Examples | Storage |
|----------|----------|----------|
| Retailer Memory | Preferred categories, avg order size, payment delay, last visit | `MEMORY.md` per retailer |
| Supplier Memory | Quality score, typical delay, trend alignment, last price | `MEMORY.md` per supplier |
| Product Memory | Seasonal movement, margin history, category affinity | `MEMORY.md` per category |

### Pending
- [ ] `MEMORY.md` file templates per agent type
- [ ] Memory write rules — when does each agent update vs. only read memory?
- [ ] Snapshot sync strategy for multi-device salesperson scenarios
- [ ] Vector embedding layer for semantic retailer preference search (e.g., "find retailers who buy heavy cotton sarees in summer")
- [ ] Memory scope enforcement: `user` scope must not leak into `local` scope

---

## Phase 7 — Inventory Intelligence 🔶 Defined

**Status: 20% — Metrics Named, Engine Not Built**

### Metrics Defined

| Metric | Formula | Use |
|--------|---------|-----|
| Sell Through Rate | `Units Sold / Units Purchased` | Procurement guidance |
| Dead Stock Days | `Current Date − Last Movement Date` | Liquidation trigger |
| Margin Velocity | `(Sell Price − Cost Price) / Days In Stock` | Pricing optimization |
| Retailer Affinity | `Category Sales per Retailer / Total Sales` | Recommendation engine |
| Seasonal Movement | `Monthly sales vs. 3-month rolling average` | Buy timing |

### Pending
- [ ] SQL queries implementing each metric against `inventory_movements`
- [ ] Dead stock threshold config (default: 30 days without movement = alert)
- [ ] Scheduled job (cron) to compute Margin Velocity nightly
- [ ] InventoryIntelligenceAgent system prompt with structured verdicts:
  ```
  VERDICT: FAST   — reorder immediately
  VERDICT: SLOW   — monitor, consider discount
  VERDICT: DEAD   — liquidation pricing, alert sales team
  ```

---

## Phase 8 — WhatsApp AI System 🔶 Defined

**Status: 10% — Workflow Mapped, Nothing Built**

### End-to-End Flow

```
Retailer sends WhatsApp message
    ↓
Webhook receives text/image
    ↓
Natural Language → SQL translation (AI layer)
    ↓
Inventory search with margin filter
    ↓
Results ranked by Retailer Affinity score
    ↓
Send photos + price quote back via WhatsApp
```

### WhatsApp API Options
- Meta Cloud API (direct, free tier available)
- Twilio WhatsApp API (easier sandbox, paid)
- Gupshup (India-focused, ISV pricing)

### Pending
- [ ] Vendor selection + webhook setup
- [ ] Image cataloging pipeline — every Than needs photos + category tags on entry
- [ ] Natural language → SQL query translation (core AI task)
- [ ] Async response pattern: reply "Searching inventory..." immediately, push full result when agent completes
- [ ] Security gate before any auto-sent price quote (classify intent before sending)
- [ ] Fallback: if confidence < 0.8, route to human salesperson

---

## Phase 9 — Analytics Dashboard 🔶 Defined

**Status: 10% — Metrics Listed, Dashboard Not Built**

### Dashboard Sections

| Section | Key Metrics |
|---------|-------------|
| Inventory | Total stock value, dead stock %, category breakdown, warehouse heatmap |
| Retail | Top retailers by revenue, payment aging (0-30 / 30-60 / 60+ days), retailer churn risk |
| Procurement | Supplier quality scores, cost per category trend, recommended buy list |
| Profit | Gross margin per category, margin velocity chart, monthly P&L |

### Pending
- [ ] Next.js dashboard scaffold with Tailwind CSS
- [ ] Real-time inventory value widget (aggregated `thans` by status)
- [ ] Dead stock heatmap by warehouse location
- [ ] Retailer payment aging table with color-coded buckets
- [ ] Margin per category bar chart (most actionable procurement metric)
- [ ] Mobile-responsive layout for field salesperson use

---

## Phase 10 — Agent Orchestration ⬜ Pending

**Status: 0% — Architecture Designed, No Code Written**

### Reference Query: "What should we buy next month?"

This procurement query requires 4 agents running in parallel:

```
Coordinator Agent
    ├── TrendAgent        (market + seasonal data)
    ├── InventoryAgent    (current stock levels + dead stock)
    └── PricingAgent      (current margins + supplier quotes)
            ↓
    Coordinator synthesizes outputs
            ↓
    VERDICT: BUY / HOLD / AVOID per Gathri category
```

### Pending (Full Build)
- [ ] `runTextileAgent()` function with full lifecycle management
- [ ] Coordinator agent with restricted `allowedAgentTypes` (no arbitrary spawning)
- [ ] **Parallel fork pattern**: Trend + Inventory + Pricing agents fire simultaneously with byte-identical context prefixes for API cache efficiency
- [ ] `buildForkedMessages()` — all three forks share the same cache prefix
- [ ] Anti-recursive fork guard — agents cannot spawn agents infinitely
- [ ] Coordinator synthesis producing structured `VERDICT` output per category

### Cache Optimization Strategy
Fork children share byte-identical system prompt + context prefixes. All tool results in forked messages are replaced with identical placeholder text. This ensures all three parallel agents hit the same API cache slot — reducing latency and cost by ~60% on parallel procurement queries.

---

## Phase 11 — Build Roadmap ⬜ Pending

**Status: 0% — Stages Planned, Execution Not Started**

### 5-Stage Build Plan

| Stage | Deliverable | Est. Duration | Blocker |
|-------|-------------|---------------|---------|
| 1 — Foundation | DB schema + retailer CRUD + transaction logging | 2–4 weeks | Schema finalization |
| 2 — Analytics | Dashboards + dead stock detection + margin reports | 2–3 weeks | Stage 1 clean data |
| 3 — AI Assistant | Inventory search + retailer memory + recommendations | 3–5 weeks | Stages 1+2 complete |
| 4 — WhatsApp | Catalog pipeline + conversational search + auto-quote | 3–4 weeks | Stage 3 memory layer |
| 5 — Multi-Agent | All 6 agents live + orchestration + parallel fork | Ongoing | Full data history |

### The Real Gate: Stage 1 Data Quality

> **Stage 1 is not optional prep — it is the moat.**

If retailer transactions are recorded sloppily in Stage 1, the RetailerIntelligenceAgent in Stage 3 will produce generic noise instead of meaningful recommendations. Every AI capability downstream is only as good as the transaction history recorded from Day 1.

**Minimum data requirements before Stage 3 AI is useful:**
- ≥ 3 months of clean transaction records
- Every Than has a recorded entry date, cost price, category, and location
- Every retailer has at least 5 transactions with item-level detail
- Every Gathri has a resolved landed cost (not estimated)

---

## Priority Build Queue

The three files/patterns to implement first, in order:

1. **Agent Memory Layer** — `MEMORY.md` templates + read/write rules per agent scope
2. **Agent Frontmatter Definitions** — `.md` config files per agent with tools, model, permissions, maxTurns
3. **Parallel Fork Engine** — `buildForkedMessages()` for the procurement query coordinator

Everything in Phase 10+ flows from these three patterns working correctly on clean data.

---

*Report auto-generated from blueprint analysis. Update this file at the end of each sprint.*

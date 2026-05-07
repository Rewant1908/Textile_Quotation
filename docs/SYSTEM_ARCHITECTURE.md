# KT Impex — System Architecture (Phase 3)

> Last updated: 07 May 2026

---

## Overview

KT Impex is a **Wholesale Textile Operating System** — not just a quotation tool.
Phase 3 introduces the full multi-agent orchestration layer that sits on top of the
existing Express + MariaDB foundation built in Phases 1–2.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│   React/Vite Frontend    WhatsApp Webhook    Admin Dashboard    │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP / REST
┌────────────────────────────▼────────────────────────────────────┐
│                      EXPRESS API LAYER                          │
│                                                                 │
│  /api/auth        /api/bales       /api/thans                   │
│  /api/retailers   /api/transactions /api/inventory/search       │
│  /api/operations/dashboard                                      │
│                                                                 │
│  ── NEW (Phase 3) ──────────────────────────────────────────    │
│  /api/agents/query        → single agent dispatch               │
│  /api/agents/procurement  → parallel fork (3 agents)            │
│  /api/agents/memory/:scope → read agent memory files            │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                   AGENT ORCHESTRATION LAYER                     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              CoordinatorAgent                            │   │
│  │  Routes queries → forks parallel agents → synthesizes    │   │
│  └──────────┬────────────────────────────────────────────── ┘   │
│             │ single agent          │ parallel fork             │
│    ┌────────▼───────┐    ┌──────────▼──────────────────────┐   │
│    │ Single Dispatch│    │     Procurement Fork             │   │
│    └────────┬───────┘    │  Inventory + Procurement +       │   │
│             │            │  Pricing (simultaneously)        │   │
│             │            └──────────────────────────────────┘   │
│             │                                                   │
│  ┌──────────▼──────────────────────────────────────────────┐   │
│  │               Specialist Agents                          │   │
│  │                                                          │   │
│  │  InventoryAgent    RetailerAgent    ProcurementAgent     │   │
│  │  WarehouseAgent    PricingAgent     SalesAgent           │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      DATA LAYER                                 │
│                                                                 │
│  MariaDB (kt_impex)                  Memory Files              │
│  ─────────────────                  ───────────────            │
│  suppliers  bales  thans            backend/memory/            │
│  retailers  transactions            retailer.MEMORY.md (user)  │
│  inventory_movements                supplier.MEMORY.md (project)│
│  quotations  users                  product.MEMORY.md (project) │
│                                     warehouse.MEMORY.md (local) │
└─────────────────────────────────────────────────────────────────┘
```

---

## Agent Registry

| Agent | File | Memory Scope | Core Responsibility | Verdict Format |
|-------|------|-------------|--------------------|-----------------|
| CoordinatorAgent | `coordinator.agent.md` | project | Route + synthesize | `VERDICT:` |
| InventoryAgent | `inventory.agent.md` | project | Dead stock, margins | `VERDICT: FAST/SLOW/DEAD` |
| RetailerAgent | `retailer.agent.md` | user | Retailer behavior | `RETAILER SIGNAL: VISIT/HOLD/SHOW` |
| ProcurementAgent | `procurement.agent.md` | project | Buy recommendations | `PROCUREMENT VERDICT: BUY/HOLD/AVOID` |
| WarehouseAgent | `warehouse.agent.md` | local | Shelf location | `RETRIEVAL:` |
| PricingAgent | `pricing.agent.md` | project | Margin + liquidation | `PRICING VERDICT: PRICE/LIQUIDATE/HOLD` |
| SalesAgent | `sales.agent.md` | user | WhatsApp catalog | WhatsApp message format |

---

## Memory Scope Strategy

| Scope | Location | Committed to Git | Use Case |
|-------|----------|-----------------|----------|
| `project` | `backend/memory/*.MEMORY.md` | ✅ Yes | Shared supplier + product intelligence |
| `user` | `backend/memory/users/{username}/*.MEMORY.md` | ❌ No | Per-salesperson retailer memory |
| `local` | `backend/memory/local/*.MEMORY.md` | ❌ No | On-site warehouse layout |

---

## Agent Lifecycle (per request)

```
1. Load agent .md definition (frontmatter + system prompt)
2. Resolve memory scope → read MEMORY.md file
3. Build full system prompt = definition prompt + loaded memory
4. Call AI provider (Claude / OpenAI) with system prompt + user query
5. Extract VERDICT block from response
6. If agent signals memory update → writeMemorySnapshot()
7. Return { agentName, verdict, fullResponse, durationMs }
```

---

## Parallel Fork Pattern (Procurement)

For the canonical "What should we buy?" query:

```
Shared context injected into all three forks:
  Date: YYYY-MM-DD | Business Context: [budget, categories]

Fork A: InventoryAgent  → "Which categories are running low or dead?"
Fork B: ProcurementAgent → "Which suppliers should we order from?"
Fork C: PricingAgent    → "What are current margin velocities?"

         ↓ Promise.all() — all three fire simultaneously

Coordinator synthesizes:
  Inventory Signal + Procurement Signal + Pricing Signal
  → VERDICT: BUY / HOLD / AVOID per category
```

Anti-recursive guard: `_FORK_CHILD` env flag prevents fork children from spawning further forks.

---

## API Surface (Phase 3 additions)

| Method | Endpoint | Permission | Description |
|--------|----------|-----------|-------------|
| POST | `/api/agents/query` | VIEW_OPERATIONS | Single agent dispatch |
| POST | `/api/agents/procurement` | VIEW_OPERATIONS | Parallel 3-agent procurement fork |
| GET | `/api/agents/memory/:scope` | VIEW_OPERATIONS | Read agent memory files |

### Example: Single Agent Query
```json
POST /api/agents/query
{
  "agent": "inventory",
  "query": "Which cotton thans have been sitting for more than 30 days?",
  "context": "Focus on warehouse section B"
}
```

### Example: Procurement Fork
```json
POST /api/agents/procurement
{
  "context": "Budget: ₹2,00,000. Focus on Cotton and Suiting categories."
}
```

---

## File Structure (Phase 3)

```
backend/
├── agents/
│   ├── coordinator.agent.md
│   ├── inventory.agent.md
│   ├── retailer.agent.md
│   ├── procurement.agent.md
│   ├── warehouse.agent.md
│   ├── pricing.agent.md
│   ├── sales.agent.md
│   └── runner/
│       ├── agentRunner.js      ← core lifecycle
│       ├── forkRunner.js       ← parallel fork engine
│       └── agentMemory.js      ← memory read/write/snapshot
├── memory/
│   ├── retailer.MEMORY.md      ← user scope template
│   ├── supplier.MEMORY.md      ← project scope template
│   └── product.MEMORY.md       ← project scope template
└── routes/
    └── agents.js               ← Express router for /api/agents/*
```

---

## Next: Phase 4 — Technical Foundation

- [ ] Wire `agentRunner.js` to actual Claude API (`@anthropic-ai/sdk`)
- [ ] Add `ANTHROPIC_API_KEY` to `.env.example`
- [ ] Mount `agentRoutes` in `server.js`: `app.use('/api/agents', agentRoutes)`
- [ ] Add `.gitignore` rules for `backend/memory/users/` and `backend/memory/local/`
- [ ] Write integration test: POST `/api/agents/query` with stub → expect verdict shape

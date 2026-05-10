// backend/agents/runner/agentRegistry.js
// Central tool registry — all agent tool arrays registered here.
import { inventoryTools   } from '../tools/inventoryTools.js'
import { salesTools       } from '../tools/salesTools.js'
import { quotationTools   } from '../tools/quotationTools.js'
import { productTools     } from '../tools/productTools.js'
import { retailerTools    } from '../tools/retailerTools.js'
import { warehouseTools   } from '../tools/warehouseTools.js'
import { supplierTools    } from '../tools/supplierTools.js'
import { transactionTools } from '../tools/transactionTools.js'
import { customerTools    } from '../tools/customerTools.js'
import { userTools        } from '../tools/userTools.js'

// Per-domain registry (for agent-scoped tool lookup)
export const AGENT_TOOL_REGISTRY = {
  inventory:   inventoryTools,
  sales:       salesTools,
  quotation:   quotationTools,
  product:     productTools,
  retailer:    retailerTools,
  warehouse:   warehouseTools,
  supplier:    supplierTools,
  transaction: transactionTools,
  customer:    customerTools,
  user:        userTools,
}

// Flat array of every tool — used by the coordinator / action agent
export const ALL_ACTION_TOOLS = [
  ...quotationTools,
  ...productTools,
  ...retailerTools,
  ...warehouseTools,
  ...inventoryTools,
  ...salesTools,
  ...supplierTools,
  ...transactionTools,
  ...customerTools,
  ...userTools,
]

// Convenience helpers
export function getToolByName(name) {
  return ALL_ACTION_TOOLS.find(t => t.name === name) || null
}

export function getToolNames() {
  return ALL_ACTION_TOOLS.map(t => t.name)
}

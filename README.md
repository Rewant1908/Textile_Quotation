# KT Impex — Textile Quotation & Operations System

> Full-stack B2B wholesale textile platform for KT Impex, Birgunj, Nepal.

---

## 1. Product Overview

The **KT Impex Textile Quotation & Operations System** is a production-ready platform that manages the end-to-end operational lifecycle of a textile wholesale business — from factory sourcing and inventory intake to sales, retailer management, and analytics.

The system supports two roles: **Admin** (full operations access) and **Dealer** (quotation workflow only).

---

## 2. Feature Summary

### Admin Features
- **Operations Dashboard** — Inventory KPIs, sell-through by category, dead-stock alerts, retailer signals, supplier performance
- **Record Sale** — Direct sale against a than (roll), with stock deduction, margin calculation, inventory movement logging, and outstanding balance tracking
- **Retailer Manager** — Add/edit retailers with contact, location, payment pattern, preferred categories, price segment, and outstanding balance
- **Supplier Intelligence** — Full CRUD for suppliers including quality rating, delay frequency, trend alignment, and category specialization
- **Bale Intake** — Register factory bales and break them into individual thans (rolls) with cost, selling price, and warehouse location
- **Quotation Requests** — View all dealer quotations; accept or decline with a mandatory reason
- **Manage Products** — Add, edit, and delete textile products and base pricing
- **Analytics** — Revenue trends, margin analysis, top retailers, category performance
- **AI Warehouse Assistant** — Natural language queries over inventory via Gemini 2.5 Flash

### Dealer Features
- **Register Customer** — Register new customers with phone and email validation
- **Create Quotation** — Multi-item quotation with automatic GST (18%) calculation and price snapshot
- **My Quotations** — View own quotation history with line items, GST breakdown, and status

### System Features
- bcrypt password hashing (10 salt rounds)
- JWT-based authentication
- Role-based access control via `checkPermission()` middleware
- Parameterized SQL queries (SQL injection prevention)
- Transaction rollback on failed multi-step operations
- Redis caching for dashboard and inventory queries
- Automatic margin calculation via DB trigger (`trg_transaction_margin_before_insert`)
- Automatic movement speed tracking via DB trigger (`trg_update_movement_speed_after_stock_out`)
- Auto stock deduction when a quotation is accepted (`trg_quotation_accepted_stock_deduct`)
- CORS restricted to approved frontend origins

---

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Database | MariaDB |
| Backend | Node.js + Express.js (ES Modules) |
| Frontend | React 18 + Vite + JSX |
| HTTP Client | Axios |
| Auth | bcrypt + JWT |
| Cache | Redis (ioredis) |
| AI | Google Gemini 2.5 Flash |
| Styling | CSS (App.css + index.css) |
| Environment | Linux |
| Version Control | GitHub |

---

## 4. User Roles

| Role | Tabs | Key Permissions |
|---|---|---|
| **Admin** | Operations · Record Sale · Retailers · Suppliers · Bale Intake · Quotation Requests · Manage Products · Analytics · AI Assistant | Full read/write across all tables |
| **Dealer** | Register Customer · Create Quotation · My Quotations | Own quotations only; read-only products |

---

## 5. Database Design

The system uses a **MariaDB** relational database (`kt_impex`) with **11 tables** and **3 triggers**.

### Tables

```
users               → user_id, username, password (bcrypt), email, role
suppliers           → supplier_id, supplier_name, factory_name, product_specialization,
                      quality_rating, delay_frequency, price_range, popular_categories,
                      return_issues, trend_alignment
customers           → customer_id, customer_name, contact_phone, email
retailers           → retailer_id, customer_id, shop_name, contact_person, phone,
                      market_location, payment_pattern, preferred_categories,
                      outstanding_balance, preferred_price_segment, notes
products            → product_id, product_name, category, base_price
bales               → bale_id, bale_code, supplier_id, factory_name, arrival_date,
                      purchase_cost, transport_cost, total_rolls, fabric_category,
                      purchase_invoice, status
thans               → than_id, than_code, bale_id, product_id, fabric_type, color,
                      design, gsm, meter_length, cost_per_meter, selling_price,
                      remaining_stock, warehouse_location, movement_speed, status
quotations          → quotation_id, customer_id, user_id, status, total_amount,
                      decline_reason
quotation_items     → item_id, quotation_id, product_id, than_id,
                      quantity, unit_price_at_time
transactions        → transaction_id, retailer_id, quotation_id, than_id, product_id,
                      quantity, price, discount, payment_method, cost_per_meter_at_sale,
                      margin, payment_status, notes, transaction_date
inventory_movements → movement_id, than_id, movement_type, quantity,
                      from_location, to_location, reference_type, reference_id,
                      notes, movement_date
```

### Triggers (added in migration_v2)

| Trigger | Table | Purpose |
|---|---|---|
| `trg_transaction_margin_before_insert` | transactions | Auto-calculates margin on every INSERT |
| `trg_update_movement_speed_after_stock_out` | inventory_movements | Updates than movement speed after each stock-out |
| `trg_quotation_accepted_stock_deduct` | quotations | Auto-deducts stock and creates transaction when quotation is accepted |

![ERD](database/erd.png)

---

## 6. Project Structure

```
CSE250-TextileQuotation/
├── backend/
│   ├── load-env.js            ← dotenv loader (must run before server via --import)
│   ├── server.js              ← Express entry point
│   ├── db.js                  ← MariaDB connection pool
│   ├── cache.js               ← Redis (ioredis) client
│   ├── logger.js              ← Pino structured logger
│   ├── middleware/
│   │   └── checkPermission.js ← RBAC middleware
│   ├── routes/
│   │   ├── auth.js            ← login / signup
│   │   ├── products.js        ← product CRUD
│   │   ├── suppliers.js       ← supplier CRUD
│   │   ├── retailers.js       ← retailer CRUD
│   │   ├── sales.js           ← transactions
│   │   ├── bales.js           ← bale intake + thans
│   │   ├── quotations.js      ← quotation workflow
│   │   ├── operations.js      ← dashboard, inventory, thans
│   │   ├── analytics.js       ← revenue, margin, category trends
│   │   ├── agents.js          ← Gemini AI warehouse assistant
│   │   └── settings.js        ← admin settings
│   ├── .env                   ← DB credentials (not committed)
│   └── .env.example           ← template
├── database/
│   ├── schema.sql             ← all 11 CREATE TABLE statements
│   ├── seed.sql               ← sample data
│   ├── migration_v2.sql       ← adds columns + 3 triggers
│   ├── migration_v3.sql       ← fixes column mismatches
│   └── erd.png                ← Entity Relationship Diagram
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── LoginPage.jsx
│       │   ├── OperationsDashboard.jsx
│       │   ├── SaleRecorder.jsx
│       │   ├── RetailerManager.jsx
│       │   ├── SupplierManager.jsx
│       │   ├── BaleManager.jsx
│       │   ├── QuotationHistory.jsx
│       │   ├── AdminProductManager.jsx
│       │   ├── CustomerForm.jsx
│       │   └── QuotationForm.jsx
│       ├── App.jsx
│       ├── api.js
│       └── App.css
└── README.md
```

---

## 7. API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/signup` | Register new user (bcrypt hashed) |
| `POST` | `/api/auth/login` | Login, returns JWT token + role |

### Products
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/products` | List all products |
| `POST` | `/api/products` | Add product (admin) |
| `PUT` | `/api/products/:id` | Update product (admin) |
| `DELETE` | `/api/products/:id` | Delete product (admin) |

### Suppliers
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/suppliers` | List supplier_id + name (dropdowns) |
| `GET` | `/api/suppliers/full` | Full list with all fields (admin) |
| `POST` | `/api/suppliers` | Add supplier (admin) |
| `PUT` | `/api/suppliers/:id` | Update supplier (admin) |
| `DELETE` | `/api/suppliers/:id` | Delete supplier (admin) |

### Bales & Thans
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/bales` | List all bales with than counts |
| `POST` | `/api/bales` | Register a new bale |
| `GET` | `/api/bales/:id` | Get single bale detail |
| `GET` | `/api/bales/:id/thans` | List thans for a bale |
| `POST` | `/api/bales/:id/thans` | Add thans (bulk) to a bale |

### Retailers
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/retailers` | List all retailers |
| `POST` | `/api/retailers` | Add retailer |
| `PUT` | `/api/retailers/:id` | Update retailer |

### Transactions (Sales)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/transactions` | Sale history (last 200) |
| `POST` | `/api/transactions` | Record a sale (auto-updates stock + balance) |

### Operations
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/operations/dashboard` | Inventory KPIs + signals |
| `GET` | `/api/inventory/search` | Search available thans |
| `GET` | `/api/thans` | List thans with filters |

### Analytics
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/analytics/revenue` | Revenue over time |
| `GET` | `/api/analytics/margins` | Margin analysis |
| `GET` | `/api/analytics/top-retailers` | Top retailers by revenue |
| `GET` | `/api/analytics/categories` | Category performance |

### Quotations
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/quotations` | Create multi-item quotation |
| `GET` | `/api/quotations` | List quotations (scoped by role) |
| `GET` | `/api/quotations/:id` | Single quotation with GST |
| `PATCH` | `/api/quotations/:id/status` | Accept or decline |

### AI Agent
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/agents/warehouse` | Natural language warehouse query |

---

## 8. Installation & Setup

### 1. Clone
```bash
git clone https://github.com/Rewant1908/CSE250-TextileQuotation.git
cd CSE250-TextileQuotation
```

### 2. Database (run in order)
```bash
mariadb -u root -p -e "CREATE DATABASE IF NOT EXISTS kt_impex;"
mariadb -u root -p kt_impex < database/schema.sql
mariadb -u root -p kt_impex < database/migration_v2.sql
mariadb -u root -p kt_impex < database/migration_v3.sql
mariadb -u root -p kt_impex < database/seed.sql
```

### 3. Backend
```bash
cd backend
cp .env.example .env   # fill in DB_HOST, DB_USER, DB_PASSWORD, JWT_SECRET, GEMINI_API_KEY
npm install

# from repo root:
npm start              # production
npm run dev            # development (auto-restart on file change)
```

### 4. Frontend
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`

### Default Login Credentials
| Username | Password | Role |
|---|---|---|
| `admin` | `ktimpex123` | Admin |
| `dealer` | `dealer123` | Dealer |

---

## 9. Security

- **Passwords** hashed with bcrypt (10 salt rounds) — never stored in plaintext
- **JWT** tokens for stateless auth on every protected route
- **RBAC** via `checkPermission()` middleware on every write/admin endpoint
- **Parameterized queries** on all SQL — prevents SQL injection
- **Input validation** — email format, phone length, positive quantities enforced
- **Transaction rollback** — any multi-step operation rolls back fully on failure
- **Rate limiting** — 500 req / 15 min per IP
- **CORS** restricted to approved frontend origins

---

## 10. Ownership & Usage

This repository is maintained for KT Impex operational use. If you plan to deploy or extend it, align changes with the production workflow, data retention policies, and role-based access requirements defined above.

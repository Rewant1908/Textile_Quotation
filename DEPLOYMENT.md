# KT IMPEX — Deployment Guide

Full production deployment for the **backend** (Railway) and **frontend** (Vercel/Railway).

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 18.0.0 | Minimum for ES modules + `fileURLToPath`. Node 20 LTS recommended. |
| MariaDB | ≥ 10.6 | Railway MariaDB plugin or self-hosted |
| Redis | ≥ 6 | Optional — app works without it; enables response caching |
| npm | ≥ 9 | Comes with Node 18+ |

---

## 1. Database Setup

### Run migrations in order

```bash
# From project root
cd backend
node migrations/001_create_users.js
node migrations/002_create_products.js
node migrations/003_create_suppliers.js
node migrations/004_create_bales.js
node migrations/005_create_retailers.js
node migrations/006_create_quotations.js
node migrations/007_create_sales.js
node migrations/008_create_agent_memory.js
```

### Password reset table (Phase 4 Issue 5)

Run this once on your database before enabling the forgot-password flow:

```sql
CREATE TABLE IF NOT EXISTS password_resets (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    token      VARCHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_token (token),
    INDEX idx_user  (user_id)
);
```

---

## 2. Backend — Railway

### Step-by-step

1. **Create a new Railway project** → Add service → Deploy from GitHub repo
2. **Select root directory**: `backend`
3. **Start command**: `node server.js`
4. **Add MariaDB plugin**: Railway dashboard → New Plugin → MariaDB
   - Railway auto-injects `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`
   - Your `db.js` reads `DB_HOST`, `DB_PORT` etc. — set them manually from the plugin's connection variables

### Required environment variables (Railway dashboard → Variables)

```
NODE_ENV=production
PORT=5000

# Database — copy from Railway MariaDB plugin
DB_HOST=<from Railway plugin>
DB_PORT=<from Railway plugin>
DB_USER=<from Railway plugin>
DB_PASSWORD=<from Railway plugin>
DB_NAME=kt_impex

# Auth
JWT_SECRET=<generate: openssl rand -hex 32>
JWT_EXPIRES_IN=8h

# AI
AGENT_PROVIDER=gemini
GEMINI_API_KEY=<your Gemini API key>

# CORS — your Vercel frontend URL
ALLOWED_ORIGIN=https://your-app.vercel.app

# Frontend URL (for password reset links)
FRONTEND_URL=https://your-app.vercel.app

# Redis (if using Railway Redis plugin)
REDIS_URL=<from Railway Redis plugin>
CACHE_ENABLED=true

# Rate limits (optional — defaults are safe for production)
# RATE_LIMIT_GLOBAL=200
# RATE_LIMIT_AGENTS=20
# RATE_LIMIT_AUTH=10

# Logging
LOG_LEVEL=info
```

### Health check

After deploy, visit: `https://your-backend.up.railway.app/api/health`

Expected response:
```json
{ "api": "ok", "database": "connected", "database_name": "kt_impex" }
```

---

## 3. Frontend — Vercel

### Step-by-step

1. **Import repo** on vercel.com → set **Root Directory** to `frontend`
2. **Framework preset**: Vite (auto-detected)
3. **Build command**: `npm run build` (default)
4. **Output directory**: `dist` (default)

### Required environment variables (Vercel dashboard → Settings → Environment Variables)

```
VITE_API_URL=https://your-backend.up.railway.app
```

> **Important**: the variable must start with `VITE_` — Vite only exposes variables
> with that prefix to the browser bundle. All other vars are server-side only.

### Local dev proxy

No `VITE_API_URL` needed in local dev. `frontend/vite.config.js` proxies
`/api/*` → `http://localhost:5000` automatically.

---

## 4. Install new backend dependencies

Two packages added in Phase 4 fixes:

```bash
cd backend
npm install express-rate-limit pino pino-pretty
```

> `pino-pretty` is a devDependency (pretty logs in dev). In production Railway
> uses JSON mode automatically (`NODE_ENV=production`) so `pino-pretty` is
> never required at runtime — but it's safe to install in all environments.

---

## 5. Redis (optional but recommended)

Redis is used for caching dashboard and inventory queries.
The app runs without Redis (falls back to DB queries every time).

To enable:
1. Railway dashboard → Add Plugin → Redis
2. Copy the `REDIS_URL` from the plugin into your environment variables
3. Set `CACHE_ENABLED=true`

---

## 6. Password Reset — Email Provider

The `/api/forgot-password` route generates a reset token and stores it in `password_resets`.
To actually send emails, open `backend/routes/auth.js` and replace the `TODO` block:

```js
// Example: Resend (recommended — already used in this project)
import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY)
await resend.emails.send({
    from:    'KT Impex <no-reply@yourdomain.com>',
    to:      email,
    subject: 'Reset your KT Impex password',
    html:    `<p>Reset link (expires 1 hour): <a href="${resetUrl}">${resetUrl}</a></p>`,
})
```

Then add `RESEND_API_KEY` to your Railway environment variables.

---

## 7. Logs

In production, all backend logs are emitted as newline-delimited JSON (pino default).

- **Railway**: view in the Railway dashboard → Deployments → Logs
- **Structured fields**: every log line contains `{ level, time, agentName, durationMs, ... }`
- **Log level**: set `LOG_LEVEL=warn` in production to reduce noise; `info` is the default

---

## 8. Deferred Items (future phases)

| Item | Phase | Notes |
|------|-------|-------|
| TypeScript migration | Future | Add `tsx` runner, migrate route by route |
| Monorepo scaffold | Future | `apps/backend`, `apps/frontend`, `packages/agents` |
| Integration tests | Future | Vitest + Supertest for routes, agent lifecycle |
| Error monitoring | Future | Add Sentry: `npm install @sentry/node`, wrap `app.listen` |
| Password reset email | Now-ready | Wire Resend in `auth.js` TODO block |

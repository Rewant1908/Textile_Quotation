-- =============================================================================
-- KT IMPEX — migration_v5.sql
-- Phase 9: Dealer identity layer — extend users table
-- Safe to re-run: ADD COLUMN IF NOT EXISTS + MODIFY guards used throughout.
-- =============================================================================

-- ── Extend role enum ──────────────────────────────────────────────────────────
-- Adds 'dealer' and 'salesperson' to the existing admin/user enum.
ALTER TABLE users
    MODIFY COLUMN role
        ENUM('admin', 'user', 'dealer', 'salesperson')
        NOT NULL DEFAULT 'user'
        COMMENT 'admin=full access, dealer=WhatsApp dealer portal, salesperson=field sales, user=legacy';

-- ── Add identity + contact columns ───────────────────────────────────────────
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS full_name
        VARCHAR(100) NULL
        COMMENT 'Display name shown in WhatsApp replies and portal.',

    ADD COLUMN IF NOT EXISTS whatsapp_phone
        VARCHAR(20) NULL
        COMMENT 'E.164 digits without +. Used for WhatsApp identity resolution. Must be unique.',

    ADD COLUMN IF NOT EXISTS contact_phone
        VARCHAR(20) NULL
        COMMENT 'Secondary contact number (optional).',

    ADD COLUMN IF NOT EXISTS is_active
        TINYINT(1) NOT NULL DEFAULT 1
        COMMENT '0 = deactivated account. Deactivated users cannot log in or use WhatsApp.';

-- ── Unique constraint on whatsapp_phone ──────────────────────────────────────
-- Drop first (safe for re-runs), then re-add.
ALTER TABLE users
    DROP INDEX IF EXISTS uq_users_whatsapp_phone;

ALTER TABLE users
    ADD UNIQUE KEY uq_users_whatsapp_phone (whatsapp_phone);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_whatsapp_phone
    ON users (whatsapp_phone);

CREATE INDEX IF NOT EXISTS idx_users_role
    ON users (role);

CREATE INDEX IF NOT EXISTS idx_users_is_active
    ON users (is_active);

-- ── Done ──────────────────────────────────────────────────────────────────────
-- After running this migration:
--   1. mysql -u root -p kt_impex < backend/database/migration_v5.sql
--   2. UPDATE users SET whatsapp_phone='977XXXXXXXXXX', full_name='Name', role='dealer'
--      WHERE user_id = <id>;   ← seed at least one dealer for testing
--   3. git pull + restart the backend
SELECT 'migration_v5 complete' AS status;

-- =============================================================================
-- KT IMPEX — migration_v3.sql
-- Phase 5 database fixes — run ONCE on your MariaDB instance
-- Safe to re-run: ADD COLUMN IF NOT EXISTS guards used throughout.
-- FK constraints use DROP IF EXISTS + ADD pattern (MariaDB <10.5 compat).
-- AFTER clauses removed — new columns appended at end of each table.
-- =============================================================================

-- ── Fix #1: quotation_number column ──────────────────────────────────────────
ALTER TABLE quotations
    ADD COLUMN IF NOT EXISTS quotation_number VARCHAR(20) NULL UNIQUE
        COMMENT 'Human-readable ref: KTQ-YYYY-000001. Set by app after INSERT.';

-- ── Fix #2: quotations.status ENUM extended ───────────────────────────────────
-- draft → sent → accepted | declined  (pending kept as legacy alias for draft)
ALTER TABLE quotations
    MODIFY COLUMN status
        ENUM('draft','pending','sent','accepted','declined')
        NOT NULL DEFAULT 'draft'
        COMMENT 'Lifecycle: draft→sent→accepted|declined. pending=legacy alias for draft.';

-- ── Fix #4: product_id on transactions ────────────────────────────────────────
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS product_id INT NULL
        COMMENT 'Denormalised from thans.product_id at sale time for analytics joins.';

ALTER TABLE transactions
    DROP FOREIGN KEY IF EXISTS fk_transactions_product;

ALTER TABLE transactions
    ADD CONSTRAINT fk_transactions_product
        FOREIGN KEY (product_id) REFERENCES products(product_id)
        ON DELETE SET NULL;

-- ── Fix #7: soft-delete columns — MUST come before indexes below ────────────────
ALTER TABLE retailers
    ADD COLUMN IF NOT EXISTS is_deleted  TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Soft delete flag. 1 = deleted.',
    ADD COLUMN IF NOT EXISTS deleted_at  DATETIME   NULL,
    ADD COLUMN IF NOT EXISTS deleted_by  INT        NULL
        COMMENT 'user_id who deleted this row.';

ALTER TABLE suppliers
    ADD COLUMN IF NOT EXISTS is_deleted  TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'Soft delete flag. 1 = deleted.',
    ADD COLUMN IF NOT EXISTS deleted_at  DATETIME   NULL,
    ADD COLUMN IF NOT EXISTS deleted_by  INT        NULL
        COMMENT 'user_id who deleted this row.';

-- ── Fix #9: assigned_user_id on retailers ─────────────────────────────────────
ALTER TABLE retailers
    ADD COLUMN IF NOT EXISTS assigned_user_id INT NULL
        COMMENT 'FK → users.user_id — salesperson who owns this retailer account.';

ALTER TABLE retailers
    DROP FOREIGN KEY IF EXISTS fk_retailers_assigned_user;

ALTER TABLE retailers
    ADD CONSTRAINT fk_retailers_assigned_user
        FOREIGN KEY (assigned_user_id) REFERENCES users(user_id)
        ON DELETE SET NULL;

-- ── Fix #5: critical indexes — all columns exist by this point ─────────────────
CREATE INDEX IF NOT EXISTS idx_tx_retailer_date
    ON transactions (retailer_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_tx_product
    ON transactions (product_id);

CREATE INDEX IF NOT EXISTS idx_im_than_date
    ON inventory_movements (than_id, movement_date);

CREATE INDEX IF NOT EXISTS idx_im_type
    ON inventory_movements (movement_type);

CREATE INDEX IF NOT EXISTS idx_thans_speed_status
    ON thans (movement_speed, status);

CREATE INDEX IF NOT EXISTS idx_thans_stock
    ON thans (remaining_stock);

CREATE INDEX IF NOT EXISTS idx_retailers_deleted
    ON retailers (is_deleted);

CREATE INDEX IF NOT EXISTS idx_suppliers_deleted
    ON suppliers (is_deleted);

CREATE INDEX IF NOT EXISTS idx_retailers_assigned_user
    ON retailers (assigned_user_id);

-- ── Fix #10: embeddings table for Phase 6 ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS retailer_embeddings (
    embedding_id    INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    retailer_id     INT          NOT NULL,
    embedding_model VARCHAR(64)  NOT NULL DEFAULT 'text-embedding-3-small',
    embedding_json  LONGTEXT     NOT NULL
                    COMMENT 'JSON array of floats: [0.023, -0.14, ...]',
    input_text      TEXT         NULL
                    COMMENT 'The text that was embedded — for re-embedding / debug.',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_embeddings_retailer
        FOREIGN KEY (retailer_id) REFERENCES retailers(retailer_id)
        ON DELETE CASCADE,
    UNIQUE KEY uq_retailer_model (retailer_id, embedding_model)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Phase 6: retailer preference embeddings for semantic similarity search.';

CREATE INDEX IF NOT EXISTS idx_embeddings_retailer
    ON retailer_embeddings (retailer_id);

-- ── Done ──────────────────────────────────────────────────────────────────────
-- After running this migration:
--  1. git pull + restart the backend
--  2. POST /api/admin/recalculate-speeds  → re-classifies dead stock at 60 days
--  3. Create a new quotation → verify quotation_number = KTQ-YYYY-NNNNNN
SELECT 'migration_v3 complete' AS status;

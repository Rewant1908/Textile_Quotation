-- =============================================================================
-- KT IMPEX — migration_v5.sql
-- WhatsApp dealer assistant schema support
-- Safe to re-run: guarded DDL.
-- =============================================================================

-- Optional direct dealer WhatsApp mapping.
ALTER TABLE retailers
    ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(24) NULL
        COMMENT 'Dealer WhatsApp number in digits, e.g. 97798XXXXXXXX';

-- Backfill from existing retailer phone when empty.
UPDATE retailers
   SET whatsapp_number = REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), '+', ''), ' ', ''), '-', '')
 WHERE (whatsapp_number IS NULL OR whatsapp_number = '')
   AND COALESCE(phone, '') <> '';

CREATE INDEX IF NOT EXISTS idx_retailers_whatsapp_number
    ON retailers (whatsapp_number);

SELECT 'migration_v5 complete' AS status;

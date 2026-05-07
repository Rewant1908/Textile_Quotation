-- =============================================================
-- KT IMPEX — Migration v3
-- Fixes column mismatches between backend routes and DB schema.
-- Run ONCE on your local MariaDB:
--   mariadb -u root -p kt_impex < database/migration_v3.sql
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS.
-- =============================================================

-- -------------------------------------------------------------
-- PATCH 1: retailers — add contact_person and phone columns.
-- The original schema used phone_number; all routes expect phone.
-- Data is migrated from phone_number before it is dropped.
-- -------------------------------------------------------------
ALTER TABLE `retailers`
  ADD COLUMN IF NOT EXISTS `contact_person` VARCHAR(150) DEFAULT NULL AFTER `shop_name`,
  ADD COLUMN IF NOT EXISTS `phone`          VARCHAR(20)  DEFAULT NULL AFTER `contact_person`;

-- Copy existing data from phone_number into the new phone column
UPDATE `retailers` SET `phone` = `phone_number` WHERE `phone_number` IS NOT NULL;

-- Drop the old column (ignore error if already dropped on a re-run)
ALTER TABLE `retailers` DROP COLUMN IF EXISTS `phone_number`;

-- -------------------------------------------------------------
-- PATCH 2: transactions — add payment_status and notes columns.
-- The original schema omitted these; routes POST and GET both
-- reference them.
-- -------------------------------------------------------------
ALTER TABLE `transactions`
  ADD COLUMN IF NOT EXISTS `payment_status` ENUM('paid','pending','partial') NOT NULL DEFAULT 'paid' AFTER `margin`,
  ADD COLUMN IF NOT EXISTS `notes`          VARCHAR(500) DEFAULT NULL AFTER `payment_status`;

-- Back-fill payment_status for existing rows:
-- credit/mixed payments are likely pending; cash/bank/upi are paid.
UPDATE `transactions`
SET `payment_status` = CASE
    WHEN payment_method IN ('cash','bank','upi') THEN 'paid'
    ELSE 'pending'
  END
WHERE `payment_status` = 'paid';  -- only touch rows that still have the default

-- =============================================================
-- Migration v3 complete.
-- Tables altered  : retailers    (added contact_person, phone; dropped phone_number)
--                   transactions (added payment_status, notes)
-- =============================================================

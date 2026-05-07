-- =============================================================
-- KT IMPEX — Migration v3
-- Fixes column mismatches between routes and schema.
-- Run once on your local MariaDB:
--   mariadb -u root -p kt_impex < database/migration_v3.sql
-- =============================================================

-- 1. retailers: add contact_person + phone alias
--    Schema has phone_number; routes expect contact_person & phone.
ALTER TABLE `retailers`
  ADD COLUMN `contact_person` varchar(150) DEFAULT NULL AFTER `shop_name`,
  ADD COLUMN `phone`          varchar(20)  DEFAULT NULL AFTER `contact_person`;

-- Copy existing phone_number data into the new phone column, then drop old column.
UPDATE `retailers` SET `phone` = `phone_number` WHERE `phone_number` IS NOT NULL;
ALTER TABLE `retailers` DROP COLUMN `phone_number`;

-- 2. transactions: schema uses transaction_date; routes were inserting sale_date.
--    Add payment_status column which is also missing from the original schema.
ALTER TABLE `transactions`
  ADD COLUMN `payment_status` enum('paid','pending','partial') NOT NULL DEFAULT 'paid' AFTER `margin`,
  ADD COLUMN `notes`          varchar(500) DEFAULT NULL AFTER `payment_status`,
  ADD COLUMN `sale_date`      date GENERATED ALWAYS AS (`transaction_date`) VIRTUAL;
-- The generated column lets old code using sale_date still read correctly.
-- New inserts go through transaction_date (fixed in routes/sales.js).

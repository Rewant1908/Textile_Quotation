-- =============================================================================
-- migration_v4.sql
-- Dealer scope isolation + commerce lifecycle tables
-- Run: mysql -u root kt_impex < database/migration_v4.sql
-- Safe to run multiple times (IF NOT EXISTS / IF NOT EXISTS guards).
-- =============================================================================

-- 1. Link each retailer row to the user account that owns it.
--    This is the key that isolates one dealer's data from another's.
ALTER TABLE `retailers`
  ADD COLUMN IF NOT EXISTS `assigned_user_id` int(11) DEFAULT NULL
    COMMENT 'FK → users.user_id — which login owns this retailer profile';

-- Index for fast per-user lookups
ALTER TABLE `retailers`
  ADD KEY IF NOT EXISTS `idx_retailer_user` (`assigned_user_id`);

-- Foreign-key constraint (only added if not present yet)
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'retailers'
    AND CONSTRAINT_NAME = 'fk_retailer_user'
);

-- MariaDB does not support IF NOT EXISTS on ADD CONSTRAINT, so we use PREPARE
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE `retailers` ADD CONSTRAINT `fk_retailer_user`
     FOREIGN KEY (`assigned_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- =============================================================================
-- 2. orders — operational commitment (split from commercial quotation intent)
-- =============================================================================
CREATE TABLE IF NOT EXISTS `orders` (
  `order_id`          int(11) NOT NULL AUTO_INCREMENT,
  `quotation_id`      int(11) NOT NULL,
  `customer_id`       int(11) DEFAULT NULL,
  `retailer_id`       int(11) DEFAULT NULL,
  `status`            enum('confirmed','processing','packed','dispatched','delivered','cancelled')
                      NOT NULL DEFAULT 'confirmed',
  `expected_dispatch` date DEFAULT NULL,
  `notes`             varchar(500) DEFAULT NULL,
  `created_at`        timestamp NULL DEFAULT current_timestamp(),
  `updated_at`        timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`order_id`),
  KEY `idx_order_quotation` (`quotation_id`),
  KEY `idx_order_status`    (`status`),
  CONSTRAINT `fk_order_quotation`
    FOREIGN KEY (`quotation_id`) REFERENCES `quotations` (`quotation_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_order_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_order_retailer`
    FOREIGN KEY (`retailer_id`) REFERENCES `retailers` (`retailer_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 3. dispatches — logistics layer
-- =============================================================================
CREATE TABLE IF NOT EXISTS `dispatches` (
  `dispatch_id`       int(11) NOT NULL AUTO_INCREMENT,
  `order_id`          int(11) NOT NULL,
  `vehicle_number`    varchar(30)  DEFAULT NULL,
  `driver_name`       varchar(100) DEFAULT NULL,
  `tracking_number`   varchar(100) DEFAULT NULL,
  `dispatch_date`     date NOT NULL,
  `expected_delivery` date DEFAULT NULL,
  `delivery_status`   enum('preparing','in_transit','out_for_delivery','delivered','returned')
                      NOT NULL DEFAULT 'preparing',
  `notes`             varchar(500) DEFAULT NULL,
  `created_at`        timestamp NULL DEFAULT current_timestamp(),
  `updated_at`        timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`dispatch_id`),
  KEY `idx_dispatch_order` (`order_id`),
  CONSTRAINT `fk_dispatch_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 4. invoices — financial commitment per order
-- =============================================================================
CREATE TABLE IF NOT EXISTS `invoices` (
  `invoice_id`     int(11) NOT NULL AUTO_INCREMENT,
  `order_id`       int(11) NOT NULL,
  `retailer_id`    int(11) DEFAULT NULL,
  `invoice_number` varchar(60) NOT NULL,
  `invoice_date`   date NOT NULL,
  `due_date`       date NOT NULL,
  `total_amount`   decimal(15,2) NOT NULL,
  `amount_paid`    decimal(15,2) NOT NULL DEFAULT 0.00,
  `status`         enum('unpaid','partial','paid','overdue') NOT NULL DEFAULT 'unpaid',
  `created_at`     timestamp NULL DEFAULT current_timestamp(),
  `updated_at`     timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`invoice_id`),
  UNIQUE KEY `uq_invoice_number` (`invoice_number`),
  KEY `idx_invoice_order`    (`order_id`),
  KEY `idx_invoice_retailer` (`retailer_id`),
  KEY `idx_invoice_due`      (`due_date`),
  CONSTRAINT `fk_invoice_order`
    FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_invoice_retailer`
    FOREIGN KEY (`retailer_id`) REFERENCES `retailers` (`retailer_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 5. payments — settlement events against invoices
-- =============================================================================
CREATE TABLE IF NOT EXISTS `payments` (
  `payment_id`       int(11) NOT NULL AUTO_INCREMENT,
  `invoice_id`       int(11) NOT NULL,
  `retailer_id`      int(11) DEFAULT NULL,
  `amount_paid`      decimal(15,2) NOT NULL,
  `payment_date`     date NOT NULL,
  `mode`             enum('cash','bank','upi','cheque','mixed') NOT NULL DEFAULT 'cash',
  `reference_number` varchar(100) DEFAULT NULL,
  `notes`            varchar(300) DEFAULT NULL,
  `created_at`       timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`payment_id`),
  KEY `idx_payment_invoice`  (`invoice_id`),
  KEY `idx_payment_retailer` (`retailer_id`),
  CONSTRAINT `fk_payment_invoice`
    FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`invoice_id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_payment_retailer`
    FOREIGN KEY (`retailer_id`) REFERENCES `retailers` (`retailer_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_payment_amount` CHECK (`amount_paid` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

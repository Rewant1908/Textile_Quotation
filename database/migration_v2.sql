-- =============================================================
-- KT IMPEX — Migration v2
-- Safe, backward-compatible patch on existing kt_impex schema
-- Engine: MariaDB
-- Run ONCE against the live database.
-- =============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- -------------------------------------------------------------
-- PATCH 1: Add cost_per_meter_at_sale snapshot to transactions
-- Preserves historical margin accuracy if thans.cost_per_meter changes later.
-- NULL allowed so existing rows are untouched.
-- -------------------------------------------------------------
ALTER TABLE `transactions`
    ADD COLUMN IF NOT EXISTS `cost_per_meter_at_sale` DECIMAL(10,2) DEFAULT NULL
        COMMENT 'Snapshot of cost_per_meter at time of sale for accurate margin replay'
    AFTER `price`;

-- Back-fill from thans for existing rows where than_id is known
UPDATE `transactions` t
    JOIN `thans` th ON t.than_id = th.than_id
SET t.cost_per_meter_at_sale = th.cost_per_meter
WHERE t.cost_per_meter_at_sale IS NULL
  AND t.than_id IS NOT NULL;


-- -------------------------------------------------------------
-- PATCH 2: Add season + festival_name to transactions
-- Allows Phase 4 seasonal pattern detection without schema rebuild.
-- -------------------------------------------------------------
ALTER TABLE `transactions`
    ADD COLUMN IF NOT EXISTS `season`
        ENUM('summer','monsoon','winter','spring') DEFAULT NULL
        COMMENT 'Season at time of transaction for demand pattern analysis'
    AFTER `transaction_date`,
    ADD COLUMN IF NOT EXISTS `festival_name`
        VARCHAR(40) DEFAULT NULL
        COMMENT 'Festival period e.g. Dashain, Tihar, Eid, Diwali, NULL if none'
    AFTER `season`;


-- -------------------------------------------------------------
-- PATCH 3: Change retailers.preferred_categories to JSON
-- Allows weighted preference matching in Phase 3.
-- Safe migration: reads old VARCHAR, writes JSON array, then adds JSON column.
-- The old preferred_categories VARCHAR column is kept for backward compat.
-- -------------------------------------------------------------

-- Step 3a: Add a new JSON column alongside the existing VARCHAR
ALTER TABLE `retailers`
    ADD COLUMN IF NOT EXISTS `preferred_categories_json` JSON DEFAULT NULL
        COMMENT 'Weighted category preferences e.g. [{"category":"Cotton","weight":0.7}]'
    AFTER `preferred_categories`;

-- Step 3b: Migrate existing plain-text CSV strings into JSON arrays
-- e.g. "Cotton, Shirting" -> [{"category":"Cotton","weight":1.0},{"category":"Shirting","weight":1.0}]
DELIMITER //

CREATE OR REPLACE PROCEDURE `migrate_retailer_categories`()
BEGIN
    DECLARE done      INT DEFAULT FALSE;
    DECLARE ret_id    INT;
    DECLARE cat_str   VARCHAR(255);
    DECLARE json_out  TEXT;
    DECLARE cat       VARCHAR(60);
    DECLARE pos       INT;
    DECLARE remainder VARCHAR(255);

    DECLARE cur CURSOR FOR
        SELECT retailer_id, preferred_categories
        FROM retailers
        WHERE preferred_categories IS NOT NULL
          AND preferred_categories_json IS NULL;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    OPEN cur;
    read_loop: LOOP
        FETCH cur INTO ret_id, cat_str;
        IF done THEN LEAVE read_loop; END IF;

        SET json_out  = '[';
        SET remainder = TRIM(cat_str);
        SET pos       = LOCATE(',', remainder);

        WHILE pos > 0 DO
            SET cat       = TRIM(SUBSTRING(remainder, 1, pos - 1));
            SET json_out  = CONCAT(json_out, '{"category":"', cat, '","weight":1.0},');
            SET remainder = TRIM(SUBSTRING(remainder, pos + 1));
            SET pos       = LOCATE(',', remainder);
        END WHILE;

        -- Last (or only) token
        IF LENGTH(remainder) > 0 THEN
            SET json_out = CONCAT(json_out, '{"category":"', TRIM(remainder), '","weight":1.0}');
        ELSE
            -- Trim trailing comma if remainder was empty
            SET json_out = LEFT(json_out, LENGTH(json_out) - 1);
        END IF;

        SET json_out = CONCAT(json_out, ']');

        UPDATE retailers
        SET preferred_categories_json = json_out
        WHERE retailer_id = ret_id;

    END LOOP;
    CLOSE cur;
END //

DELIMITER ;

CALL `migrate_retailer_categories`();
DROP PROCEDURE IF EXISTS `migrate_retailer_categories`;


-- -------------------------------------------------------------
-- PATCH 4: Auto-calculate margin on INSERT via trigger
-- Prevents wrong margin values being passed by the caller.
-- Formula: (price - cost_per_meter_at_sale) * quantity - discount
-- Falls back to stored cost_per_meter on thans if snapshot is NULL.
-- -------------------------------------------------------------
DROP TRIGGER IF EXISTS `trg_transaction_margin_before_insert`;

DELIMITER //

CREATE TRIGGER `trg_transaction_margin_before_insert`
BEFORE INSERT ON `transactions`
FOR EACH ROW
BEGIN
    DECLARE v_cost DECIMAL(10,2) DEFAULT 0.00;

    -- Prefer the snapshot column; fall back to live thans.cost_per_meter
    IF NEW.cost_per_meter_at_sale IS NOT NULL THEN
        SET v_cost = NEW.cost_per_meter_at_sale;
    ELSEIF NEW.than_id IS NOT NULL THEN
        SELECT cost_per_meter INTO v_cost
        FROM thans
        WHERE than_id = NEW.than_id
        LIMIT 1;

        -- Also populate the snapshot column automatically
        SET NEW.cost_per_meter_at_sale = v_cost;
    END IF;

    -- Recalculate margin regardless of what the caller passed
    SET NEW.margin = ROUND((NEW.price - v_cost) * NEW.quantity - NEW.discount, 2);
END //

DELIMITER ;


-- -------------------------------------------------------------
-- PATCH 5: Auto-update thans.movement_speed via trigger
-- Fires AFTER INSERT on inventory_movements for stock_out events.
-- Rules (days since last stock_out):
--   >= 90  -> dead
--   >= 45  -> slow
--   >= 14  -> medium
--   <  14  -> fast
-- Only recalculates the than just touched — O(1) per insert.
-- -------------------------------------------------------------
DROP TRIGGER IF EXISTS `trg_update_movement_speed_after_stock_out`;

DELIMITER //

CREATE TRIGGER `trg_update_movement_speed_after_stock_out`
AFTER INSERT ON `inventory_movements`
FOR EACH ROW
BEGIN
    DECLARE v_last_out DATE;
    DECLARE v_days     INT DEFAULT 9999;
    DECLARE v_speed    ENUM('new','slow','medium','fast','dead');

    IF NEW.movement_type = 'stock_out' AND NEW.than_id IS NOT NULL THEN
        -- Most recent stock_out date for this than (including the row just inserted)
        SELECT DATE(MAX(movement_date))
        INTO v_last_out
        FROM inventory_movements
        WHERE than_id = NEW.than_id
          AND movement_type = 'stock_out';

        SET v_days = DATEDIFF(CURDATE(), v_last_out);

        IF    v_days >= 90 THEN SET v_speed = 'dead';
        ELSEIF v_days >= 45 THEN SET v_speed = 'slow';
        ELSEIF v_days >= 14 THEN SET v_speed = 'medium';
        ELSE                     SET v_speed = 'fast';
        END IF;

        UPDATE thans
        SET movement_speed = v_speed,
            updated_at     = current_timestamp()
        WHERE than_id = NEW.than_id;
    END IF;
END //

DELIMITER ;


-- -------------------------------------------------------------
-- PATCH 6: Auto-deduct stock + create transaction when quotation
-- is accepted. Fires AFTER UPDATE on quotations.
-- Only runs when status flips to 'accepted'.
-- Creates one transaction row per quotation_item where than_id is set.
-- Also inserts the corresponding inventory_movements stock_out record.
-- NOTE: trg_transaction_margin_before_insert fires first, so margin
--       is always correctly computed — pass 0.00 as placeholder.
-- -------------------------------------------------------------
DROP TRIGGER IF EXISTS `trg_quotation_accepted_stock_deduct`;

DELIMITER //

CREATE TRIGGER `trg_quotation_accepted_stock_deduct`
AFTER UPDATE ON `quotations`
FOR EACH ROW
BEGIN
    -- Only fire on status flip to 'accepted'
    IF NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN

        -- Cursor block wrapped in its own BEGIN...END for DECLARE scope
        BEGIN
            DECLARE done         INT DEFAULT FALSE;
            DECLARE v_qi_id      INT;
            DECLARE v_than_id    INT;
            DECLARE v_prod_id    INT;
            DECLARE v_qty        DECIMAL(10,2);
            DECLARE v_unit_price DECIMAL(10,2);
            DECLARE v_cost       DECIMAL(10,2) DEFAULT 0.00;
            DECLARE v_loc        VARCHAR(80);

            DECLARE cur CURSOR FOR
                SELECT item_id, than_id, product_id, quantity, unit_price_at_time
                FROM quotation_items
                WHERE quotation_id = NEW.quotation_id
                  AND than_id IS NOT NULL;

            DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

            OPEN cur;
            item_loop: LOOP
                FETCH cur INTO v_qi_id, v_than_id, v_prod_id, v_qty, v_unit_price;
                IF done THEN LEAVE item_loop; END IF;

                -- Snapshot cost and warehouse location at this moment
                SELECT cost_per_meter, warehouse_location
                INTO v_cost, v_loc
                FROM thans
                WHERE than_id = v_than_id
                LIMIT 1;

                -- Insert transaction — margin auto-calculated by BEFORE INSERT trigger
                INSERT INTO transactions
                    (retailer_id, quotation_id, than_id, product_id,
                     quantity, price, discount, payment_method,
                     cost_per_meter_at_sale, margin, transaction_date)
                SELECT
                    r.retailer_id,
                    NEW.quotation_id,
                    v_than_id,
                    v_prod_id,
                    v_qty,
                    v_unit_price,
                    0.00,
                    'cash',     -- default; update via PATCH /api/transactions/:id/payment if needed
                    v_cost,
                    0.00,       -- placeholder: overwritten by trg_transaction_margin_before_insert
                    CURDATE()
                FROM customers c
                LEFT JOIN retailers r ON r.customer_id = c.customer_id
                WHERE c.customer_id = NEW.customer_id
                LIMIT 1;

                -- Deduct stock — floor at 0 to prevent negative stock
                UPDATE thans
                SET remaining_stock = GREATEST(remaining_stock - v_qty, 0),
                    updated_at      = current_timestamp()
                WHERE than_id = v_than_id;

                -- Auto-mark sold_out when stock reaches exactly 0
                UPDATE thans
                SET status     = 'sold_out',
                    updated_at = current_timestamp()
                WHERE than_id = v_than_id
                  AND remaining_stock = 0;

                -- Stock-out movement — also fires trg_update_movement_speed_after_stock_out
                INSERT INTO inventory_movements
                    (than_id, movement_type, quantity, from_location, to_location,
                     reference_type, reference_id, notes, movement_date)
                VALUES
                    (v_than_id, 'stock_out', v_qty, v_loc, NULL,
                     'quotation', NEW.quotation_id,
                     CONCAT('Auto stock-out: quotation #', NEW.quotation_id, ' accepted'),
                     current_timestamp());

            END LOOP;
            CLOSE cur;
        END;

    END IF;
END //

DELIMITER ;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================
-- Migration v2 complete.
-- Tables altered  : transactions (3 new columns)
--                   retailers    (1 new JSON column)
-- Triggers added  : trg_transaction_margin_before_insert
--                   trg_update_movement_speed_after_stock_out
--                   trg_quotation_accepted_stock_deduct
-- Procedure used  : migrate_retailer_categories (dropped after use)
-- Idempotent      : ADD COLUMN IF NOT EXISTS + DROP TRIGGER IF EXISTS
--                   makes this safe to re-run.
-- =============================================================

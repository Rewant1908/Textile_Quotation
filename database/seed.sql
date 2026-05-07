-- =============================================================
-- KT IMPEX — Seed Data
-- Run AFTER schema.sql + migration_v2.sql + migration_v3.sql
-- Passwords: admin=ktimpex123, dealer=dealer123
-- =============================================================

INSERT INTO users (username, password, email, role) VALUES
  ('admin',  '$2b$10$zJdm4ZkN3zsmpnzGTht3Iuljo9KLVhR70JrSqmApEM0gPZ/LZTB/6', 'admin@ktimpex.local',  'admin'),
  ('dealer', '$2b$10$Poy1rinAMee9YzKnVoTL1ur7FvwXNFztMdMdws254ShYa9lqxFkkK', 'dealer@ktimpex.local', 'user');

INSERT INTO suppliers
  (supplier_name, factory_name, product_specialization, quality_rating,
   delay_frequency, price_range, popular_categories, return_issues, trend_alignment)
VALUES
  ('Shree Balaji Textiles', 'Balaji Mills',       'Cotton prints and shirting',  4.30, 'low',    'NPR 55-120/m',  'Cotton, Shirting, Printed',    'Low shrinkage complaints',             'strong'),
  ('Surat Premium Looms',   'SPL Factory Unit 4', 'Suiting and premium blends',  4.60, 'medium', 'NPR 180-450/m', 'Suiting, Denim',               'Occasional shade mismatch',            'strong'),
  ('Rajasthan Dress House', 'RDH Jaipur',         'Festival dress material',     3.90, 'medium', 'NPR 70-210/m',  'Dress Material, Printed',      'Print bleeding on small batches',      'average');

INSERT INTO products (product_name, category, base_price) VALUES
  ('Royal Wool Suiting',       'Suiting',       850.00),
  ('Premium Cotton Suiting',   'Suiting',       650.00),
  ('Classic Linen Suiting',    'Suiting',       720.00),
  ('White Cotton Shirting',    'Shirting',      320.00),
  ('Oxford Stripe Shirting',   'Shirting',      380.00),
  ('Premium Poplin Shirting',  'Shirting',      290.00),
  ('Printed Dress Material',   'Dress Material',410.00),
  ('Designer Dress Material',  'Dress Material',560.00),
  ('Budget Cotton Print',      'Cotton',         78.00),
  ('Festival Floral Print',    'Printed',       115.00);

INSERT INTO customers (customer_name, contact_phone, email) VALUES
  ('Mahalaxmi Fashion Store', '9800000001', 'mahalaxmi@example.com'),
  ('Ganesh Cloth House',       '9800000002', 'ganesh@example.com'),
  ('City Retail Fabrics',      '9800000003', 'cityretail@example.com');

-- NOTE: uses `phone` column (after migration_v3 renamed phone_number → phone)
INSERT INTO retailers
  (customer_id, shop_name, contact_person, phone, market_location,
   preferred_categories, payment_pattern, average_order_size,
   seasonal_trends, outstanding_balance, preferred_price_segment, notes)
VALUES
  (1, 'Mahalaxmi Fashion Store', 'Ramesh Gupta',  '9800000001', 'Birgunj Main Market',
   'Cotton, Printed',     'credit_good', 420.00,
   'Buys heavily before Dashain and Tihar', 12000.00, 'mid',
   'Prefers quick-moving cotton prints under NPR 90.'),
  (2, 'Ganesh Cloth House',      'Ganesh Prasad', '9800000002', 'Adarsh Nagar',
   'Suiting, Shirting',   'credit_slow', 280.00,
   'School uniform and wedding season demand', 28500.00, 'mixed',
   'Negotiates aggressively but repeats fast sellers.'),
  (3, 'City Retail Fabrics',     'Sita Devi',     '9800000003', 'Ghantaghar',
   'Dress Material, Printed', 'on_delivery', 360.00,
   'Festival designs peak September-November', 0.00, 'premium',
   'Responds well to photo catalogues.');

INSERT INTO bales
  (bale_code, supplier_id, factory_name, arrival_date, purchase_cost,
   transport_cost, total_rolls, fabric_category, purchase_invoice, status)
VALUES
  ('BAL-2026-001', 1, 'Balaji Mills',       '2026-04-01', 16200.00, 1100.00, 15, 'Cotton Print',          'INV-BAL-001',  'opened'),
  ('BAL-2026-002', 2, 'SPL Factory Unit 4', '2026-04-06', 48200.00, 2400.00, 14, 'Premium Suiting',       'INV-SPL-118',  'partially_sold'),
  ('BAL-2026-003', 3, 'RDH Jaipur',         '2026-03-20', 23800.00, 1900.00, 15, 'Festival Dress Material','INV-RDH-077', 'opened');

INSERT INTO thans
  (than_code, bale_id, product_id, fabric_type, color, design, gsm,
   meter_length, cost_per_meter, selling_price, remaining_stock,
   warehouse_location, movement_speed, status)
VALUES
  ('TH-001-A', 1, 9,  'Cotton Print',          'Black',    'Small Floral',   120, 17.00,  67.84, 82.00,  4.50, 'A1-R2-S3', 'fast',   'available'),
  ('TH-001-B', 1, 9,  'Cotton Print',          'Blue',     'Geometric',      118, 17.00,  67.84, 80.00, 12.00, 'A1-R2-S4', 'medium', 'available'),
  ('TH-002-A', 2, 1,  'Premium Suiting',       'Charcoal', 'Twill',          240, 17.00, 212.61,285.00,  9.00, 'B2-R1-S1', 'medium', 'available'),
  ('TH-002-B', 2, 2,  'Cotton Suiting',        'Navy',     'Plain',          220, 17.00, 212.61,265.00, 17.00, 'B2-R1-S2', 'slow',   'available'),
  ('TH-003-A', 3, 10, 'Dress Material',        'Maroon',   'Festival Floral',140, 17.00, 100.78,135.00, 17.00, 'C1-R3-S1', 'new',    'available'),
  ('TH-003-B', 3, 7,  'Printed Dress Material','Mustard',  'Paisley',        135, 17.00, 100.78,128.00,  2.00, 'C1-R3-S2', 'fast',   'available'),
  ('TH-OLD-014',1, 9, 'Cotton Print',          'Brown',    'Checks',         115, 17.00,  67.84, 74.00, 15.00, 'D4-R5-S2', 'dead',   'available');

INSERT INTO transactions
  (retailer_id, than_id, product_id, quantity, price, discount,
   payment_method, payment_status, margin, transaction_date)
VALUES
  (1, 1, 9,  12.50,  82.00,  0.00, 'credit', 'pending', 177.00,  '2026-04-09'),
  (3, 6, 7,  15.00, 128.00,  0.00, 'cash',   'paid',    408.30,  '2026-04-12'),
  (2, 3, 1,   8.00, 285.00, 40.00, 'credit', 'pending', 539.12,  '2026-04-18'),
  (1, 2, 9,   5.00,  80.00, 10.00, 'bank',   'paid',     50.80,  '2026-05-01');

INSERT INTO inventory_movements
  (than_id, movement_type, quantity, from_location, to_location,
   reference_type, reference_id, notes, movement_date)
VALUES
  (1, 'stock_in',  17.00, NULL,        'A1-R2-S3', 'bale', 1, 'Breakdown from BAL-2026-001',            '2026-04-01 10:00:00'),
  (2, 'stock_in',  17.00, NULL,        'A1-R2-S4', 'bale', 1, 'Breakdown from BAL-2026-001',            '2026-04-01 10:10:00'),
  (3, 'stock_in',  17.00, NULL,        'B2-R1-S1', 'bale', 2, 'Breakdown from BAL-2026-002',            '2026-04-06 12:00:00'),
  (6, 'stock_in',  17.00, NULL,        'C1-R3-S2', 'bale', 3, 'Breakdown from BAL-2026-003',            '2026-03-20 11:00:00'),
  (1, 'stock_out', 12.50, 'A1-R2-S3', NULL,        'transaction', 1, 'Sold to Mahalaxmi Fashion Store', '2026-04-09 15:30:00'),
  (6, 'stock_out', 15.00, 'C1-R3-S2', NULL,        'transaction', 2, 'Sold to City Retail Fabrics',     '2026-04-12 16:00:00'),
  (3, 'stock_out',  8.00, 'B2-R1-S1', NULL,        'transaction', 3, 'Sold to Ganesh Cloth House',      '2026-04-18 13:15:00'),
  (2, 'stock_out',  5.00, 'A1-R2-S4', NULL,        'transaction', 4, 'Repeat sale to Mahalaxmi',        '2026-05-01 12:30:00');

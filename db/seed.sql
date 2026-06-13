-- Seed data: default Owner account + sample products (selling price only).
-- Default login: admin / admin123  (change after first sign-in).
-- Password hash below is bcrypt of 'admin123' (cost 10).

INSERT INTO users (username, password_hash, role)
VALUES ('admin', '$2b$10$vuhGfQTrC7I0MsKU5gX1JO1jyDB/xZhPnwAynsLCifJfWRblQqusa', 'Owner')
ON CONFLICT (username) DO NOTHING;

INSERT INTO products (uuid, name, category, size_unit, selling_price, current_stock, min_stock_alert) VALUES
  (gen_random_uuid(), 'Nile Special',  'Beers', 'Bottle',  5000,  91, 10),
  (gen_random_uuid(), 'Club',          'Beers', 'Bottle',  4000,  80, 10),
  (gen_random_uuid(), 'Castle Lite',   'Beers', 'Bottle',  4000,  42, 10),
  (gen_random_uuid(), 'Bell Lager',    'Beers', 'Bottle',  4000,  37, 10),
  (gen_random_uuid(), 'Pilsner',       'Beers', 'Bottle',  4000,  32, 10),
  (gen_random_uuid(), 'Tusker Lager',  'Beers', 'Bottle',  4000,  44, 10),
  (gen_random_uuid(), 'Tusker Malt',   'Beers', 'Bottle',  4000,  48, 10),
  (gen_random_uuid(), 'Tusker Lite',   'Beers', 'Bottle',  4000,  28, 10),
  (gen_random_uuid(), 'Guinness',      'Beers', 'Bottle',  4000, 103, 10),
  (gen_random_uuid(), 'Smooth',        'Beers', 'Bottle',  4000,  41, 10),
  (gen_random_uuid(), 'Smirnoff Ice',  'Beers', 'Bottle',  5000,  60, 10),
  (gen_random_uuid(), 'Tusker Cider',  'Beers', 'Bottle',  6000,  55, 10),
  (gen_random_uuid(), 'Bell Citrus',   'Beers', 'Bottle',  4000,  15, 10),
  (gen_random_uuid(), 'Heineken',      'Beers', 'Bottle', 10000,  21, 10),
  (gen_random_uuid(), 'Hunters',       'Beers', 'Bottle', 10000,  13, 10),
  (gen_random_uuid(), 'Soda Coca-Cola','Soft Drinks', 'Bottle', 2000, 105, 20),
  (gen_random_uuid(), 'Soda Pepsi',    'Soft Drinks', 'Bottle', 2000,  72, 20),
  (gen_random_uuid(), 'Minute Maid',   'Soft Drinks', 'Bottle', 3000,  19, 10),
  (gen_random_uuid(), 'Oner',          'Soft Drinks', 'Bottle', 3000,  16, 10),
  (gen_random_uuid(), 'Sting',         'Soft Drinks', 'Bottle', 3000,  17, 10),
  (gen_random_uuid(), 'Predator',      'Soft Drinks', 'Bottle', 3000,  21, 10),
  (gen_random_uuid(), 'H2O Big',       'Soft Drinks', 'Bottle', 3000,  17, 10),
  (gen_random_uuid(), 'H2O Small',     'Soft Drinks', 'Bottle', 2500,  42, 15),
  (gen_random_uuid(), 'H2O Uzima',     'Soft Drinks', 'Bottle', 1000,  73, 20),
  (gen_random_uuid(), 'Rock Boom',     'Soft Drinks', 'Bottle', 3000,  17, 10),
  (gen_random_uuid(), 'Uganda Waragi Premium', 'Spirits', '75cl', 100000, 2, 2),
  (gen_random_uuid(), 'Uganda Waragi Coconut', 'Spirits', '75cl', 100000, 2, 2),
  (gen_random_uuid(), 'Uganda Waragi Lemon',   'Spirits', '75cl', 100000, 2, 2),
  (gen_random_uuid(), 'V&A',                   'Spirits', '75cl', 100000, 2, 2),
  (gen_random_uuid(), 'Bond 7',                'Spirits', '75cl', 100000, 2, 2),
  (gen_random_uuid(), 'Vat 69',                'Spirits', '75cl', 140000, 1, 2),
  (gen_random_uuid(), 'Black & White',         'Spirits', '75cl', 240000, 2, 1),
  (gen_random_uuid(), 'Smirnoff Vodka',        'Spirits', '75cl', 120000, 2, 2),
  (gen_random_uuid(), 'Gilbeys',               'Spirits', '75cl', 120000, 1, 2),
  (gen_random_uuid(), '4 Cousins Wine',        'Spirits', '75cl', 110000, 3, 2),
  (gen_random_uuid(), 'Captain Morgan',        'Spirits', '75cl', 100000, 3, 2),
  (gen_random_uuid(), 'Uganda Waragi Premium', 'Spirits', '1/2 (375ml)', 50000, 7, 3),
  (gen_random_uuid(), 'Uganda Waragi Coconut', 'Spirits', '1/2 (375ml)', 50000, 8, 3),
  (gen_random_uuid(), 'Uganda Waragi Premium', 'Spirits', '1/4 (250ml)', 35000, 2, 3),
  (gen_random_uuid(), 'Bond 7',                'Spirits', '1/4 (250ml)', 25000, 3, 3),
  (gen_random_uuid(), 'Vat 69',                'Spirits', '1/4 (250ml)', 38000, 4, 3),
  (gen_random_uuid(), 'Gilbeys',               'Spirits', '1/4 (250ml)', 50000, 2, 3),
  (gen_random_uuid(), 'Captain Morgan',        'Spirits', '1/4 (250ml)', 38000, 4, 3),
  (gen_random_uuid(), 'Smirnoff Guarana',      'Spirits', '200ml', 20000, 21, 5),
  (gen_random_uuid(), 'Lemon & Ginger',        'Spirits', '200ml', 20000, 15, 5)
ON CONFLICT DO NOTHING;

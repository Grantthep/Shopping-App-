-- Test data: 8 categories, 2 fake seller shops, 50 products with placeholder photos. Prices in kyat.
-- Safe to run more than once. The fake sellers have no password, so nobody can log in as them.

insert into categories (name, slug) values
  ('Phones & Tablets', 'phones'),
  ('Electronics', 'electronics'),
  ('Fashion', 'fashion'),
  ('Beauty', 'beauty'),
  ('Home & Living', 'home'),
  ('Groceries', 'groceries'),
  ('Sports', 'sports'),
  ('Toys & Kids', 'toys')
on conflict (slug) do nothing;

-- Inserting into auth.users fires the sign-up trigger, which creates the seller profiles.
insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000a001', 'authenticated', 'authenticated', 'seller1@example.com', '{"role": "seller", "full_name": "Ko Aung"}'),
  ('00000000-0000-0000-0000-00000000a002', 'authenticated', 'authenticated', 'seller2@example.com', '{"role": "seller", "full_name": "Ma Hnin"}')
on conflict (id) do nothing;

insert into shops (id, owner_id, name, description) values
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a001', 'Golden Land Store', 'Phones, gadgets and home goods'),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000a002', 'Yangon Style', 'Fashion, beauty and everyday items')
on conflict (id) do nothing;

-- Ids come from the product name so a second run finds the same rows.
-- Golden Land Store sells phones, electronics, home and groceries; Yangon Style sells the rest.
with items (slug, name, price) as (values
  ('phones', 'Samsung Galaxy A15', 450000), ('phones', 'Redmi Note 13', 520000), ('phones', 'iPhone 13 128GB', 1650000),
  ('phones', 'Oppo A78', 610000), ('phones', 'Vivo Y36', 480000), ('phones', 'Galaxy Tab A9', 590000),
  ('phones', 'Phone Case Clear', 5000),
  ('electronics', 'Power Bank 20000mAh', 38000), ('electronics', 'Bluetooth Earbuds', 45000), ('electronics', 'USB-C Fast Charger', 18000),
  ('electronics', 'Smart Watch', 85000), ('electronics', 'Rice Cooker 1.8L', 72000), ('electronics', 'Electric Fan 16"', 65000),
  ('fashion', 'Cotton Longyi', 15000), ('fashion', 'Silk Htamein', 48000), ('fashion', 'Men''s Polo Shirt', 22000),
  ('fashion', 'Women''s Blouse', 25000), ('fashion', 'Leather Sandals', 35000), ('fashion', 'Canvas Sneakers', 42000),
  ('fashion', 'Shoulder Bag', 30000),
  ('beauty', 'Thanaka Powder', 3500), ('beauty', 'Thanaka Paste Tube', 4500), ('beauty', 'Sunscreen SPF50', 16000),
  ('beauty', 'Lip Tint', 9000), ('beauty', 'Face Wash', 7500), ('beauty', 'Hair Oil', 6000),
  ('home', 'Bamboo Mat', 18000), ('home', 'Cotton Bed Sheet Set', 32000), ('home', 'Water Bottle 1L', 8000),
  ('home', 'Non-stick Pan', 28000), ('home', 'Storage Box', 12000), ('home', 'Mosquito Net', 15000),
  ('groceries', 'Laphet Tea Leaf', 4000), ('groceries', 'Shan Noodles Pack', 3000), ('groceries', 'Jasmine Rice 5kg', 22000),
  ('groceries', 'Instant Coffee Mix 30pcs', 9500), ('groceries', 'Palm Sugar', 3500), ('groceries', 'Fried Bean Snack', 2500),
  ('sports', 'Chinlone Cane Ball', 6000), ('sports', 'Football Size 5', 25000), ('sports', 'Badminton Racket Set', 38000),
  ('sports', 'Yoga Mat', 20000), ('sports', 'Running Shorts', 14000), ('sports', 'Jump Rope', 5000),
  ('toys', 'Building Blocks 200pcs', 28000), ('toys', 'Plush Elephant', 15000), ('toys', 'Kids Puzzle', 9000),
  ('toys', 'Remote Control Car', 45000), ('toys', 'Colouring Book', 3000), ('toys', 'Toy Kitchen Set', 35000)
)
insert into products (id, shop_id, category_id, name, description, price, stock)
select
  md5('seed-product-' || i.name)::uuid,
  case when i.slug in ('phones', 'electronics', 'home', 'groceries')
    then '00000000-0000-0000-0000-00000000b001'::uuid else '00000000-0000-0000-0000-00000000b002'::uuid end,
  c.id,
  i.name,
  'Sample product for testing: ' || i.name || '.',
  i.price,
  abs(hashtext(i.name)) % 50 + 1
from items i
join categories c on c.slug = i.slug
on conflict (id) do nothing;

-- shortcut: placeholder photos from picsum.photos; replace with real uploads to the product-images bucket.
insert into product_images (id, product_id, url, position)
select md5('seed-image-' || p.id)::uuid, p.id, 'https://picsum.photos/seed/' || p.id || '/600/600', 0
from products p
where p.shop_id in ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b002')
on conflict (id) do nothing;

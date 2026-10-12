// Checks the migrations, RLS rules and seed on in-memory Postgres with stubbed Supabase auth/storage schemas.
// Run: npm i -D @electric-sql/pglite && node supabase/tests/schema.test.mjs supabase
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const dir = process.argv[2] ?? 'supabase';

async function freshDb() {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, aud text, role text, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean default false,
      file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets,
      name text not null, owner uuid);
    create function storage.foldername(name text) returns text[] language sql immutable as
      $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    alter table storage.objects enable row level security;
    create role anon;
    create role authenticated;
    create role service_role;
    grant usage on schema auth, storage to authenticated;
    grant execute on function auth.uid() to authenticated;
    grant all on storage.objects to authenticated;
    -- Supabase grants everything on new public tables to these roles by default.
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
  `);
  for (const f of readdirSync(join(dir, 'migrations')).sort()) {
    await db.exec(readFileSync(join(dir, 'migrations', f), 'utf8'));
  }
  return db;
}

const db = await freshDb();
const SELLER = '11111111-1111-1111-1111-111111111111';
const BUYER = '22222222-2222-2222-2222-222222222222';
const OTHER = '33333333-3333-3333-3333-333333333333';
await db.exec(`
  insert into auth.users (id, raw_user_meta_data) values
    ('${SELLER}', '{"role":"seller","full_name":"Seller"}'),
    ('${BUYER}', '{"full_name":"Buyer"}'),
    ('${OTHER}', '{"role":"admin"}');
  insert into categories (name, slug) values ('Phones', 'phones');
`);

const roles = (await db.query('select id, role from profiles order by id')).rows.map(r => r.role);
assert.deepEqual(roles, ['seller', 'buyer', 'buyer'], 'sign-up trigger sets roles; unknown role -> buyer');

// Run sql as a logged-in user, inside a transaction that is always rolled back unless keep=true.
async function runAs(d, user, sql, keep = false, role = 'authenticated') {
  await d.exec(`begin; set local role ${role}; select set_config('request.jwt.claim.sub', '${user}', true);`);
  try { return await d.query(sql); }
  finally { await d.exec(keep ? 'commit' : 'rollback'); }
}
const as = (...args) => runAs(db, ...args);
async function fails(user, sql, msg, d = db) {
  await assert.rejects(runAs(d, user, sql), undefined, msg);
}

await fails(BUYER, `update profiles set role = 'seller' where id = '${BUYER}'`, 'buyer cannot self-promote');
await as(BUYER, `update profiles set full_name = 'New' where id = '${BUYER}'`);
assert.equal((await as(BUYER, 'select * from profiles')).rows.length, 1, 'only own profile visible');

await fails(BUYER, `insert into shops (owner_id, name) values ('${BUYER}', 'Fake')`, 'buyer cannot open a shop');
await as(SELLER, `insert into shops (id, owner_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001', '${SELLER}', 'Shop')`, true);
const SHOP = 'aaaaaaaa-0000-0000-0000-000000000001';

await fails(BUYER, `insert into products (shop_id, name, price, stock) values ('${SHOP}', 'X', 100, 1)`, 'others cannot add products');
await as(SELLER, `insert into products (id, shop_id, category_id, name, price, stock) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '${SHOP}', 1, 'Phone', 500000, 3),
  ('bbbbbbbb-0000-0000-0000-000000000002', '${SHOP}', 1, 'Hidden', 100, 1)`, true);
await as(SELLER, `update products set is_active = false where id = 'bbbbbbbb-0000-0000-0000-000000000002'`, true);
const PRODUCT = 'bbbbbbbb-0000-0000-0000-000000000001';

const upd = await as(BUYER, `update products set price = 1 where id = '${PRODUCT}'`);
assert.equal(upd.affectedRows, 0, 'others cannot edit products');
assert.equal((await as(BUYER, 'select * from products')).rows.length, 1, 'inactive products hidden from public');
assert.equal((await as(SELLER, 'select * from products')).rows.length, 2, 'owner sees own inactive products');
await fails(BUYER, `insert into product_images (product_id, url) values ('${PRODUCT}', 'x')`, 'others cannot add images');

await as(BUYER, `insert into cart_items (user_id, product_id, quantity) values ('${BUYER}', '${PRODUCT}', 1)`, true);
await fails(OTHER, `insert into cart_items (user_id, product_id, quantity) values ('${BUYER}', '${PRODUCT}', 1)`, 'cannot write another cart');
assert.equal((await as(OTHER, 'select * from cart_items')).rows.length, 0, 'cannot read another cart');

await fails(BUYER, `insert into orders (buyer_id, shop_id, total, shipping_address) values ('${BUYER}', '${SHOP}', 0, '{}')`, 'clients cannot create orders');

// Server (superuser here, service key in Supabase) creates an order.
await db.exec(`
  insert into orders (id, buyer_id, shop_id, status, total, shipping_address)
    values ('cccccccc-0000-0000-0000-000000000001', '${BUYER}', '${SHOP}', 'paid', 500000, '{}');
  insert into order_items (order_id, product_id, product_name, unit_price, quantity)
    values ('cccccccc-0000-0000-0000-000000000001', '${PRODUCT}', 'Phone', 500000, 1);
`);
for (const u of [BUYER, SELLER]) {
  assert.equal((await as(u, 'select * from orders')).rows.length, 1, 'buyer and seller see order');
  assert.equal((await as(u, 'select * from order_items')).rows.length, 1, 'buyer and seller see order items');
}
assert.equal((await as(OTHER, 'select * from orders')).rows.length, 0, 'strangers cannot see order');
assert.equal((await as(BUYER, `update orders set status = 'completed'`)).affectedRows, 0, 'buyer cannot change status');

const review = `insert into reviews (product_id, buyer_id, rating) values ('${PRODUCT}', '${BUYER}', 5)`;
await fails(BUYER, review, 'no review before delivery');
await db.exec(`update orders set status = 'delivered'`);
await fails(OTHER, `insert into reviews (product_id, buyer_id, rating) values ('${PRODUCT}', '${OTHER}', 5)`, 'non-buyers cannot review');
await fails(BUYER, `insert into reviews (product_id, buyer_id, rating) values ('${PRODUCT}', '${BUYER}', 6)`, 'rating max 5');
await as(BUYER, review);

// Storage: sellers write only inside their own folder of the product-images bucket.
const upload = (path) => `insert into storage.objects (bucket_id, name) values ('product-images', '${path}')`;
await as(SELLER, upload(`${SELLER}/phone.jpg`), true);
await fails(SELLER, upload(`${BUYER}/phone.jpg`), 'seller cannot upload to another folder');
await fails(SELLER, upload('phone.jpg'), 'seller cannot upload outside a folder');
await fails(BUYER, upload(`${BUYER}/phone.jpg`), 'buyers cannot upload');
assert.equal((await as(OTHER, `delete from storage.objects`)).affectedRows, 0, 'others cannot delete seller files');
assert.equal((await as(SELLER, `delete from storage.objects`)).affectedRows, 1, 'seller can delete own files');

// Seed: right counts, and a second run adds nothing.
const seeded = await freshDb();
const seed = readFileSync(join(dir, 'seed.sql'), 'utf8');
const counts = async () => (await seeded.query(`select
  (select count(*) from categories)::int as categories, (select count(*) from shops)::int as shops,
  (select count(*) from products)::int as products, (select count(*) from product_images)::int as images,
  (select count(*) from products where price <= 0 or stock <= 0)::int as bad`)).rows[0];
await seeded.exec(seed);
const first = await counts();
assert.deepEqual(first, { categories: 8, shops: 2, products: 50, images: 50, bad: 0 }, 'seed counts');
await seeded.exec(seed);
assert.deepEqual(await counts(), first, 'seed is safe to run twice');

// Search on the seeded catalog.
const BUY = '44444444-4444-4444-4444-444444444444';
await seeded.exec(`insert into auth.users (id, raw_user_meta_data) values ('${BUY}', '{}')`);
const asB = (sql, keep) => runAs(seeded, BUY, sql, keep);
const failsB = (sql, msg) => fails(BUY, sql, msg, seeded);
const search = async (args) => (await asB(`select name, price from search_products(${args})`)).rows;
assert.equal((await search(`q => 'thanaka'`)).length, 2, 'search by name, any case');
assert.equal((await search(`category => 'phones'`)).length, 7, 'filter by category');
assert.equal((await search(`shop => '00000000-0000-0000-0000-00000000b002', page_size => 50`)).length, 25, 'filter by shop');
assert.deepEqual((await search(`min_price => 1000000`)).map(r => r.name), ['iPhone 13 128GB'], 'filter by price');
assert.equal((await search(`page_size => 5`)).length, 5, 'page size');
assert.equal((await search(`page_size => 500`)).length, 50, 'page size capped at 50');
const prices = (await search(`sort => 'price_asc'`)).map(r => r.price);
assert.deepEqual(prices, [...prices].sort((a, b) => a - b), 'sort by price');

// Checkout.
const pid = (name) => `md5('seed-product-${name.replaceAll("'", "''")}')::uuid`;
const POLO_M = `(select id from product_variants where name = 'M' and product_id = ${pid("Men's Polo Shirt")})`;
await seeded.exec(`
  update products set stock = 5 where name = 'Phone Case Clear';
  update products set stock = 2 where name = 'Cotton Longyi';
  update product_variants set stock = 3 where id = ${POLO_M};
`);
const ADDRESS = `'{"name": "Mg Mg", "phone": "09123456789", "address": "No. 1, Bogyoke Road", "city": "Yangon"}'`;
const cart = (product, qty, variant = 'null') =>
  `insert into cart_items (user_id, product_id, variant_id, quantity) values ('${BUY}', ${pid(product)}, ${variant}, ${qty})`;
const placeOrder = (method = 'cod') => `select * from place_order(${ADDRESS}, '${method}')`;

await asB(cart("Men's Polo Shirt", 1), true);
await failsB(placeOrder(), 'must pick a size for products with sizes');
await seeded.exec(`delete from cart_items`);

await asB(cart('Cotton Longyi', 1, POLO_M), true);
await failsB(placeOrder(), 'variant must belong to the product');
await seeded.exec(`delete from cart_items`);

await asB(cart('Cotton Longyi', 5), true);
await failsB(placeOrder(), 'cannot buy more than stock');
await seeded.exec(`delete from cart_items`);

await asB(cart('Phone Case Clear', 2), true);
await asB(cart('Cotton Longyi', 1), true);
await asB(cart("Men's Polo Shirt", 2, POLO_M), true);
await failsB(`select * from place_order('{"name": "Mg Mg", "address": "x"}')`, 'address needs a phone');
assert.equal((await asB(placeOrder(), true)).rows.length, 2, 'one order per shop');

const stock = async () => (await seeded.query(`select
  (select stock from products where name = 'Phone Case Clear') as phone_case,
  (select stock from products where name = 'Cotton Longyi') as longyi,
  (select stock from product_variants where id = ${POLO_M}) as polo_m,
  (select count(*) from cart_items)::int as cart`)).rows[0];
assert.deepEqual(await stock(), { phone_case: 3, longyi: 1, polo_m: 1, cart: 0 }, 'stock reduced, cart emptied');
const orders = (await seeded.query(
  `select o.id, o.total, s.name as shop from orders o join shops s on s.id = o.shop_id order by s.name`)).rows;
assert.deepEqual(orders.map(o => [o.shop, o.total]), [['Golden Land Store', 10000], ['Yangon Style', 59000]], 'totals per shop');
assert.equal((await seeded.query(`select 1 from order_items where product_name = 'Men''s Polo Shirt (M)'`)).rows.length, 1, 'variant name kept');
const [CASE_ORDER, STYLE_ORDER] = orders.map(o => o.id);

// Order status.
const SELLER1 = '00000000-0000-0000-0000-00000000a001';
const SELLER2 = '00000000-0000-0000-0000-00000000a002';
const status = (order, s) => `select update_order_status('${order}', '${s}')`;
await failsB(status(STYLE_ORDER, 'shipped'), 'buyer cannot ship');
await fails(SELLER1, status(STYLE_ORDER, 'shipped'), 'other seller cannot ship', seeded);
await fails(SELLER2, status(STYLE_ORDER, 'delivered'), 'cannot skip shipped', seeded);
await runAs(seeded, SELLER2, status(STYLE_ORDER, 'shipped'), true);
await runAs(seeded, SELLER2, status(STYLE_ORDER, 'delivered'), true);
await failsB(status(STYLE_ORDER, 'cancelled'), 'cannot cancel after shipping');
await asB(status(STYLE_ORDER, 'completed'), true);

// Ratings update when a review is added; sellers cannot fake them.
await asB(`insert into reviews (product_id, buyer_id, rating) values (${pid('Cotton Longyi')}, '${BUY}', 4)`, true);
const rating = (await seeded.query(`select rating_avg, rating_count from products where name = 'Cotton Longyi'`)).rows[0];
assert.deepEqual([Number(rating.rating_avg), rating.rating_count], [4, 1], 'rating cached on product');
await fails(SELLER2, `update products set rating_avg = 5 where name = 'Cotton Longyi'`, 'seller cannot set rating', seeded);

// Cancelling puts stock back.
await asB(status(CASE_ORDER, 'cancelled'), true);
assert.equal((await stock()).phone_case, 5, 'stock restored on cancel');

// Only the server can mark an order paid, and never a cash-on-delivery one.
await asB(cart('Phone Case Clear', 1), true);
const kbz = (await asB(placeOrder('kbzpay'), true)).rows[0].place_order;
await failsB(`select mark_order_paid('${kbz}', 'ref1')`, 'buyer cannot mark paid');
await assert.rejects(runAs(seeded, BUY, `select mark_order_paid('${STYLE_ORDER}', 'x')`, false, 'service_role'), undefined, 'cod cannot be marked paid');
await runAs(seeded, BUY, `select mark_order_paid('${kbz}', 'ref1')`, true, 'service_role');
assert.equal((await seeded.query(`select status from orders where id = '${kbz}'`)).rows[0].status, 'paid', 'server marks paid');

console.log('All schema, security, storage, seed, search, checkout and order checks passed');

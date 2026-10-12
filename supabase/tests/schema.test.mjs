// Checks the schema and RLS rules on in-memory Postgres. Run: npm i -D @electric-sql/pglite && node supabase/tests/schema.test.mjs supabase/migrations/20261012000000_initial_schema.sql
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon;
  create role authenticated;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
  -- Supabase grants everything on new public tables to these roles by default.
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`);
await db.exec(readFileSync(process.argv[2], 'utf8'));

const SELLER = '11111111-1111-1111-1111-111111111111';
const BUYER = '22222222-2222-2222-2222-222222222222';
const OTHER = '33333333-3333-3333-3333-333333333333';
await db.exec(`
  insert into auth.users values
    ('${SELLER}', '{"role":"seller","full_name":"Seller"}'),
    ('${BUYER}', '{"full_name":"Buyer"}'),
    ('${OTHER}', '{"role":"admin"}');
  insert into categories (name, slug) values ('Phones', 'phones');
`);

const roles = (await db.query('select id, role from profiles order by id')).rows.map(r => r.role);
assert.deepEqual(roles, ['seller', 'buyer', 'buyer'], 'sign-up trigger sets roles; unknown role -> buyer');

// Run sql as a logged-in user, inside a transaction that is always rolled back unless keep=true.
async function as(user, sql, keep = false) {
  await db.exec(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '${user}', true);`);
  try { return await db.query(sql); }
  finally { await db.exec(keep ? 'commit' : 'rollback'); }
}
async function fails(user, sql, msg) {
  await assert.rejects(as(user, sql), undefined, msg);
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

console.log('All schema and security checks passed');

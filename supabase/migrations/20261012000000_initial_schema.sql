-- Initial schema: accounts, shops, catalog, cart, orders, reviews.
-- Money is stored as whole integers in the smallest currency unit (no floats).
-- Orders are written only by our server API (service key), so clients get read-only access to them.

create type user_role as enum ('buyer', 'seller');
create type order_status as enum ('pending', 'paid', 'shipped', 'delivered', 'completed', 'cancelled');

-- Accounts ---------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  role user_role not null default 'buyer',
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

-- Create a profile for every new sign-up; role comes from sign-up metadata ({ role: 'seller' }).
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, role, full_name)
  values (
    new.id,
    case when new.raw_user_meta_data->>'role' = 'seller' then 'seller'::user_role else 'buyer'::user_role end,
    new.raw_user_meta_data->>'full_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create table shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references profiles on delete cascade,
  name text not null,
  description text,
  logo_url text,
  created_at timestamptz not null default now()
);

-- Catalog ----------------------------------------------------------------

create table categories (
  id serial primary key,
  name text not null unique,
  slug text not null unique
);

create table products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops on delete cascade,
  category_id int references categories on delete set null,
  name text not null,
  description text,
  price int not null check (price >= 0),
  stock int not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products on delete cascade,
  url text not null,
  position int not null default 0
);

-- Cart (one row per user + product) --------------------------------------

create table cart_items (
  user_id uuid not null references profiles on delete cascade,
  product_id uuid not null references products on delete cascade,
  quantity int not null check (quantity > 0),
  added_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- Orders (one order per shop, like Shopee) -------------------------------

create table orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references profiles on delete restrict,
  shop_id uuid not null references shops on delete restrict,
  status order_status not null default 'pending',
  total int not null check (total >= 0),
  shipping_address jsonb not null,
  payment_ref text,
  created_at timestamptz not null default now()
);

-- Name and price are copied at purchase time so later product edits don't change past orders.
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders on delete cascade,
  product_id uuid references products on delete set null,
  product_name text not null,
  unit_price int not null check (unit_price >= 0),
  quantity int not null check (quantity > 0)
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products on delete cascade,
  buyer_id uuid not null references profiles on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (product_id, buyer_id)
);

-- Indexes for foreign keys we filter by ----------------------------------

create index on products (shop_id);
create index on products (category_id);
create index on product_images (product_id);
create index on orders (buyer_id);
create index on orders (shop_id);
create index on order_items (order_id);
create index on reviews (product_id);

-- Row level security: Supabase exposes every table to the browser, so lock all of them down.

alter table profiles enable row level security;
alter table shops enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table product_images enable row level security;
alter table cart_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table reviews enable row level security;

create policy "own profile read" on profiles for select using (id = (select auth.uid()));
create policy "own profile update" on profiles for update using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- Only name and phone are editable, so a buyer can't make themselves a seller from the browser.
revoke update on profiles from anon, authenticated;
grant update (full_name, phone) on profiles to authenticated;

create policy "shops public read" on shops for select using (true);
create policy "sellers create own shop" on shops for insert with check (
  owner_id = (select auth.uid())
  and exists (select 1 from profiles where id = (select auth.uid()) and role = 'seller')
);
create policy "owners update shop" on shops for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "categories public read" on categories for select using (true);

create policy "products public read" on products for select using (
  is_active or exists (select 1 from shops where shops.id = shop_id and shops.owner_id = (select auth.uid()))
);
create policy "owners write products" on products for all
  using (exists (select 1 from shops where shops.id = shop_id and shops.owner_id = (select auth.uid())))
  with check (exists (select 1 from shops where shops.id = shop_id and shops.owner_id = (select auth.uid())));

create policy "images public read" on product_images for select using (true);
create policy "owners write images" on product_images for all
  using (exists (
    select 1 from products join shops on shops.id = products.shop_id
    where products.id = product_id and shops.owner_id = (select auth.uid())))
  with check (exists (
    select 1 from products join shops on shops.id = products.shop_id
    where products.id = product_id and shops.owner_id = (select auth.uid())));

create policy "own cart" on cart_items for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "buyer or seller reads order" on orders for select using (
  buyer_id = (select auth.uid())
  or exists (select 1 from shops where shops.id = shop_id and shops.owner_id = (select auth.uid()))
);

create policy "buyer or seller reads order items" on order_items for select using (
  exists (
    select 1 from orders left join shops on shops.id = orders.shop_id
    where orders.id = order_id
      and (orders.buyer_id = (select auth.uid()) or shops.owner_id = (select auth.uid())))
);

create policy "reviews public read" on reviews for select using (true);
-- Only buyers whose order with this product was delivered can review.
create policy "delivered buyers review" on reviews for insert with check (
  buyer_id = (select auth.uid())
  and exists (
    select 1 from orders join order_items on order_items.order_id = orders.id
    where orders.buyer_id = (select auth.uid())
      and order_items.product_id = reviews.product_id
      and orders.status in ('delivered', 'completed'))
);
create policy "own review delete" on reviews for delete using (buyer_id = (select auth.uid()));

-- Phase 3: product variants, ratings, product cards and search.
-- Burmese has no spaces between words, so search uses substring matching (pg_trgm), not word-based full-text search.

create extension if not exists pg_trgm;

-- Variants (size / colour). If a product has variants, stock and price come from the variant.
create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  price int check (price >= 0),
  stock int not null default 0 check (stock >= 0),
  unique (product_id, name)
);
create index on product_variants (product_id);

alter table product_variants enable row level security;
create policy "variants public read" on product_variants for select using (true);
create policy "owners write variants" on product_variants for all
  using (exists (
    select 1 from products join shops on shops.id = products.shop_id
    where products.id = product_id and shops.owner_id = (select auth.uid())))
  with check (exists (
    select 1 from products join shops on shops.id = products.shop_id
    where products.id = product_id and shops.owner_id = (select auth.uid())));

-- Cart rows can now point at a variant; one row per user + product + variant.
alter table cart_items drop constraint cart_items_pkey;
alter table cart_items add column id uuid primary key default gen_random_uuid();
alter table cart_items add column variant_id uuid references product_variants on delete cascade;
alter table cart_items add constraint cart_items_line_unique unique nulls not distinct (user_id, product_id, variant_id);
alter table cart_items add constraint cart_items_quantity_max check (quantity <= 99);

-- Ratings are cached on the product so lists can sort and filter by them cheaply.
alter table products add column rating_avg numeric(2, 1) not null default 0;
alter table products add column rating_count int not null default 0;

create function refresh_product_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.product_id, old.product_id);
begin
  update products set
    rating_avg = coalesce((select round(avg(rating), 1) from reviews where product_id = pid), 0),
    rating_count = (select count(*) from reviews where product_id = pid)
  where id = pid;
  return null;
end;
$$;

create trigger reviews_refresh_rating
  after insert or update or delete on reviews
  for each row execute function refresh_product_rating();

-- Sellers write products directly through RLS, so limit which columns they can set (not ratings or shop).
revoke insert, update on products from anon, authenticated;
grant insert (id, shop_id, category_id, name, description, price, stock, is_active) on products to authenticated;
grant update (category_id, name, description, price, stock, is_active) on products to authenticated;

-- Size limits on text people type in, since the browser writes some tables directly.
alter table products add constraint products_name_length check (char_length(name) between 1 and 200);
alter table products add constraint products_description_length check (char_length(description) <= 5000);
alter table shops add constraint shops_name_length check (char_length(name) between 1 and 100);
alter table shops add constraint shops_description_length check (char_length(description) <= 2000);
alter table profiles add constraint profiles_full_name_length check (char_length(full_name) <= 100);
alter table profiles add constraint profiles_phone_length check (char_length(phone) <= 30);
alter table reviews add constraint reviews_comment_length check (char_length(comment) <= 2000);
alter table product_images add constraint product_images_url_length check (char_length(url) <= 1000);

create index products_name_trgm on products using gin (name gin_trgm_ops);
create index on products (created_at desc);
create index on products (price);

-- One row per visible product, with what a product card needs. security_invoker keeps RLS in force.
create view product_cards with (security_invoker = true) as
select
  p.id, p.name, p.price, p.stock, p.rating_avg, p.rating_count, p.created_at,
  p.category_id, c.slug as category_slug, p.shop_id, s.name as shop_name,
  (select i.url from product_images i where i.product_id = p.id order by i.position limit 1) as image_url
from products p
join shops s on s.id = p.shop_id
left join categories c on c.id = p.category_id
where p.is_active;

-- Search, category pages and shop pages all use this. sort: newest | price_asc | price_desc | rating.
create function search_products(
  q text default null,
  category text default null,
  shop uuid default null,
  min_price int default null,
  max_price int default null,
  min_rating numeric default null,
  sort text default 'newest',
  page int default 0,
  page_size int default 20
) returns setof product_cards
language sql stable as $$
  select * from product_cards
  where (q is null or name ilike '%' || q || '%')
    and (category is null or category_slug = category)
    and (shop is null or shop_id = shop)
    and (min_price is null or price >= min_price)
    and (max_price is null or price <= max_price)
    and (min_rating is null or rating_avg >= min_rating)
  order by
    case when sort = 'price_asc' then price end asc,
    case when sort = 'price_desc' then price end desc,
    case when sort = 'rating' then rating_avg end desc,
    created_at desc, id
  limit least(greatest(page_size, 1), 50)
  offset greatest(page, 0) * least(greatest(page_size, 1), 50);
$$;

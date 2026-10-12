-- Phase 4-5: checkout (cart -> orders, stock reduced safely) and order status changes.
-- The browser calls these with supabase.rpc(...). Each runs as one transaction: all or nothing.

create type payment_method as enum ('cod', 'kbzpay', 'wavepay', 'test');

alter table orders add column payment_method payment_method not null default 'cod';
alter table order_items add column variant_id uuid references product_variants on delete set null;

-- Turns the caller's cart into one order per shop, reduces stock, empties the cart. Returns the new order ids.
-- shipping_address must have name, phone and address, e.g. {"name": "...", "phone": "09...", "address": "...", "city": "Yangon"}.
create function place_order(shipping_address jsonb, payment_method payment_method default 'cod')
returns setof uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  problem text;
  shop record;
  new_order uuid;
begin
  if uid is null then
    raise exception 'Please log in first';
  end if;
  if coalesce(trim(shipping_address->>'name'), '') = ''
     or coalesce(trim(shipping_address->>'phone'), '') = ''
     or coalesce(trim(shipping_address->>'address'), '') = '' then
    raise exception 'Shipping address needs name, phone and address';
  end if;
  if length(shipping_address::text) > 2000 then
    raise exception 'Shipping address is too long';
  end if;
  if not exists (select 1 from cart_items where user_id = uid) then
    raise exception 'Your cart is empty';
  end if;

  -- Lock the stock rows so two buyers can't both buy the last item.
  perform 1 from products where id in (select product_id from cart_items where user_id = uid) for update;
  perform 1 from product_variants where id in (select variant_id from cart_items where user_id = uid) for update;

  select string_agg(p.name, ', ') into problem
  from cart_items c
  join products p on p.id = c.product_id
  left join product_variants v on v.id = c.variant_id and v.product_id = c.product_id
  where c.user_id = uid
    and (not p.is_active
      or (c.variant_id is not null and v.id is null)
      or (c.variant_id is null and exists (select 1 from product_variants pv where pv.product_id = p.id))
      or c.quantity > coalesce(v.stock, p.stock));
  if problem is not null then
    raise exception 'Not available in that quantity: %', problem;
  end if;

  for shop in
    select distinct p.shop_id from cart_items c join products p on p.id = c.product_id where c.user_id = uid
  loop
    insert into orders (buyer_id, shop_id, total, shipping_address, payment_method)
    select uid, shop.shop_id, sum(c.quantity * coalesce(v.price, p.price)), place_order.shipping_address, place_order.payment_method
    from cart_items c
    join products p on p.id = c.product_id
    left join product_variants v on v.id = c.variant_id
    where c.user_id = uid and p.shop_id = shop.shop_id
    returning id into new_order;

    insert into order_items (order_id, product_id, variant_id, product_name, unit_price, quantity)
    select new_order, p.id, v.id, p.name || coalesce(' (' || v.name || ')', ''), coalesce(v.price, p.price), c.quantity
    from cart_items c
    join products p on p.id = c.product_id
    left join product_variants v on v.id = c.variant_id
    where c.user_id = uid and p.shop_id = shop.shop_id;

    return next new_order;
  end loop;

  update products p set stock = p.stock - c.quantity
  from cart_items c where c.user_id = uid and c.product_id = p.id and c.variant_id is null;
  update product_variants v set stock = v.stock - c.quantity
  from cart_items c where c.user_id = uid and c.variant_id = v.id;
  delete from cart_items where user_id = uid;
end;
$$;

-- Who can move an order where:
--   seller: paid -> shipped (cash on delivery: pending -> shipped), shipped -> delivered
--   buyer:  delivered -> completed
--   either: pending -> cancelled (stock goes back)
create function update_order_status(order_id uuid, new_status order_status)
returns void
language plpgsql security definer set search_path = public as $$
declare
  o orders;
  is_buyer boolean;
  is_seller boolean;
begin
  select * into o from orders where id = order_id for update;
  if not found then
    raise exception 'Order not found';
  end if;
  is_buyer := o.buyer_id = auth.uid();
  is_seller := exists (select 1 from shops where id = o.shop_id and owner_id = auth.uid());

  if not (
    (is_seller and new_status = 'shipped' and (o.status = 'paid' or (o.status = 'pending' and o.payment_method = 'cod')))
    or (is_seller and new_status = 'delivered' and o.status = 'shipped')
    or (is_buyer and new_status = 'completed' and o.status = 'delivered')
    or ((is_buyer or is_seller) and new_status = 'cancelled' and o.status = 'pending')
  ) then
    raise exception 'Cannot change this order from % to %', o.status, new_status;
  end if;

  if new_status = 'cancelled' then
    update products p set stock = p.stock + i.quantity
    from order_items i where i.order_id = o.id and i.product_id = p.id and i.variant_id is null;
    update product_variants v set stock = v.stock + i.quantity
    from order_items i where i.order_id = o.id and i.variant_id = v.id;
  end if;

  update orders set status = new_status where id = o.id;
end;
$$;

-- Called only by our server (secret key) when KBZPay/WavePay/test payment confirms. Browsers cannot call it.
create function mark_order_paid(order_id uuid, payment_ref text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update orders set status = 'paid', payment_ref = mark_order_paid.payment_ref
  where id = order_id and status = 'pending' and payment_method <> 'cod';
  if not found then
    raise exception 'Order is not waiting for payment';
  end if;
end;
$$;

revoke execute on function place_order, update_order_status, mark_order_paid from public, anon, authenticated;
grant execute on function place_order, update_order_status to authenticated;
grant execute on function mark_order_paid to service_role;

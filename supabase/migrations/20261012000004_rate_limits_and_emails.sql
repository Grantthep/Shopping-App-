-- Phase 5-6: rate limits against spam, and order emails (new order -> seller, shipped -> buyer).

-- Rate limits ------------------------------------------------------------

create table rate_limits (
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index on rate_limits (user_id, action, created_at);
-- RLS on with no policies: only the functions below can touch this table.
alter table rate_limits enable row level security;

-- Raises an error if the current user did `action` max_count times within `per`; otherwise records it.
create function check_rate_limit(action text, max_count int, per interval) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    return; -- server/seed work, not a browser user
  end if;
  delete from rate_limits r where r.user_id = uid and r.created_at < now() - interval '1 day';
  if (select count(*) from rate_limits r
      where r.user_id = uid and r.action = check_rate_limit.action and r.created_at > now() - per) >= max_count then
    raise exception 'Too many requests. Please wait a few minutes and try again.';
  end if;
  insert into rate_limits (user_id, action) values (uid, check_rate_limit.action);
end;
$$;
revoke execute on function check_rate_limit from public, anon, authenticated;

create function rate_limit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform check_rate_limit(tg_table_name, tg_argv[0]::int, tg_argv[1]::interval);
  return new;
end;
$$;

create trigger products_rate_limit before insert on products
  for each row execute function rate_limit_trigger('30', '1 hour');
create trigger reviews_rate_limit before insert on reviews
  for each row execute function rate_limit_trigger('20', '1 hour');
create trigger cart_items_rate_limit before insert on cart_items
  for each row execute function rate_limit_trigger('60', '10 minutes');

-- Checkout: at most 5 checkouts per 10 minutes per user.
create function orders_rate_limit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- One checkout can create several orders (one per shop); count it once per transaction.
  if not exists (select 1 from orders where buyer_id = new.buyer_id and id <> new.id
                 and created_at = new.created_at) then
    perform check_rate_limit('checkout', 5, '10 minutes');
  end if;
  return new;
end;
$$;
create trigger orders_rate_limit before insert on orders
  for each row execute function orders_rate_limit_trigger();

-- Order emails -----------------------------------------------------------
-- Sent through Resend (resend.com) with pg_net, which posts in the background after the order is saved.
-- Off until the API key is stored in Vault (see docs/manual-steps.md):
--   select vault.create_secret('re_...', 'resend_api_key');
--   select vault.create_secret('Shop <orders@yourdomain.com>', 'email_from');   -- optional

create extension if not exists pg_net;

create function send_order_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  api_key text;
  sender text;
  recipient text;
  subject text;
  body text;
  shop_name text;
  order_no text := upper(left(new.id::text, 8));
begin
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key';
  if api_key is null then
    return null;
  end if;
  select decrypted_secret into sender from vault.decrypted_secrets where name = 'email_from';
  select name into shop_name from shops where id = new.shop_id;

  if tg_op = 'INSERT' then
    select u.email into recipient from shops s join auth.users u on u.id = s.owner_id where s.id = new.shop_id;
    subject := 'New order ' || order_no || ' for ' || shop_name;
    body := format(E'You have a new order (%s) for %s Ks.\nPayment: %s\n\nOpen your seller dashboard to prepare it.',
      order_no, to_char(new.total, 'FM999,999,999,999'), case new.payment_method when 'cod' then 'cash on delivery' else new.payment_method::text end);
  elsif new.status = 'shipped' and old.status is distinct from 'shipped' then
    select email into recipient from auth.users where id = new.buyer_id;
    subject := 'Your order ' || order_no || ' from ' || shop_name || ' has shipped';
    body := format(E'Good news! %s has shipped your order %s.\n\nYou can follow it in My Orders.', shop_name, order_no);
  else
    return null;
  end if;

  if recipient is null then
    return null;
  end if;

  -- An email problem must never block an order.
  begin
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'from', coalesce(sender, 'Shopping App <onboarding@resend.dev>'),
        'to', recipient, 'subject', subject, 'text', body)
    );
  exception when others then
    raise warning 'order email not sent: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger orders_send_email
  after insert or update of status on orders
  for each row execute function send_order_email();

# API contract (frontend ↔ backend)

How the pages get and change data. Everything below is called from the browser with the
Supabase client (`@supabase/supabase-js`) using the **publishable** key. The database's security
rules decide who may do what, so the page code doesn't need to check permissions itself.

- Prices are whole **kyat** (`int`), never decimals. Show them as `price.toLocaleString() + ' Ks'`.
- Errors come back as `{ error }` with a readable `error.message` (e.g. "Your cart is empty"). Show it to the user.
- Order statuses: `pending → paid → shipped → delivered → completed`, or `cancelled`.
  Cash on delivery skips `paid` (`pending → shipped`).

- Spam limits: 5 checkouts per 10 min, 30 new products per hour, 20 reviews per hour, 60 cart adds
  per 10 min per user. Going over returns "Too many requests…"; show the message.
- Emails are automatic (new order → seller, shipped → buyer); the frontend does nothing.

Not built yet: KBZPay/WavePay payments. Checkout uses cash on delivery (`payment_method: 'cod'`).

## Accounts

| Action | Call |
|---|---|
| Sign up (buyer) | `supabase.auth.signUp({ email, password, options: { data: { full_name } } })` |
| Sign up (seller) | same, with `data: { full_name, role: 'seller' }` |
| Log in / out | `supabase.auth.signInWithPassword({ email, password })` / `supabase.auth.signOut()` |
| My profile | `supabase.from('profiles').select('*').single()` → `{ id, role, full_name, phone }` |
| Edit profile | `supabase.from('profiles').update({ full_name, phone }).eq('id', user.id)` (role can't be changed) |

## Browsing

**Product lists** (home feed, search, category page, shop page) all use one function:

```ts
const { data } = await supabase.rpc('search_products', {
  q: 'thanaka',          // optional, matches name/any case, works for Burmese
  category: 'beauty',    // optional, category slug
  shop: shopId,          // optional
  min_price: 1000,       // optional
  max_price: 50000,      // optional
  min_rating: 4,         // optional
  sort: 'newest',        // 'newest' | 'price_asc' | 'price_desc' | 'rating'
  page: 0,               // 0, 1, 2… for infinite scroll
  page_size: 20,         // max 50
});
```

Each row: `{ id, name, price, stock, rating_avg, rating_count, created_at, category_id,
category_slug, shop_id, shop_name, image_url }`. Fewer rows than `page_size` = last page.

| Data | Call |
|---|---|
| Categories | `supabase.from('categories').select('id, name, slug').order('name')` |
| Product detail | `supabase.from('products').select('*, shops(id, name, logo_url), product_images(url, position), product_variants(id, name, price, stock)').eq('id', id).single()` |
| Shop info | `supabase.from('shops').select('*').eq('id', id).single()` |
| Reviews | `supabase.from('reviews').select('rating, comment, created_at').eq('product_id', id).order('created_at', { ascending: false })` |

Variants: if `product_variants` is not empty, the buyer must pick one; use the variant's `price`
(or the product's price when the variant's is `null`) and the variant's `stock`.

## Cart (must be logged in)

| Action | Call |
|---|---|
| View | `supabase.from('cart_items').select('id, quantity, variant_id, products(id, name, price, stock, shop_id, shops(name), product_images(url)), product_variants(name, price, stock)')` |
| Add | `supabase.from('cart_items').insert({ user_id: user.id, product_id, variant_id, quantity })` (same item twice → error; update instead) |
| Change quantity | `supabase.from('cart_items').update({ quantity }).eq('id', cartItemId)` (1–99) |
| Remove | `supabase.from('cart_items').delete().eq('id', cartItemId)` |

Group the cart by shop on screen: checkout makes **one order per shop**.

## Checkout

```ts
const { data: orderIds, error } = await supabase.rpc('place_order', {
  shipping_address: { name, phone, address, city },   // name, phone, address are required
  payment_method: 'cod',                               // 'cod' for now; 'kbzpay' | 'wavepay' later
});
```

All-or-nothing: checks stock, creates the orders, reduces stock, empties the cart. If anything is
out of stock nothing happens and `error.message` names the products.

## Orders

| Action | Call |
|---|---|
| Buyer: my orders | `supabase.from('orders').select('*, shops(name), order_items(*)').eq('buyer_id', user.id).order('created_at', { ascending: false })` |
| Seller: shop orders | same with `.eq('shop_id', myShopId)` |
| Change status | `supabase.rpc('update_order_status', { order_id, new_status })` |

Who can press which button:

| Button | Who | From → to |
|---|---|---|
| Mark shipped | seller | `paid → shipped`, or `pending → shipped` for cash on delivery |
| Mark delivered | seller | `shipped → delivered` |
| Order received | buyer | `delivered → completed` |
| Cancel | buyer or seller | `pending → cancelled` (stock goes back) |

## Reviews

`supabase.from('reviews').insert({ product_id, buyer_id: user.id, rating, comment })`. Rating 1–5, one per
product per buyer, only after the order is `delivered` or `completed`. The product's
`rating_avg` and `rating_count` update automatically.

## Seller: shop and products

| Action | Call |
|---|---|
| Open shop (sellers only, one each) | `supabase.from('shops').insert({ owner_id: user.id, name, description })` |
| My shop | `supabase.from('shops').select('*').eq('owner_id', user.id).single()` |
| Add product | `supabase.from('products').insert({ shop_id, category_id, name, description, price, stock }).select().single()` |
| Edit product | `supabase.from('products').update({ name, description, price, stock, category_id, is_active }).eq('id', id)` |
| Hide / delete | `update({ is_active: false })` to hide (keeps order history tidy), or `.delete()` |
| Variants | `supabase.from('product_variants').insert({ product_id, name: 'M', price: null, stock: 5 })` |

**Photos:** upload to the `product-images` bucket inside a folder named after the seller's user id
(JPG/PNG/WebP, max 5 MB), then save the public URL:

```ts
const path = `${user.id}/${productId}/${file.name}`;
await supabase.storage.from('product-images').upload(path, file);
const { data } = supabase.storage.from('product-images').getPublicUrl(path);
await supabase.from('product_images').insert({ product_id: productId, url: data.publicUrl, position: 0 });
```

## Test data

`supabase/seed.sql` adds 8 categories, 2 shops and 50 products (sizes on "Men's Polo Shirt" and
"Canvas Sneakers"). Product photos are placeholders from `picsum.photos`: add it to
`images.remotePatterns` in `next.config.ts` to show them with `next/image`.

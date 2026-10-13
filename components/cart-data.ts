import { createClient } from "@/lib/supabase/client";

// Cart "View" call from docs/api-contract.md, shared by /cart and /checkout
export const loadCart = () =>
  createClient()
    .from("cart_items")
    .select(
      "id, quantity, variant_id, products(id, name, price, stock, shop_id, shops(name), product_images(url)), product_variants(name, price, stock)",
    )
    .order("added_at"); // stable order: rows can otherwise come back shuffled after an update
export type Item = NonNullable<Awaited<ReturnType<typeof loadCart>>["data"]>[number];

// A variant's price falls back to the product's; its stock is its own
export const priceOf = (i: Item) => i.product_variants?.price ?? i.products!.price;
export const stockOf = (i: Item) => i.product_variants?.stock ?? i.products!.stock;
export const totalOf = (items: Item[]) => items.reduce((sum, i) => sum + priceOf(i) * i.quantity, 0);
export const ks = (n: number) => n.toLocaleString() + " Ks";

// Checkout makes one order per shop, so lines are shown grouped by shop.
// Not Map.groupBy: missing before iOS 17.4, still common on phones here.
export function groupByShop(items: Item[]) {
  const shops = new Map<string, Item[]>();
  for (const i of items) shops.set(i.products!.shop_id, [...(shops.get(i.products!.shop_id) ?? []), i]);
  return [...shops.values()];
}

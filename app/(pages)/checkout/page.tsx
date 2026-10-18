"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CART_UPDATED } from "@/components/cart-badge";
import { groupByShop, ks, loadCart, priceOf, totalOf, type Item } from "@/components/cart-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const payments = [
  { value: "cod", label: "Cash on delivery" },
  { value: "kbzpay", label: "KBZPay", soon: true },
  { value: "wavepay", label: "WavePay", soon: true },
];

export default function CheckoutPage() {
  const router = useRouter();
  const [data, setData] = useState<{ items: Item[]; name: string; phone: string }>();
  const [error, setError] = useState<string>();
  const [placing, setPlacing] = useState(false);
  // Set synchronously: two taps in a row can both run before the disabled button re-renders
  const placingNow = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return router.replace("/login");
      const [cart, profile] = await Promise.all([loadCart(), supabase.from("profiles").select("*").single()]);
      if (cart.error) return setError(cart.error.message);
      if (profile.error) return setError(profile.error.message);
      const items = cart.data.filter((i) => i.products);
      if (items.length === 0) return router.replace("/cart");
      setData({ items, name: profile.data.full_name ?? "", phone: profile.data.phone ?? "" });
    });
  }, [router]);

  async function placeOrder(form: FormData) {
    if (placingNow.current) return;
    placingNow.current = true;
    setPlacing(true);
    setError(undefined);
    const field = (k: string) => String(form.get(k) ?? "").trim();
    const { data: orderIds, error } = await createClient().rpc("place_order", {
      shipping_address: { name: field("name"), phone: field("phone"), address: field("address"), city: field("city") },
      payment_method: "cod",
    });
    if (error) {
      setError(error.message);
      placingNow.current = false;
      return setPlacing(false);
    }
    window.dispatchEvent(new Event(CART_UPDATED)); // the cart is now empty
    // placing stays true: the button stays disabled while we leave the page
    router.replace(`/orders/success?ids=${orderIds.join(",")}`);
  }

  if (!data) return error ? <p className="text-destructive">{error}</p> : <p className="text-muted-foreground">Loading…</p>;
  const shops = groupByShop(data.items);

  return (
    <form
      className="mx-auto flex max-w-2xl flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault(); // not action={…}: React 19 clears the form after an action, losing input on errors
        placeOrder(new FormData(e.currentTarget));
      }}
    >
      <h1 className="text-xl font-semibold">Checkout</h1>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">Shipping address</legend>
        <label className="flex flex-col gap-1 text-sm">
          Name
          <Input name="name" defaultValue={data.name} autoComplete="name" required className="h-10" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Phone
          <Input name="phone" type="tel" defaultValue={data.phone} autoComplete="tel" required className="h-10" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Address
          <Input name="address" autoComplete="street-address" required className="h-10" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          City (optional)
          <Input name="city" autoComplete="address-level2" className="h-10" />
        </label>
      </fieldset>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Order summary</h2>
        <p className="text-sm text-muted-foreground">
          {shops.length} {shops.length === 1 ? "order" : "orders"}, one per shop
        </p>
        {shops.map((lines) => (
          <div key={lines[0].products!.shop_id} className="rounded-xl ring-1 ring-foreground/10">
            <h3 className="rounded-t-xl bg-secondary px-4 py-2 font-semibold text-secondary-foreground">
              {lines[0].products!.shops?.name}
            </h3>
            <ul className="divide-y text-sm">
              {lines.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 px-4 py-2">
                  <span>
                    {i.products!.name}
                    {i.product_variants && ` (${i.product_variants.name})`} × {i.quantity}
                  </span>
                  <span className="shrink-0">{ks(priceOf(i) * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <p className="flex justify-between border-t px-4 py-2 text-sm">
              <span>Subtotal</span>
              <span className="font-bold text-primary">{ks(totalOf(lines))}</span>
            </p>
          </div>
        ))}
        <p className="flex justify-between text-lg font-semibold">
          <span>Total</span>
          <span className="font-bold text-primary">{ks(totalOf(data.items))}</span>
        </p>
      </section>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold">Payment</legend>
        {payments.map((p) => (
          <label
            key={p.value}
            className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${p.soon ? "text-muted-foreground opacity-60" : "border-primary"}`}
          >
            <input type="radio" name="payment" value={p.value} defaultChecked={!p.soon} disabled={p.soon} className="size-4 accent-primary" />
            <span className="flex-1">{p.label}</span>
            {p.soon && <span className="text-xs">Coming soon</span>}
          </label>
        ))}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        disabled={placing}
        className="h-11 bg-accent text-base text-accent-foreground hover:bg-accent/80"
      >
        {placing ? "Placing order…" : "Place order"}
      </Button>
    </form>
  );
}

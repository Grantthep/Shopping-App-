"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ks } from "@/components/cart-data";
import { SellerGate, SellerNav, useSeller } from "@/components/seller";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SellerDashboard() {
  const seller = useSeller();
  const [stats, setStats] = useState<{ products: number; pending: number; sales: number }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const shopId = seller.state === "ready" ? seller.shop?.id : undefined;
  useEffect(() => {
    if (!shopId) return;
    const supabase = createClient();
    Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
      supabase.from("orders").select("status, total").eq("shop_id", shopId),
    ]).then(([products, orders]) => {
      if (products.error || orders.error) return setError((products.error ?? orders.error)!.message);
      setStats({
        products: products.count ?? 0,
        pending: orders.data.filter((o) => o.status === "pending").length,
        // Every order except cancelled ones
        sales: orders.data.filter((o) => o.status !== "cancelled").reduce((sum, o) => sum + o.total, 0),
      });
    });
  }, [shopId]);

  async function openShop(form: FormData) {
    if (seller.state !== "ready") return;
    setBusy(true);
    const { error } = await createClient()
      .from("shops")
      .insert({
        owner_id: seller.user.id,
        name: String(form.get("name")).trim(),
        description: String(form.get("description")).trim() || null,
      });
    setBusy(false);
    if (error) setError(error.message);
    else seller.reload();
  }

  if (seller.state !== "ready") return <SellerGate seller={seller} />;

  if (!seller.shop)
    return (
      <form
        className="mx-auto flex max-w-sm flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault(); // not action={…}: React 19 clears the form after an action, losing input on errors
          if (!busy) openShop(new FormData(e.currentTarget));
        }}
      >
        <h1 className="text-xl font-semibold">Open your shop</h1>
        <label className="flex flex-col gap-1 text-sm">
          Shop name
          <Input name="name" required maxLength={100} className="h-10" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Description (optional)
          <textarea
            name="description"
            maxLength={2000}
            rows={4}
            className="rounded-lg border border-input px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="h-11 text-base" disabled={busy}>
          Open shop
        </Button>
      </form>
    );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">{seller.shop.name}</h1>
        <SellerNav />
      </div>
      {error && <p className="text-destructive">{error}</p>}
      <dl className="grid grid-cols-3 gap-3 text-center">
        {[
          ["Products", stats?.products],
          ["Pending orders", stats?.pending],
          ["Total sales", stats && ks(stats.sales)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-secondary p-3 text-secondary-foreground">
            <dt className="text-xs">{label}</dt>
            <dd className="mt-1 text-lg font-bold text-primary">{value ?? "…"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

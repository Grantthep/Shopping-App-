"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ks } from "@/components/cart-data";
import { orderNo, StatusBadge, type OrderStatus } from "@/components/order-status";
import { NoShopYet, SellerGate, SellerNav, useSeller } from "@/components/seller";

// "Seller: shop orders" call from docs/api-contract.md
const loadOrders = (shopId: string) =>
  createClient()
    .from("orders")
    .select("*, shops(name), order_items(*)")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });
type Order = NonNullable<Awaited<ReturnType<typeof loadOrders>>["data"]>[number];

// "Pending" includes paid orders: both are waiting to be shipped
const tabs: { label: string; statuses?: OrderStatus[] }[] = [
  { label: "Pending", statuses: ["pending", "paid"] },
  { label: "Shipped", statuses: ["shipped"] },
  { label: "Delivered", statuses: ["delivered", "completed"] },
  { label: "All" },
];

export default function SellerOrders() {
  const seller = useSeller();
  const [orders, setOrders] = useState<Order[]>();
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState(0);

  const shopId = seller.state === "ready" ? seller.shop?.id : undefined;
  useEffect(() => {
    if (!shopId) return;
    loadOrders(shopId).then(({ data, error }) => (error ? setError(error.message) : setOrders(data)));
  }, [shopId]);

  if (seller.state !== "ready") return <SellerGate seller={seller} />;
  if (!seller.shop) return <NoShopYet />;

  const statuses = tabs[tab].statuses;
  const shown = orders?.filter((o) => !statuses || statuses.includes(o.status));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Shop orders</h1>
        <SellerNav />
      </div>
      <div role="tablist" aria-label="Filter orders" className="grid grid-cols-4 rounded-lg bg-muted p-1 text-sm">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            role="tab"
            aria-selected={tab === i}
            onClick={() => setTab(i)}
            className={`rounded-md py-1.5 ${tab === i ? "bg-background font-semibold text-primary shadow-sm" : "text-muted-foreground"}`}
          >
            {t.label}
            {orders && t.statuses && ` (${orders.filter((o) => t.statuses!.includes(o.status)).length})`}
          </button>
        ))}
      </div>
      {error && <p className="text-destructive">{error}</p>}
      {!shown ? (
        !error && <p className="text-muted-foreground">Loading orders…</p>
      ) : shown.length === 0 ? (
        <p className="text-muted-foreground">No orders here.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((o) => {
            const count = o.order_items.reduce((n, i) => n + i.quantity, 0);
            const buyer = (o.shipping_address as { name?: string } | null)?.name;
            return (
              <li key={o.id}>
                <Link
                  href={`/seller/orders/${o.id}`}
                  className="flex flex-col gap-1 rounded-xl p-4 ring-1 ring-foreground/10 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold">{orderNo(o.id)}</span>
                    <StatusBadge status={o.status} />
                  </span>
                  <span className="font-medium">{buyer}</span>
                  <span className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      {new Date(o.created_at).toLocaleDateString()} · {count} {count === 1 ? "item" : "items"}
                    </span>
                    <span className="text-base font-bold text-primary">{ks(o.total)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

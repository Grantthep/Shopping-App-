"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ks } from "@/components/cart-data";
import { orderNo, StatusBadge } from "@/components/order-status";

// "Buyer: my orders" call from docs/api-contract.md
const loadOrders = (userId: string) =>
  createClient()
    .from("orders")
    .select("*, shops(name), order_items(*)")
    .eq("buyer_id", userId)
    .order("created_at", { ascending: false });
type Order = NonNullable<Awaited<ReturnType<typeof loadOrders>>["data"]>[number];

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(async ({ data: { session } }) => {
        if (!session) return router.replace("/login");
        const { data, error } = await loadOrders(session.user.id);
        if (error) setError(error.message);
        else setOrders(data);
      });
  }, [router]);

  if (!orders) return error ? <p className="text-destructive">{error}</p> : <p className="text-muted-foreground">Loading orders…</p>;

  if (orders.length === 0)
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-lg font-semibold">You haven&apos;t ordered anything yet</p>
        <Link href="/" className="font-medium text-primary underline">
          Start shopping
        </Link>
      </div>
    );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <h1 className="mb-1 text-xl font-semibold">My orders</h1>
      <ul className="flex flex-col gap-3">
        {orders.map((o) => {
          const count = o.order_items.reduce((n, i) => n + i.quantity, 0);
          return (
            <li key={o.id}>
              <Link
                href={`/orders/${o.id}`}
                className="flex flex-col gap-1 rounded-xl p-4 ring-1 ring-foreground/10 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold">{orderNo(o.id)}</span>
                  <StatusBadge status={o.status} />
                </span>
                <span className="font-medium">{o.shops?.name}</span>
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
    </div>
  );
}

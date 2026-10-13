"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ks } from "@/components/cart-data";
import { orderNo, StatusBadge, type OrderStatus } from "@/components/order-status";
import { Button } from "@/components/ui/button";

// Same select as the contract's "Buyer: my orders", for one order
const loadOrder = (id: string) =>
  createClient().from("orders").select("*, shops(name), order_items(*)").eq("id", id).single();
type Order = NonNullable<Awaited<ReturnType<typeof loadOrder>>["data"]>;
type Address = { name?: string; phone?: string; address?: string; city?: string };

const payments: Record<string, string> = { cod: "Cash on delivery", kbzpay: "KBZPay", wavepay: "WavePay", test: "Test payment" };
const steps: OrderStatus[] = ["pending", "shipped", "delivered", "completed"];

// seller: the shop owner's view (seller buttons, no review forms)
export function OrderDetail({ seller = false }: { seller?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order>();
  const [buyerId, setBuyerId] = useState<string>();
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const busyNow = useRef(false); // set synchronously so a double tap can't send two status changes

  const load = useCallback(async () => {
    const { data, error } = await loadOrder(id);
    // PGRST116: no order with this id visible to me; 22P02: not a valid uuid
    if (["PGRST116", "22P02"].includes(error?.code ?? "")) return setError("Order not found");
    if (error) return setError(error.message);
    setOrder(data);
  }, [id]);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data: { session } }) => {
        if (!session) return router.replace("/login");
        setBuyerId(session.user.id);
        load();
      });
  }, [load, router]);

  // Products I've already reviewed, so their forms stay hidden
  const canReview = !seller && (order?.status === "delivered" || order?.status === "completed");
  const productIds = [...new Set(order?.order_items.flatMap((i) => (i.product_id ? [i.product_id] : [])) ?? [])];
  const productKey = productIds.join(",");
  useEffect(() => {
    if (!canReview || !buyerId || !productKey) return;
    createClient()
      .from("reviews")
      .select("product_id")
      .eq("buyer_id", buyerId)
      .in("product_id", productKey.split(","))
      .then(({ data, error }) => (error ? setError(error.message) : setReviewed(data.map((r) => r.product_id))));
  }, [canReview, buyerId, productKey]);

  async function setStatus(newStatus: OrderStatus) {
    if (busyNow.current || !order) return;
    busyNow.current = true;
    setBusy(true);
    setError(undefined);
    const { error } = await createClient().rpc("update_order_status", { order_id: order.id, new_status: newStatus });
    if (error) setError(error.message);
    await load();
    busyNow.current = false;
    setBusy(false);
  }

  if (!order) return error ? <p className="text-destructive">{error}</p> : <p className="text-muted-foreground">Loading order…</p>;

  const address = (order.shipping_address ?? {}) as Address;
  const current = order.status === "paid" ? 0 : steps.indexOf(order.status);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-mono text-xl font-semibold">Order {orderNo(order.id)}</h1>
          <p className="text-sm text-muted-foreground">
            {order.shops?.name} · {new Date(order.created_at).toLocaleString()}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {order.status === "cancelled" ? (
        <p className="rounded-lg bg-muted p-3 text-sm">This order was cancelled.</p>
      ) : (
        <ol className="grid grid-cols-4 text-center text-xs" aria-label="Order progress">
          {steps.map((s, i) => (
            <li key={s} aria-current={i === current ? "step" : undefined} className="flex flex-col items-center gap-1">
              <span
                className={`flex size-6 items-center justify-center rounded-full text-[11px] font-bold ${i <= current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              >
                {i + 1}
              </span>
              <span className={`capitalize ${i <= current ? "font-semibold text-primary" : "text-muted-foreground"}`}>{s}</span>
            </li>
          ))}
        </ol>
      )}

      <section className="rounded-xl ring-1 ring-foreground/10">
        <h2 className="rounded-t-xl bg-secondary px-4 py-2 font-semibold text-secondary-foreground">Items</h2>
        <ul className="divide-y text-sm">
          {order.order_items.map((i, idx) => (
            <li key={i.id} className="flex flex-col gap-3 px-4 py-3">
              <div className="flex justify-between gap-3">
                <span>
                  {i.product_id ? (
                    <Link href={`/product/${i.product_id}`} className="underline-offset-2 hover:underline">
                      {i.product_name}
                    </Link>
                  ) : (
                    i.product_name
                  )}
                  <span className="text-muted-foreground">
                    {" "}
                    × {i.quantity} @ {ks(i.unit_price)}
                  </span>
                </span>
                <span className="shrink-0">{ks(i.unit_price * i.quantity)}</span>
              </div>
              {/* one form per product: two sizes of the same product share one review */}
              {canReview && buyerId && i.product_id && !reviewed.includes(i.product_id) &&
                order.order_items.findIndex((x) => x.product_id === i.product_id) === idx && (
                <ReviewForm
                  productId={i.product_id}
                  productName={i.product_name}
                  buyerId={buyerId}
                  onDone={(pid) => setReviewed((r) => [...r, pid])}
                />
              )}
            </li>
          ))}
        </ul>
        <p className="flex justify-between border-t px-4 py-2">
          <span className="font-semibold">Total</span>
          <span className="text-lg font-bold text-primary">{ks(order.total)}</span>
        </p>
      </section>

      <section className="grid gap-1 text-sm">
        <h2 className="font-semibold">Shipping address</h2>
        <p>{address.name}</p>
        <p>{address.phone}</p>
        <p>{[address.address, address.city].filter(Boolean).join(", ")}</p>
        <h2 className="mt-3 font-semibold">Payment</h2>
        <p>{payments[order.payment_method] ?? order.payment_method}</p>
      </section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Buttons follow the "who can press which button" table; the database enforces it too */}
      {seller && (order.status === "paid" || (order.status === "pending" && order.payment_method === "cod")) && (
        <Button size="lg" className="h-11 text-base" disabled={busy} onClick={() => setStatus("shipped")}>
          Mark shipped
        </Button>
      )}
      {seller && order.status === "shipped" && (
        <Button size="lg" className="h-11 text-base" disabled={busy} onClick={() => setStatus("delivered")}>
          Mark delivered
        </Button>
      )}
      {!seller && order.status === "delivered" && (
        <Button size="lg" className="h-11 text-base" disabled={busy} onClick={() => setStatus("completed")}>
          Order received
        </Button>
      )}
      {order.status === "pending" && (
        <Button
          variant="outline"
          size="lg"
          className="h-11 text-base text-destructive"
          disabled={busy}
          onClick={() => confirm("Are you sure you want to cancel this order?") && setStatus("cancelled")}
        >
          Cancel order
        </Button>
      )}
    </div>
  );
}

function ReviewForm({
  productId,
  productName,
  buyerId,
  onDone,
}: {
  productId: string;
  productName: string;
  buyerId: string;
  onDone: (productId: string) => void;
}) {
  const [rating, setRating] = useState(0);
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);

  async function send(form: FormData) {
    if (!rating) return setError("Choose 1 to 5 stars");
    setSending(true);
    const comment = String(form.get("comment") ?? "").trim() || null;
    const { error } = await createClient().from("reviews").insert({ product_id: productId, buyer_id: buyerId, rating, comment });
    setSending(false);
    if (error) setError(error.message);
    else onDone(productId);
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-lg bg-muted p-3"
      onSubmit={(e) => {
        e.preventDefault(); // not action={…}: React 19 clears the form after an action, losing input on errors
        if (!sending) send(new FormData(e.currentTarget));
      }}
    >
      <fieldset>
        <legend className="mb-1 font-medium">Write a review: {productName}</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer rounded text-2xl leading-none has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
              <input
                type="radio"
                name="rating"
                value={n}
                checked={rating === n}
                onChange={() => {
                  setRating(n);
                  setError(undefined);
                }}
                className="sr-only"
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
              />
              <span aria-hidden className={n <= rating ? "text-primary" : "text-muted-foreground/50"}>
                ★
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <textarea
        name="comment"
        maxLength={2000}
        rows={3}
        placeholder="What did you think? (optional)"
        aria-label={`Comment on ${productName}`}
        className="rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={sending} className="self-start">
        Submit review
      </Button>
    </form>
  );
}

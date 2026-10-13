"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CART_UPDATED } from "@/components/cart-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { groupByShop, ks, loadCart, priceOf, stockOf, totalOf, type Item } from "@/components/cart-data";

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>();
  const [error, setError] = useState<string>();

  const reload = useCallback(
    () =>
      loadCart().then(({ data, error }) => {
        if (error) setError(error.message);
        else setItems(data.filter((i) => i.products));
      }),
    [],
  );

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => (data.session ? reload() : router.replace("/login")));
  }, [reload, router]);

  // Line being saved: its buttons stay disabled until the save and reload finish, so quick taps can't overlap
  const [saving, setSaving] = useState<string>();
  const savingNow = useRef(false); // set synchronously, before the disabled buttons re-render

  async function save(item: Item, call: () => PromiseLike<{ error: { message: string } | null }>) {
    if (savingNow.current) return;
    savingNow.current = true;
    setSaving(item.id);
    const { error } = await call();
    setError(error?.message);
    await reload();
    savingNow.current = false;
    setSaving(undefined);
    window.dispatchEvent(new Event(CART_UPDATED));
  }

  const setQuantity = (item: Item, quantity: number) =>
    save(item, () => createClient().from("cart_items").update({ quantity }).eq("id", item.id));
  const remove = (item: Item) => save(item, () => createClient().from("cart_items").delete().eq("id", item.id));

  if (!items) return error ? <p className="text-destructive">{error}</p> : <p className="text-muted-foreground">Loading cart…</p>;

  if (items.length === 0)
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-lg font-semibold">Your cart is empty</p>
        <Link href="/" className="font-medium text-primary underline">
          Continue shopping
        </Link>
      </div>
    );


  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold">Cart</h1>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {groupByShop(items).map((lines) => (
        <section key={lines[0].products!.shop_id} className="rounded-xl ring-1 ring-foreground/10">
          <h2 className="rounded-t-xl bg-secondary px-4 py-2 font-semibold text-secondary-foreground">
            {lines[0].products!.shops?.name}
          </h2>
          <ul className="divide-y">
            {lines.map((item) => {
              const product = item.products!;
              const stock = stockOf(item);
              const max = Math.min(99, stock);
              const photo = product.product_images[0]?.url;
              return (
                <li key={item.id} className="flex gap-3 p-4">
                  <Link href={`/product/${product.id}`} className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {photo && <Image src={photo} alt="" fill sizes="80px" className="object-cover" />}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link href={`/product/${product.id}`} className="line-clamp-2 text-sm">
                      {product.name}
                    </Link>
                    {item.product_variants && (
                      <p className="text-xs text-muted-foreground">Option: {item.product_variants.name}</p>
                    )}
                    <p className="font-bold text-primary">{ks(priceOf(item))}</p>
                    {item.quantity > stock && (
                      <p className="text-xs text-destructive">{stock > 0 ? `Only ${stock} left` : "Out of stock"}</p>
                    )}
                    <div className="mt-1 flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="Decrease quantity"
                        disabled={saving === item.id || item.quantity <= 1}
                        onClick={() => setQuantity(item, item.quantity - 1)}
                      >
                        <Minus />
                      </Button>
                      <span className="w-8 text-center tabular-nums" aria-label="Quantity">
                        {item.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="Increase quantity"
                        disabled={saving === item.id || item.quantity >= max}
                        onClick={() => setQuantity(item, item.quantity + 1)}
                      >
                        <Plus />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${product.name}`}
                        className="ml-auto text-muted-foreground"
                        disabled={saving === item.id}
                        onClick={() => remove(item)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="flex justify-between border-t px-4 py-2 text-sm">
            <span>Subtotal</span>
            <span className="font-bold text-primary">
              {ks(totalOf(lines))}
            </span>
          </p>
        </section>
      ))}

      <p className="flex justify-between text-lg font-semibold">
        <span>Total</span>
        <span className="font-bold text-primary">{ks(totalOf(items))}</span>
      </p>
      <Link
        href="/checkout"
        className={cn(buttonVariants({ size: "lg" }), "h-11 bg-accent text-base text-accent-foreground hover:bg-accent/80")}
      >
        Check out
      </Link>
    </div>
  );
}

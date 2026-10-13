"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ks } from "@/components/cart-data";
import { NoShopYet, SellerGate, SellerNav, useSeller } from "@/components/seller";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const loadProducts = (shopId: string) =>
  createClient()
    .from("products")
    .select("*, product_images(url, position), product_variants(stock)")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });
type Product = NonNullable<Awaited<ReturnType<typeof loadProducts>>["data"]>[number];

export default function SellerProducts() {
  const seller = useSeller();
  const [products, setProducts] = useState<Product[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();

  const shopId = seller.state === "ready" ? seller.shop?.id : undefined;
  const show = useCallback(
    ({ data, error }: Awaited<ReturnType<typeof loadProducts>>) => (error ? setError(error.message) : setProducts(data)),
    [],
  );
  useEffect(() => {
    if (shopId) loadProducts(shopId).then(show);
  }, [shopId, show]);

  // "Hide / delete" row of the contract: hide keeps order history tidy
  async function setActive(p: Product, is_active: boolean) {
    setBusy(p.id);
    const { error } = await createClient().from("products").update({ is_active }).eq("id", p.id);
    setError(error?.message);
    show(await loadProducts(p.shop_id));
    setBusy(undefined);
  }

  if (seller.state !== "ready") return <SellerGate seller={seller} />;
  if (!seller.shop) return <NoShopYet />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">My products</h1>
        <SellerNav />
      </div>
      <Link href="/seller/products/new" className={cn(buttonVariants({ size: "lg" }), "h-11 self-start text-base")}>
        <Plus /> Add product
      </Link>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!products ? (
        <p className="text-muted-foreground">Loading products…</p>
      ) : products.length === 0 ? (
        <p className="text-muted-foreground">No products yet.</p>
      ) : (
        <ul className="divide-y rounded-xl ring-1 ring-foreground/10">
          {products.map((p) => {
            const photo = [...p.product_images].sort((a, b) => a.position - b.position)[0]?.url;
            // With variants, stock is what the variants have
            const stock = p.product_variants.length ? p.product_variants.reduce((n, v) => n + v.stock, 0) : p.stock;
            return (
              <li key={p.id} className="flex gap-3 p-3">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {photo && <Image src={photo} alt="" fill sizes="64px" className="object-cover" />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="line-clamp-1 text-sm font-medium">{p.name}</p>
                  <p className="font-bold text-primary">{ks(p.price)}</p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{stock} in stock</span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-semibold ${p.is_active ? "bg-green-100 text-green-900" : "bg-zinc-200 text-zinc-700"}`}
                    >
                      {p.is_active ? "Active" : "Hidden"}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <Link href={`/seller/products/${p.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Edit
                  </Link>
                  <Button variant="ghost" size="sm" disabled={busy === p.id} onClick={() => setActive(p, !p.is_active)}>
                    {p.is_active ? "Hide" : "Show"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

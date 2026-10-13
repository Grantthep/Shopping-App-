"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import type { Database } from "@/lib/db/database.types";

type Product = Database["public"]["Functions"]["search_products"]["Returns"][number];

export function ProductList() {
  const q = useSearchParams().get("q")?.trim() || undefined;
  // Tagged with its query, so a result for an old query counts as "loading" without resetting state
  const [result, setResult] = useState<{ q?: string; products: Product[]; error?: string }>();

  useEffect(() => {
    let ignore = false;
    // shortcut: first page only (max 50 rows), add "load more" with `page` once there are more products
    createClient()
      .rpc("search_products", { q, sort: "newest", page: 0, page_size: 50 })
      .then(({ data, error }) => {
        if (!ignore) setResult({ q, products: data ?? [], error: error?.message });
      });
    return () => {
      ignore = true;
    };
  }, [q]);

  if (!result || result.q !== q) return <p className="text-muted-foreground">Loading products…</p>;
  if (result.error) return <p className="text-destructive">{result.error}</p>;
  const { products } = result;

  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">{q ? `Results for “${q}”` : "All products"}</h1>
      {products.length === 0 ? (
        <p className="text-muted-foreground">No products found.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {products.map((p) => (
            <li key={p.id}>
              <Card size="sm" className="h-full pt-0">
                <div className="relative aspect-square bg-muted">
                  {p.image_url && (
                    <Image
                      src={p.image_url}
                      alt={p.name ?? ""}
                      fill
                      sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
                      className="object-cover"
                    />
                  )}
                </div>
                <CardContent className="flex flex-col gap-1">
                  <p className="line-clamp-2">{p.name}</p>
                  <p className="font-bold text-primary">{(p.price ?? 0).toLocaleString()} Ks</p>
                  <p className="text-xs text-muted-foreground">{p.shop_name}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

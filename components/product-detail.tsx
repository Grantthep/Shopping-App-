"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

const load = async (id: string) => {
  const supabase = createClient();
  const [product, reviews] = await Promise.all([
    supabase
      .from("products")
      .select("*, shops(id, name, logo_url), product_images(url, position), product_variants(id, name, price, stock)")
      .eq("id", id)
      .single(),
    supabase
      .from("reviews")
      .select("rating, comment, created_at")
      .eq("product_id", id)
      .order("created_at", { ascending: false }),
  ]);
  const error = product.error ?? reviews.error;
  return { id, error: error?.message, product: product.data, reviews: reviews.data ?? [] };
};

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<Awaited<ReturnType<typeof load>>>();
  const [variantId, setVariantId] = useState<string>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    let ignore = false;
    load(id).then((r) => !ignore && setResult(r));
    return () => {
      ignore = true;
    };
  }, [id]);

  if (!result || result.id !== id) return <p className="text-muted-foreground">Loading product…</p>;
  if (result.error || !result.product) return <p className="text-destructive">{result.error}</p>;
  const { product, reviews } = result;

  const images = product.product_images.toSorted((a, b) => a.position - b.position);
  const variants = product.product_variants;
  const variant = variants.find((v) => v.id === variantId);
  // With variants, price and stock come from the chosen variant (price falls back to the product's)
  const price = variant?.price ?? product.price;
  const stock = variants.length ? variant?.stock : product.stock;

  function addToCart() {
    if (variants.length && !variant) setMessage("Choose an option first");
    // shortcut: login isn't built yet, insert into cart_items per docs/api-contract.md once it is
    else setMessage("Log in to add to cart");
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Swipeable gallery: one photo per screen width, snaps into place */}
      <div className="flex snap-x snap-mandatory overflow-x-auto rounded-xl bg-muted">
        {images.map((img, i) => (
          <div key={img.url} className="relative aspect-square w-full shrink-0 snap-center">
            <Image
              src={img.url}
              alt={`${product.name} photo ${i + 1} of ${images.length}`}
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
              priority={i === 0}
            />
          </div>
        ))}
        {images.length === 0 && <div className="aspect-square w-full" />}
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">{product.name}</h1>
        <p className="text-2xl font-bold text-primary">{price.toLocaleString()} Ks</p>
        <p className="text-sm text-muted-foreground">
          {product.shops?.name}
          {product.rating_count > 0 && ` · ★ ${product.rating_avg.toFixed(1)} (${product.rating_count})`}
        </p>

        {variants.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Choose an option</legend>
            <div className="flex flex-wrap gap-2">
              {variants.map((v) => (
                <Button
                  key={v.id}
                  variant={v.id === variantId ? "default" : "outline"}
                  aria-pressed={v.id === variantId}
                  disabled={v.stock === 0}
                  onClick={() => {
                    setVariantId(v.id);
                    setMessage(undefined);
                  }}
                >
                  {v.name}
                </Button>
              ))}
            </div>
          </fieldset>
        )}

        {stock !== undefined && (
          <p className="text-sm">{stock > 0 ? `${stock} in stock` : "Out of stock"}</p>
        )}

        <Button
          size="lg"
          className="h-11 bg-accent text-base text-accent-foreground hover:bg-accent/80"
          disabled={stock === 0}
          onClick={addToCart}
        >
          Add to cart
        </Button>
        {message && (
          <p role="status" className="text-sm font-medium text-primary">
            {message}
          </p>
        )}

        {product.description && <p className="whitespace-pre-line text-sm">{product.description}</p>}
      </div>

      <section className="md:col-span-2">
        <h2 className="mb-3 text-lg font-semibold">Reviews ({reviews.length})</h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviews yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {reviews.map((r, i) => (
              <li key={i} className="rounded-lg bg-muted p-3 text-sm">
                <p>
                  <span className="text-primary" role="img" aria-label={`${r.rating} out of 5 stars`}>
                    {"★".repeat(r.rating)}
                    {"☆".repeat(5 - r.rating)}
                  </span>{" "}
                  <span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                </p>
                {r.comment && <p className="mt-1">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

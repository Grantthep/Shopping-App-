"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Tables } from "@/lib/db/database.types";

const loadProduct = (id: string) =>
  createClient()
    .from("products")
    .select("*, product_images(id, url, position), product_variants(id, name, price, stock)")
    .eq("id", id)
    .single();
type Loaded = NonNullable<Awaited<ReturnType<typeof loadProduct>>["data"]>;

// Variant price/stock are strings while typing; blank price = use the product's price
type VariantRow = { key: string; id?: string; name: string; price: string; stock: string };
// Existing photos have an id; new ones carry the picked file and a local preview url
type Photo = { key: string; id?: string; url: string; file?: File };

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
const BUCKET = "product-images";
const fieldClass =
  "rounded-lg border border-input px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function ProductForm({ shopId, userId, productId }: { shopId: string; userId: string; productId?: string }) {
  const router = useRouter();
  const [categories, setCategories] = useState<Pick<Tables<"categories">, "id" | "name">[]>();
  const [product, setProduct] = useState<Loaded | null>(productId ? null : ({} as Loaded));
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const savingNow = useRef(false); // set synchronously so a double tap can't add the product twice
  // Once the product row exists (even if a later step failed), saving again updates it instead of adding another
  const savedId = useRef(productId);

  const show = useCallback(({ data, error }: Awaited<ReturnType<typeof loadProduct>>) => {
    if (["PGRST116", "22P02"].includes(error?.code ?? "")) return setError("Product not found");
    if (error) return setError(error.message);
    setProduct(data);
    setVariants(data.product_variants.map((v) => ({ key: v.id, id: v.id, name: v.name, price: v.price?.toString() ?? "", stock: String(v.stock) })));
    setPhotos([...data.product_images].sort((a, b) => a.position - b.position).map((p) => ({ key: p.id, id: p.id, url: p.url })));
  }, []);
  const load = async (id: string) => show(await loadProduct(id));

  useEffect(() => {
    createClient()
      .from("categories")
      .select("id, name, slug")
      .order("name")
      .then(({ data, error }) => (error ? setError(error.message) : setCategories(data)));
    if (productId) loadProduct(productId).then(show);
  }, [productId, show]);

  function addPhotos(files: FileList | null) {
    const picked = [...(files ?? [])];
    const bad = picked.find((f) => !IMAGE_TYPES.includes(f.type) || f.size > MAX_BYTES);
    if (bad) return setError(`${bad.name}: photos must be JPG, PNG or WebP and at most 5 MB`);
    setError(undefined);
    setPhotos((p) => [...p, ...picked.map((file) => ({ key: crypto.randomUUID(), url: URL.createObjectURL(file), file }))]);
  }

  function movePhoto(i: number, by: number) {
    setPhotos((p) => {
      const next = [...p];
      [next[i], next[i + by]] = [next[i + by], next[i]];
      return next;
    });
  }

  async function save(form: FormData) {
    if (savingNow.current) return;
    savingNow.current = true;
    setSaving(true);
    setError(undefined);
    const failed = await saveAll(form);
    if (!failed) return router.push("/seller/products");
    setError(failed);
    // Show what really got saved so a retry starts from the database's state
    if (savedId.current) await load(savedId.current);
    savingNow.current = false;
    setSaving(false);
  }

  // Returns an error message, or undefined when everything saved
  async function saveAll(form: FormData): Promise<string | undefined> {
    const supabase = createClient();
    const text = (k: string) => String(form.get(k) ?? "").trim();
    const fields = {
      name: text("name"),
      description: text("description") || null,
      category_id: Number(text("category_id")),
      price: Number(text("price")),
      stock: Number(text("stock")),
    };

    // "Add product" / "Edit product" calls from docs/api-contract.md
    if (savedId.current) {
      const { error } = await supabase.from("products").update(fields).eq("id", savedId.current);
      if (error) return error.message;
    } else {
      const { data, error } = await supabase.from("products").insert({ shop_id: shopId, ...fields }).select().single();
      if (error) return error.message;
      savedId.current = data.id;
    }
    const id = savedId.current;

    // Variants: delete removed ones, update kept ones, insert new ones
    const keptIds = variants.flatMap((v) => (v.id ? [v.id] : []));
    const removed = (product?.product_variants ?? []).filter((v) => !keptIds.includes(v.id)).map((v) => v.id);
    if (removed.length) {
      const { error } = await supabase.from("product_variants").delete().in("id", removed);
      if (error) return error.message;
    }
    const row = (v: VariantRow) => ({ name: v.name.trim(), price: v.price.trim() === "" ? null : Number(v.price), stock: Number(v.stock) });
    for (const v of variants.filter((v) => v.id)) {
      const { error } = await supabase.from("product_variants").update(row(v)).eq("id", v.id!);
      if (error) return error.message;
    }
    const added = variants.filter((v) => !v.id).map((v) => ({ product_id: id, ...row(v) }));
    if (added.length) {
      const { error } = await supabase.from("product_variants").insert(added);
      if (error) return error.message;
    }

    // Photos: remove deleted ones (row + file), then upload new ones and save every photo's position
    const removedPhotos = (product?.product_images ?? []).filter((img) => !photos.some((p) => p.id === img.id));
    if (removedPhotos.length) {
      const { error } = await supabase.from("product_images").delete().in("id", removedPhotos.map((p) => p.id));
      if (error) return error.message;
      const paths = removedPhotos.flatMap((p) => p.url.split(`/${BUCKET}/`)[1] ?? []).map(decodeURIComponent);
      await supabase.storage.from(BUCKET).remove(paths); // a leftover file is harmless, so its error is ignored
    }
    for (const [position, photo] of photos.entries()) {
      if (photo.id) {
        const { error } = await supabase.from("product_images").update({ position }).eq("id", photo.id);
        if (error) return error.message;
        continue;
      }
      // Contract path is `${user.id}/${productId}/${file.name}`; the time prefix stops iPhone photos (all "image.jpg")
      // clashing, and only safe characters are kept because storage rejects some names (e.g. Burmese).
      const safeName = photo.file!.name.replace(/[^\w.-]+/g, "-");
      const path = `${userId}/${id}/${Date.now()}-${safeName}`;
      const upload = await supabase.storage.from(BUCKET).upload(path, photo.file!, { contentType: photo.file!.type });
      if (upload.error) return `${photo.file!.name}: ${upload.error.message}`;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error } = await supabase.from("product_images").insert({ product_id: id, url: data.publicUrl, position });
      if (error) return error.message;
    }
  }

  if (!product || !categories) return error ? <p className="text-destructive">{error}</p> : <p className="text-muted-foreground">Loading…</p>;

  return (
    <form
      // re-mount the inputs with fresh defaults after a reload from the database
      key={product.id ?? "new"}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault(); // not action={…}: React 19 clears the form after an action, losing input on errors
        save(new FormData(e.currentTarget));
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Name
        <Input name="name" defaultValue={product.name} required maxLength={200} className="h-10" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Description
        <textarea name="description" defaultValue={product.description ?? ""} maxLength={5000} rows={4} className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Category
        <select name="category_id" defaultValue={product.category_id ?? ""} required className={`h-10 bg-background ${fieldClass}`}>
          <option value="" disabled>
            Choose a category
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Price (Ks)
          <Input name="price" type="number" inputMode="numeric" min={0} step={1} defaultValue={product.price} required className="h-10" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Stock
          <Input name="stock" type="number" inputMode="numeric" min={0} step={1} defaultValue={product.stock ?? 0} required className="h-10" />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Variants (optional, e.g. sizes)</legend>
        {variants.length > 0 && (
          <p className="text-xs text-muted-foreground">Buyers must pick one. Leave a price blank to use the product price.</p>
        )}
        {variants.map((v, i) => {
          const set = (patch: Partial<VariantRow>) => setVariants((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <div key={v.key} className="grid grid-cols-[1fr_1fr_4.5rem_auto] items-center gap-2">
              <Input aria-label={`Variant ${i + 1} name`} placeholder="Name, e.g. M" value={v.name} required maxLength={100} onChange={(e) => set({ name: e.target.value })} className="h-10" />
              <Input aria-label={`Variant ${i + 1} price`} placeholder="Price" type="number" inputMode="numeric" min={0} step={1} value={v.price} onChange={(e) => set({ price: e.target.value })} className="h-10" />
              <Input aria-label={`Variant ${i + 1} stock`} placeholder="Stock" type="number" inputMode="numeric" min={0} step={1} value={v.stock} required onChange={(e) => set({ stock: e.target.value })} className="h-10" />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove variant ${i + 1}`} onClick={() => setVariants((all) => all.filter((_, j) => j !== i))}>
                <X />
              </Button>
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => setVariants((all) => [...all, { key: crypto.randomUUID(), name: "", price: "", stock: "0" }])}
        >
          Add variant
        </Button>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Photos (JPG, PNG or WebP, up to 5 MB each; the first is the cover)</legend>
        {photos.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <li key={p.key} className="flex flex-col gap-1">
                <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                  <Image src={p.url} alt={`Photo ${i + 1}`} fill sizes="33vw" unoptimized className="object-cover" />
                  {i === 0 && <span className="absolute left-1 top-1 rounded bg-primary px-1.5 text-[10px] text-primary-foreground">Cover</span>}
                </div>
                <div className="flex justify-between">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move photo ${i + 1} earlier`} disabled={i === 0} onClick={() => movePhoto(i, -1)}>
                    <ArrowLeft />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos((all) => all.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move photo ${i + 1} later`} disabled={i === photos.length - 1} onClick={() => movePhoto(i, 1)}>
                    <ArrowRight />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <input
          type="file"
          accept={IMAGE_TYPES.join(",")}
          multiple
          aria-label="Add photos"
          onChange={(e) => {
            addPhotos(e.target.files);
            e.target.value = ""; // allow picking the same file again
          }}
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-secondary-foreground"
        />
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-11 text-base" disabled={saving}>
        {saving ? "Saving…" : "Save product"}
      </Button>
    </form>
  );
}

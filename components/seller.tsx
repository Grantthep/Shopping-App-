"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/db/database.types";

type Seller =
  | { state: "loading" | "not-seller"; error?: string }
  | { state: "ready"; user: User; shop: Tables<"shops"> | null; reload: () => void };

// Logged-out users go to /login; buyers get state "not-seller"; sellers get their shop (null until opened).
// The database's security rules are the real guard; this only decides what to show.
export function useSeller(): Seller {
  const router = useRouter();
  const [seller, setSeller] = useState<Seller>({ state: "loading" });

  const load = useCallback(async () => {
    const supabase = createClient();
    const { session } = (await supabase.auth.getSession()).data;
    if (!session) return router.replace("/login");
    const { data: profile, error } = await supabase.from("profiles").select("*").single();
    if (error) return setSeller({ state: "loading", error: error.message });
    if (profile.role !== "seller") return setSeller({ state: "not-seller" });
    // "My shop" call from docs/api-contract.md (maybeSingle: no shop yet is not an error)
    const shop = await supabase.from("shops").select("*").eq("owner_id", session.user.id).maybeSingle();
    if (shop.error) return setSeller({ state: "loading", error: shop.error.message });
    setSeller({ state: "ready", user: session.user, shop: shop.data, reload: load });
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);
  return seller;
}

// What to show instead of a seller page while loading, on error, or for buyers
export function SellerGate({ seller }: { seller: Seller }) {
  if (seller.state === "not-seller")
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-lg font-semibold">This page is for sellers</p>
        <p className="text-sm text-muted-foreground">Seller accounts are chosen at sign-up.</p>
        <Link href="/signup" className="font-medium text-primary underline">
          Sign up as a seller
        </Link>
      </div>
    );
  if (seller.state === "loading" && seller.error) return <p className="text-destructive">{seller.error}</p>;
  return <p className="text-muted-foreground">Loading…</p>;
}

// Shown on seller pages that need a shop before it's opened
export function NoShopYet() {
  return (
    <p>
      Open your shop first on the{" "}
      <Link href="/seller" className="font-medium text-primary underline">
        seller dashboard
      </Link>
      .
    </p>
  );
}

export function SellerNav() {
  return (
    <nav className="flex gap-4 text-sm font-medium">
      <Link href="/seller" className="text-primary underline-offset-4 hover:underline">
        Dashboard
      </Link>
      <Link href="/seller/products" className="text-primary underline-offset-4 hover:underline">
        Products
      </Link>
      <Link href="/seller/orders" className="text-primary underline-offset-4 hover:underline">
        Orders
      </Link>
    </nav>
  );
}

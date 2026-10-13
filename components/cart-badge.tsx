"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAccount } from "@/components/account";

// Fired after any cart change so every badge recounts
export const CART_UPDATED = "cart-updated";

// Number of cart lines (not units), like Shopee. Hidden when logged out or empty.
export function CartBadge({ className = "" }: { className?: string }) {
  const { user } = useAccount();
  const [count, setCount] = useState(0);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const load = () =>
      createClient()
        .from("cart_items")
        .select("id", { count: "exact", head: true })
        .then(({ count }) => setCount(count ?? 0));
    load();
    window.addEventListener(CART_UPDATED, load);
    return () => window.removeEventListener(CART_UPDATED, load);
  }, [userId]);

  if (!user || !count) return null;
  return (
    <span
      aria-label={`${count} in cart`}
      className={`min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-bold text-accent-foreground ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

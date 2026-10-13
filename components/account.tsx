"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// /account fires this after saving, so names shown elsewhere refresh without a reload
export const PROFILE_UPDATED = "profile-updated";

// user: undefined while loading, null when logged out
export function useAccount() {
  const [user, setUser] = useState<User | null>();
  const [name, setName] = useState<string | null>();

  useEffect(() => {
    const { data } = createClient().auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    // Separate effect: Supabase calls inside onAuthStateChange can deadlock
    const load = () =>
      createClient()
        .from("profiles")
        .select("full_name")
        .single()
        .then(({ data }) => setName(data?.full_name));
    load();
    window.addEventListener(PROFILE_UPDATED, load);
    return () => window.removeEventListener(PROFILE_UPDATED, load);
  }, [userId]);

  return { user, name: user ? name : undefined };
}

// First word of the profile name when logged in, otherwise "Account"
export function AccountName() {
  const { name } = useAccount();
  return <>{name?.trim().split(/\s+/)[0] || "Account"}</>;
}

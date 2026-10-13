"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { PROFILE_UPDATED } from "@/components/account";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Tables } from "@/lib/db/database.types";

export default function AccountPage() {
  const router = useRouter();
  const [account, setAccount] = useState<{ user: User; profile: Tables<"profiles"> }>();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return router.replace("/login");
      const { data: profile, error } = await supabase.from("profiles").select("*").single();
      if (error) setError(error.message);
      else setAccount({ user, profile });
    });
  }, [router]);

  async function save(form: FormData) {
    if (!account) return;
    setMessage(undefined);
    const full_name = String(form.get("full_name")).trim();
    const phone = String(form.get("phone")).trim() || null;
    const { error } = await createClient()
      .from("profiles")
      .update({ full_name, phone })
      .eq("id", account.user.id);
    setError(error?.message);
    if (error) return;
    setAccount({ ...account, profile: { ...account.profile, full_name, phone } });
    setMessage("Saved");
    window.dispatchEvent(new Event(PROFILE_UPDATED));
  }

  async function logOut() {
    const { error } = await createClient().auth.signOut();
    if (error) setError(error.message);
    else router.push("/");
  }

  if (!account) return error ? <p className="text-destructive">{error}</p> : <p className="text-muted-foreground">Loading…</p>;
  const { user, profile } = account;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{profile.full_name || "My account"}</h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
        <p className="mt-2 inline-block rounded-md bg-secondary px-2 py-0.5 text-sm capitalize text-secondary-foreground">
          {profile.role}
        </p>
      </div>

      <Link href="/orders" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 justify-between text-base")}>
        My orders <ChevronRight />
      </Link>
      {profile.role === "seller" && (
        <Link href="/seller" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "-mt-4 h-11 justify-between text-base")}>
          Seller dashboard <ChevronRight />
        </Link>
      )}

      {/* key: re-mount with fresh defaults after saving */}
      <form
        key={`${profile.full_name}|${profile.phone}`}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault(); // not action={…}: React 19 clears the form after an action, losing input on errors
          save(new FormData(e.currentTarget));
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Full name
          <Input name="full_name" defaultValue={profile.full_name ?? ""} autoComplete="name" required className="h-10" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Phone
          <Input name="phone" type="tel" defaultValue={profile.phone ?? ""} autoComplete="tel" className="h-10" />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm font-medium text-primary">
            {message}
          </p>
        )}
        <Button type="submit" size="lg" className="h-11 text-base">
          Save
        </Button>
      </form>

      <Button variant="outline" size="lg" className="h-11 text-base" onClick={logOut}>
        Log out
      </Button>
    </div>
  );
}

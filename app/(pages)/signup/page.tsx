"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignupPage() {
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signUp(form: FormData) {
    setBusy(true);
    const full_name = String(form.get("full_name")).trim();
    const { error } = await createClient().auth.signUp({
      email: String(form.get("email")),
      password: String(form.get("password")),
      options: { data: form.get("seller") ? { full_name, role: "seller" } : { full_name } },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setDone(true);
  }

  if (done)
    return (
      <p role="status" className="mx-auto max-w-sm rounded-lg bg-secondary p-4 text-secondary-foreground">
        Check your email to confirm your account
      </p>
    );

  return (
    <form
      className="mx-auto flex max-w-sm flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault(); // not action={…}: React 19 clears the form after an action, losing input on errors
        signUp(new FormData(e.currentTarget));
      }}
    >
      <h1 className="text-xl font-semibold">Sign up</h1>
      <label className="flex flex-col gap-1 text-sm">
        Full name
        <Input name="full_name" autoComplete="name" required className="h-10" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <Input name="email" type="email" autoComplete="email" required className="h-10" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password (at least 8 characters)
        <Input name="password" type="password" autoComplete="new-password" minLength={8} required className="h-10" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input name="seller" type="checkbox" className="size-4 accent-primary" />I want to sell
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-11 text-base" disabled={busy}>
        Sign up
      </Button>
      <p className="text-sm">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary underline">
          Log in
        </Link>
      </p>
    </form>
  );
}

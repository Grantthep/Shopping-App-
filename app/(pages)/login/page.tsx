"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function logIn(form: FormData) {
    setBusy(true);
    const { error } = await createClient().auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setBusy(false);
    if (error) setError(error.message);
    else router.push("/account");
  }

  return (
    <form
      className="mx-auto flex max-w-sm flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault(); // not action={…}: React 19 clears the form after an action, losing input on errors
        logIn(new FormData(e.currentTarget));
      }}
    >
      <h1 className="text-xl font-semibold">Log in</h1>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <Input name="email" type="email" autoComplete="email" required className="h-10" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <Input name="password" type="password" autoComplete="current-password" required className="h-10" />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-11 text-base" disabled={busy}>
        Log in
      </Button>
      <p className="text-sm">
        New to Shwe?{" "}
        <Link href="/signup" className="font-medium text-primary underline">
          Sign up
        </Link>
      </p>
    </form>
  );
}

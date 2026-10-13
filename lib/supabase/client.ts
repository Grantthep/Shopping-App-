import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/database.types";

// Browser Supabase client (publishable key). Calls are listed in docs/api-contract.md.
export const createClient = () =>
  createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );

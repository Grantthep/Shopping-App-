# Shopping App - Myanmar marketplace (like Lazada / Shopee)
Stack: Next.js App Router + TypeScript + Tailwind + shadcn/ui. Backend: Supabase (already live).

## Team
- Person A (frontend): app/(pages), components/, styles/, lib/supabase/client.ts
- Person B (backend): app/api/, lib/db/, supabase/

## Rules
- Person A never edits app/api/, lib/db/ or supabase/. Ask B instead.
- All data calls follow docs/api-contract.md. Use createClient() from lib/supabase/client.ts.
- Prices are whole kyat (int): show as price.toLocaleString() + ' Ks'.
- Show error.message from Supabase to the user.
- Never commit .env files or secret keys. The frontend only uses the publishable key.
- One branch per task (a/product-page), then a pull request for B to review.

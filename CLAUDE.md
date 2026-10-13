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

## Brand
App name: **Shwe** (Burmese for gold). Colours are shadcn theme variables in app/globals.css; use the
Tailwind classes (bg-primary, text-accent…), never raw hex in components.
- Maroon #7A1F2B = primary, white text on it (bg-primary text-primary-foreground)
- Gold #F2C14E = accent, dark maroon #4A1219 text on it (bg-accent text-accent-foreground)
- Cream #FBF1D9 = muted / secondary, for background highlights
- Never gold text on white (too faint): use maroon (text-primary). Gold text only on maroon.
- Prices: bold maroon (font-bold text-primary). Active nav item: maroon.
- Light mode only for now.

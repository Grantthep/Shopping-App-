# Shopping App

A small marketplace for Myanmar (prices in kyat): sellers list products, buyers browse, add to cart,
check out (cash on delivery for now) and track orders.

## What's here

| Folder | What | Owner |
|---|---|---|
| `supabase/` | Database tables, security rules, search, checkout, orders, emails, test data. **Already live** in Supabase. | Person B (backend) |
| `docs/api-contract.md` | **Start here (frontend):** how every page gets and changes data | shared |
| `docs/manual-steps.md` | Setup steps only a person can do (accounts, keys, Vercel) | shared |
| `lib/db/database.types.ts` | TypeScript types for the database, generated from Supabase | Person B |

The Next.js app (pages, components) doesn't exist yet. That's Person A's first task.

## Person A: getting started

1. Clone this repo (VS Code: Ctrl+Shift+P, then **Git: Clone**).
2. Create `.env.local` in the project folder with the keys your partner sends you privately. It's
   git-ignored; never commit it.
3. Create the Next.js project (TypeScript, Tailwind, App Router) **inside this folder**, keeping
   `supabase/`, `docs/`, `lib/`, `.gitignore` and this README. `create-next-app` refuses a non-empty
   folder, so create it in a temporary subfolder and move its files up. Merge its `.gitignore`
   into ours rather than replacing it.
4. Install the Supabase client: `npm install @supabase/supabase-js @supabase/ssr`.
5. Add `picsum.photos` to `images.remotePatterns` in `next.config.ts` (test product photos).
6. Read `docs/api-contract.md`, then build pages against the live test data (50 products).
7. Push to `main` and tell your partner, who adds the server-side Supabase helpers.

## Working together

- Pull before you start: `git pull`.
- One branch per task: `a/product-page`, `b/cart-api`. Open a pull request; the other person merges.
- Don't edit the other person's folders without telling them.
- Never paste secret keys into GitHub or chats.
- After any change in `supabase/`, run `npm run test:db` (database and security tests, no internet needed).

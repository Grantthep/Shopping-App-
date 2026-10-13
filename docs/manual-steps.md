# Manual steps (things only a person can do)

Everything else in the backend is code in `supabase/`. Tick these off as you go.

## Now

- [ ] **Invite your partner to GitHub:** github.com/Grantthep/Shopping-App- → **Settings** → **Collaborators** → **Add people**.
- [ ] **Invite your partner to Supabase:** supabase.com/dashboard → your org → **Team** → **Invite members** → their email, role **Developer**.
- [ ] **Send your partner the keys:** copy all of `.env.local` and send it in a *private* chat (Telegram/Viber/Signal). Never through GitHub or Claude.
- [ ] **Sign-up settings:** Supabase → **Authentication** → **Sign In / Providers** → **Email**:
  - **Confirm email**: on
  - **Minimum password length**: 8
  - Click **Save**.

## Emails (order emails + sign-up confirmation emails)

Supabase's built-in email only sends a few emails per hour, and only to your own team's addresses,
so testers can't sign up until you set this up.

1. [ ] Go to **resend.com** → **Sign up** (free: 3,000 emails/month).
2. [ ] Left menu **API Keys** → **Create API Key** → name `shopping-app`, permission **Sending access** → **Add**. Copy the key (starts with `re_`). Don't paste it into a chat.
3. [ ] **Turn on order emails.** Supabase → **SQL Editor** → **New query**, paste this with your key in place of `re_xxx`, then **Run**:
   ```sql
   select vault.create_secret('re_xxx', 'resend_api_key');
   ```
4. [ ] **Use Resend for sign-up emails.** Supabase → **Authentication** → **Emails** → **SMTP Settings** → turn on **Enable custom SMTP**:
   - Host `smtp.resend.com`, Port `465`, Username `resend`, Password: your `re_` key
   - Sender email: `onboarding@resend.dev` (for now), Sender name: your app name
   - **Save**.
5. [ ] **Later, when you buy a domain:** Resend → **Domains** → **Add domain** → add the DNS records it shows at your domain seller → wait for **Verified**. Then:
   - Change the SMTP sender email to e.g. `no-reply@yourdomain.com`.
   - In SQL Editor run: `select vault.create_secret('Your Shop <orders@yourdomain.com>', 'email_from');`

   Until then Resend only delivers to **your own** Resend login email, which is enough for testing.

## After your partner pushes the Next.js project

- [ ] **Vercel:** vercel.com → **Continue with GitHub** → **Add New… → Project** → import `Shopping-App-` → **Environment Variables**: add the three values from `.env.local` → **Deploy**.
- [ ] **Supabase URLs:** **Authentication** → **URL Configuration**:
  - **Site URL**: your Vercel link
  - **Redirect URLs**: add `http://localhost:3000/**` and `https://<your-vercel-link>/**`

## Before launch

- [ ] Delete the two fake seller accounts (or keep them as demo shops): Supabase → **Authentication** → **Users** → `seller1@example.com`, `seller2@example.com` → **Delete user**. Their shops and products go with them.
- [ ] Delete the demo buyer `demo.buyer@example.com` (made for testing; password shared privately, never in this repo).
- [ ] **Payments (later):** apply for a KBZPay/WavePay merchant account through a gateway (e.g. Dinger or 2C2P) and ask for sandbox access. Checkout works with cash on delivery until then.

## Changing the database

Don't edit the database by hand in the dashboard. Ask Claude to write a new file in
`supabase/migrations/`; it previews the change and applies it with `npx supabase db push` after you say OK.

# ObserveCo Licensing API

Standalone serverless licensing API for ObserveCo Pro tier.

**Stack:** Vercel (Node.js Serverless Functions) + Supabase (PostgreSQL) + Stripe

## Deploy

```bash
# 1. Create repo and push
gh repo create observeco-licensing --public
git init && git add . && git commit -m "init"
git push origin main

# 2. Deploy on Vercel (import from GitHub)
# Select repo: observeco-licensing

# 3. Set env vars in Vercel dashboard:
#    SUPABASE_URL, SUPABASE_SERVICE_KEY, STRIPE_SECRET_KEY,
#    STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET, ADMIN_API_KEY

# 4. Run SQL schema in Supabase SQL Editor (see schema.sql)
```

## API Routes

*(deployed 2026-05-31 v2)*

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/licenses/validate` | None | Validate a license key |
| POST | `/api/trials/start` | None | Start 30-day trial |
| POST | `/api/stripe/webhook` | Stripe sig | Stripe event handler |
| GET | `/api/admin/licenses` | Bearer token | List licenses |
| POST | `/api/admin/licenses` | Bearer token | Issue free license |
| GET | `/api/admin/stats` | Bearer token | License counts |

## Environment Variables

| Variable | Source |
|----------|--------|
| `SUPABASE_URL` | Supabase dashboard → Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase dashboard → Settings → API (service_role, not anon) |
| `STRIPE_SECRET_KEY` | Stripe dashboard → Developers → API keys |
| `STRIPE_PUBLISHABLE_KEY` | Stripe dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Developers → Webhooks |
| `ADMIN_API_KEY` | Generate: `openssl rand -hex 16` |

## Admin Dashboard

Open `https://<your-vercel-url>/admin`, enter your `ADMIN_API_KEY`.

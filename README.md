# 🚐 VanSafe

Safer school-van rides for parents — built for the Civic Innovation Hackathon.

VanSafe connects **parents** with trusted school-van **drivers**, tracks rides live,
and sends proactive safety alerts over WhatsApp — with AI-powered van matching,
review summaries, and anomaly detection.

## Stack

- **Next.js 14** (App Router) + React + TypeScript + Tailwind CSS
- **Supabase** — Postgres, Auth, Storage (documents), Realtime
- **Google Gemini** (`gemini-2.0-flash`) — matching, review summaries, anomaly
  explanations, WhatsApp NL replies (rule-based fallback when no key)
- **Meta WhatsApp Cloud API** — real inbound/outbound bot, with an in-app simulator fallback

## Features (mapped to user stories)

- Role-based auth (Parent / Driver) with role-specific dashboards
- Driver profile + vehicle details + CNIC/vehicle document uploads + trust badges
- One-tap live GPS tracking (pings every 30 s) with ping counter
- Parent live view: Moving / Stopped / No Signal, minutes-since-ping, Google Maps,
  last-10 route history, WhatsApp emergency button
- Browse / search / **AI match** with score + one-sentence reasoning
- Reviews (linked parents only) + **AI review summary** + auto rating recompute
- WhatsApp bot (EN/Urdu) for "where is the van?", proactive departed/arrived alerts
- **AI anomaly detection**: 15-min stationary + route deviation → plain-language alerts

## Setup

### 1. Install

```bash
npm install
```

### 2. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql), then
   [`supabase/seed.sql`](supabase/seed.sql) (demo data + loginable accounts).
3. In **Authentication → Providers → Email**, turn **OFF** "Confirm email" so the
   demo can sign up and log in instantly.
4. Grab your keys from **Project Settings → API**.

### 3. Configure env

```bash
cp .env.local.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and
`SUPABASE_SECRET_KEY` (required). `GEMINI_API_KEY` and the `WHATSAPP_*` vars
are optional — without them the app uses rule-based AI and the in-app WhatsApp
simulator.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000.

## Demo accounts (password: `password123`)

| Role   | Email                       |
| ------ | --------------------------- |
| Parent | `sara.parent@vansafe.test`  |
| Driver | `imran.driver@vansafe.test` |

The parent is pre-linked to driver Imran, who has a seeded live route — open the
parent dashboard to see live tracking, the alerts feed, and the WhatsApp bot.

## Optional: real WhatsApp (Meta Cloud API)

1. In the [Meta App Dashboard](https://developers.facebook.com/apps), add the
   **WhatsApp** product. From **API Setup**, copy the **Phone number ID** and a
   **temporary access token** (or create a permanent System User token).
2. Set `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, and choose any
   `WHATSAPP_VERIFY_TOKEN` string in `.env.local`.
3. Expose your dev server (e.g. `ngrok http 3000`). In **WhatsApp →
   Configuration → Webhook**, set the Callback URL to
   `https://<your-tunnel>/api/whatsapp/webhook`, enter the same Verify Token,
   and subscribe to the **messages** field.
4. Add tester numbers under API Setup, then text your number from a registered
   parent's WhatsApp. The bot replies via the Cloud API.

## Key paths

- `lib/` — Supabase clients, `gemini.ts`, `whatsapp.ts`, `anomaly.ts`, `auth.ts`
- `app/api/` — locations, tracking, match, reviews, drivers, whatsapp
- `app/driver/`, `app/parent/` — role areas; `app/driver/[id]` is the public profile
- `supabase/schema.sql`, `supabase/seed.sql` — database

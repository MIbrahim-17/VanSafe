# 🚐 VanSafe

Safer school-van rides for parents — built for the Civic Innovation Hackathon.

VanSafe connects **parents** with trusted school-van **drivers**, tracks rides live,
and sends proactive safety alerts over WhatsApp — with AI-powered van matching,
review summaries, and anomaly detection.

## Stack

- **Next.js 14** (App Router) + React + TypeScript + Tailwind CSS
- **Supabase** — Postgres, Auth, Storage (documents), Realtime
- **Gemini 2.0 Flash via OpenRouter** — matching, review summaries, anomaly
  explanations, WhatsApp NL replies (rule-based fallback when no key)
- **Twilio WhatsApp** — real inbound/outbound bot, with an in-app simulator fallback

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
`SUPABASE_SECRET_KEY` (required). `OPENROUTER_API_KEY` and the `TWILIO_*` vars
are optional — without them the app uses rule-based AI and the in-app WhatsApp
simulator.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000.

## Scraping real schools (Lahore & Karachi)

VanSafe ships with a built-in school catalog, but you can replace/augment it with
real schools (accurate names + exact coordinates) scraped from OpenStreetMap:

1. Run [`supabase/migration-schools-table.sql`](supabase/migration-schools-table.sql)
   in the SQL editor to create the `schools` table.
2. Ensure `.env.local` has `SUPABASE_SECRET_KEY` set.
3. Preview without writing: `npm run scrape:schools:dry`
4. Scrape + populate the DB: `npm run scrape:schools`

The scraper ([`scripts/scrape-schools.mjs`](scripts/scrape-schools.mjs)) queries the
Overpass API for `amenity=school` across each city, classifies every school into a
known area by nearest neighbourhood, and upserts ~1,300 schools. The city → area →
school pickers then read from the DB (via `/api/schools`), falling back to the static
catalog when the table is empty.

## Demo accounts (password: `password123`)

| Role   | Email                       |
| ------ | --------------------------- |
| Parent | `sara.parent@vansafe.test`  |
| Driver | `imran.driver@vansafe.test` |

The parent is pre-linked to driver Imran, who has a seeded live route — open the
parent dashboard to see live tracking, the alerts feed, and the WhatsApp bot.

## Optional: real WhatsApp (Twilio)

1. In the [Twilio Console](https://console.twilio.com), enable the
   **WhatsApp Sandbox** (Messaging → Try it out → Send a WhatsApp message) and
   join it from your phone by sending the given `join …` code.
2. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and
   `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` (the sandbox number) in `.env.local`.
3. Expose your dev server (e.g. `ngrok http 3000`). In the sandbox's
   **Sandbox settings**, set **"When a message comes in"** to
   `https://<your-tunnel>/api/whatsapp/webhook` (HTTP POST).
4. Text the sandbox number from a registered parent's WhatsApp (e.g.
   "where is the van?"). The bot replies via TwiML, and proactive
   departed/arrived/anomaly alerts are sent via the Twilio API.

### Proactive alerts via an approved template (TWILIO_CONTENT_SID)

Bot *replies* are session messages, but *proactive* alerts (departed/arrived/
anomaly) are business-initiated and need an approved WhatsApp **template** to be
delivered outside the 24-hour window. Set `TWILIO_CONTENT_SID` and our code sends
alerts via the template, passing the alert text as variable `{{1}}`.

1. Twilio Console → **Messaging → Content Template Builder → Create new**.
2. Name it (e.g. `vansafe_alert`), language **English**, type **Text**.
3. Body: `{{1}}` (add a sample like "Your child's van has departed.").
   If a body of only `{{1}}` is rejected, use `VanSafe 🚐 {{1}}`.
4. **Submit for WhatsApp approval**, category **Utility**. Approval is usually
   minutes to a few hours.
5. Once **Approved**, copy the template's **Content SID** (`HX…`) and set
   `TWILIO_CONTENT_SID=HX…` in `.env.local`, then restart.

Without `TWILIO_CONTENT_SID`, alerts fall back to free-form `Body` (fine for the
sandbox within the 24h window).

## Key paths

- `lib/` — Supabase clients, `gemini.ts`, `whatsapp.ts`, `anomaly.ts`, `auth.ts`
- `app/api/` — locations, tracking, match, reviews, drivers, whatsapp
- `app/driver/`, `app/parent/` — role areas; `app/driver/[id]` is the public profile
- `supabase/schema.sql`, `supabase/seed.sql` — database

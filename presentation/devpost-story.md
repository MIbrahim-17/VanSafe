## Inspiration

Growing up, my family had the same morning routine as millions of others across Pakistan: wait by the gate, hope the van shows up on time, and have no idea where it actually was if it didn't. The driver wasn't reachable, there was no way to check if he'd left yet, and on bad days (extreme heat, flooded streets, traffic jams) that uncertainty turned into real worry.

School vans are the backbone of daily transport for children across Lahore and Karachi, yet the system runs almost entirely on trust and word-of-mouth. Drivers aren't verified, vehicles are routinely over capacity, and parents have zero visibility once their child gets in the van. We wanted to fix that, not by replacing the system, but by making the *existing* one transparent, accountable, and a little safer for everyone.

## What it does

**VanSafe** is a two-sided platform connecting parents and school van drivers in Pakistani cities.

**For parents:**
- Browse and search verified van drivers by area and school, with ratings and reviews
- AI-assisted matching (Gemini) suggests the best-fit drivers based on school, area, and seat availability
- **Live tracking** of the van on a map, with departure/arrival alerts sent straight to WhatsApp
- Mark a child present/absent for the day, with the driver notified automatically
- Drop a pin on a map (food-delivery-app style) for the exact pickup location, alongside a typed address

**For drivers:**
- Build a public profile with real vehicle data, including Suzuki Bolan, Hiace, Hi-Roof, and other common Pakistani van models, each with an official safety capacity
- Occupancy is color-coded against that official capacity, with clear over-capacity warnings, turning a soft "how many seats" number into a hard safety benchmark
- **Route optimization**: set a home base and a list of pickups, and VanSafe computes the most efficient morning/afternoon route using live traffic data, with a one-tap "Start Route" that begins GPS sharing and sends departure alerts to parents
- A **fuel savings dashboard** shows real PKR saved per day/week/month from optimized routing vs. a naive route
- A WhatsApp bot (with an in-app simulator for demos) lets parents ask "where is the van?" in English or Urdu and get an instant location and Google Maps link

**For cities:**
Every ride generates anonymized data on the most-traveled school routes, which vehicles are unverified or running over capacity, and citywide fuel consumption patterns. This is the layer we're most excited about: it's a dataset that traffic authorities and emergency response planners could use to identify high-traffic school corridors, target safety enforcement, and plan infrastructure around how children actually move through the city every day.

## How we built it

- **Frontend:** Next.js 14 (App Router), React, TypeScript, Tailwind CSS, designed following Apple's Human Interface Guidelines (proper type scale, frosted "material" navigation bar, segmented controls, spring-based motion) to feel like a real consumer product rather than a hackathon prototype
- **Backend:** Supabase (Postgres + Auth + Storage + Row-Level Security) for all data, authentication, and document uploads
- **Maps & routing:** Leaflet + OpenStreetMap for map rendering, with a routing fallback chain (Google Directions API for live traffic, then OSRM, then haversine distance), so route optimization keeps working even without API keys configured
- **AI:** Google Gemini powers parent-driver matching, review summaries, and natural-language WhatsApp replies in English/Urdu, with deterministic rule-based fallbacks if no API key is present
- **Messaging:** Twilio WhatsApp integration for real-world alerts, plus an in-app chat simulator so the whole flow can be demoed without any external accounts
- **Vehicle safety data:** a hand-built catalog of real Pakistani van models (Suzuki Bolan, Every, APV; Toyota Hiace variants; Changan Karvaan; Daihatsu Hijet, etc.) with their official passenger capacities, used as the basis for the occupancy/safety system

## Challenges we ran into

- **Designing for trust on a tight visual budget.** Early iterations didn't look professional enough for a platform that needs to earn parents' trust with their children's safety. We rebuilt the entire design system (color, type scale, spacing, motion) around Apple's HIG to give the product the polish and credibility that kind of trust requires.
- **Route optimization with no guaranteed connectivity.** Not every demo environment has Google Maps billing enabled, so we built a three-tier fallback (Google Directions, then OSRM, then haversine) that degrades gracefully without breaking the feature.
- **Idempotent demo data.** Seeding realistic driver/parent/review data repeatedly (for testing and demos) kept hitting unique-constraint and foreign-key errors in Postgres. We rewrote the seed script to be fully self-healing, so it can be re-run any number of times against a live Supabase project.
- **Real-time WhatsApp integration.** Getting Twilio webhooks working through a local tunnel during development required diagnosing signature validation, tunnel reliability, and auth token rotation issues end to end.

## Accomplishments that we're proud of

- A complete, working vertical slice (registration, profiles, live tracking, route optimization, fuel savings, reviews, AI matching, and a WhatsApp bot) all functioning end-to-end, not just mocked screens
- A safety system grounded in real Pakistani vehicle data rather than generic placeholders
- A civic data layer that reframes a personal safety tool as city-scale infrastructure for traffic and emergency planning

## What we learned

Building for an informal, trust-based system taught us that the highest-leverage features aren't always the flashiest: a clear capacity warning or a "the van just left" WhatsApp message can matter more to a parent than a polished dashboard. We also learned a lot about making AI and third-party APIs *optional*: every Gemini, Twilio, and Google Maps integration has a fallback path, which made the whole app far more resilient and easier to demo.

## What's next

- Pilot with a small group of schools in Lahore and Karachi to validate the verification and review flows with real drivers and parents
- Build the civic dashboard for traffic authorities: aggregated, anonymized route density, vehicle compliance, and fuel-use data
- Add automated document verification (CNIC, vehicle registration) and a formal driver vetting workflow
- Make the platform WhatsApp ready as well, where whole interaction is based on WhatsApp only
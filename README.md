# reseller.

> your closet is full of money. we list it for you.

**reseller** turns one photo of a thing in your closet into a live Facebook Marketplace listing — and then handles the buyer messages for you. Four AI agents do the work. You just snap a photo.

---

## The flow

```
   📷            🔍              🎬             🤖             🤝
  snap        Researcher       Studio       Browserbase     Closer
             figures out      writes the     posts it on    handles
              the item         listing &      Facebook       your
             & prices it        a 15-s        Marketplace    DMs
                                 video
```

1. **Snap a photo** of anything you want to sell.
2. **Researcher** figures out what it is, scrapes live comps across six resale sites, and picks the right price.
3. **Studio** writes the title, description, tags, and an enhanced product shot — and **Pika** generates a 15-second product video.
4. **Browserbase** opens a real browser, navigates to Facebook Marketplace, uploads the photos, fills the form, and hits publish.
5. **Closer** lives in your Facebook inbox — replies to buyers, pushes back on lowballs (with an 80% negotiation floor), and books the meetup.

---

## ⭐ Browserbase — the agent that actually clicks publish

The hardest part of automating a marketplace listing isn't the AI. It's the browser. Facebook has no public listing API for individual sellers, so we don't fake it.

**Browserbase + Stagehand drive a real, cloud-hosted Chrome session that:**
- logs into Facebook with the seller's saved session
- navigates to the Marketplace listing flow
- uploads the photos one by one
- types the title, description, price, category, condition, location
- hits **Publish** and verifies the listing actually went live

Browserbase shows up in **three places** in the codebase:
- [`dashboard/server/research.ts`](./dashboard/server/research.ts) — scrapes live price comps across Mercari, OfferUp, Poshmark, Swappa, eBay, and Facebook (read-only, never used for listing)
- [`dashboard/server/facebook.ts`](./dashboard/server/facebook.ts) — the listing pipeline that takes a finished listing and actually publishes it on Marketplace
- [`dashboard/server/messenger.ts`](./dashboard/server/messenger.ts) — the Messenger session **Closer** uses to read and reply to buyer DMs in real time

Same Stagehand primitive, three jobs. One CLI command can take a draft from Supabase to a live, verifiable Marketplace URL.

---

## ⭐ Pika — the agent that makes a listing scroll-stoppable

A static photo is fine. A short product video is the difference between selling today and watching the listing sit for two weeks.

**Pika takes the seller's photo + Studio's listing copy and generates a vertical product showcase video:**
- clean white background, slow 360° rotation, magazine-quality product lighting
- camera moves naturally around the item
- no text, no overlays — drops cleanly into the Marketplace media carousel

Implemented in [`dashboard/server/video.ts`](./dashboard/server/video.ts) (real Pika REST API) and triggered automatically by the listing pipeline once Studio drafts the copy. Status is polled via `GET /api/video/status/:itemId` so the dashboard can show progress.

---

## ⭐ UI / UX — a landing that earns the upload

Reselling is annoying. Most reselling apps look it. We took the opposite swing.

**Landing page** ([`dashboard/src/pages/LandingPage.tsx`](./dashboard/src/pages/LandingPage.tsx)) — a single-scroll, wheel-hijacked story:
- full-bleed editorial hero ("your pile is money waiting 💸")
- five sticky slides, each agent gets its own colored panel (blue → pink → yellow → white)
- hand-drawn curly navigation arrows and animated agent status rows
- the final slide *is* the product — drop a photo and watch the agents work with a scanning animation in real time

**Dashboard** ([`dashboard/src/pages/DashboardPage.tsx`](./dashboard/src/pages/DashboardPage.tsx)) — six tabs, each its own colored accent, built so a non-technical reseller can move ten items in one sitting:

| Tab | What it does |
|---|---|
| 📊 **Overview** | Reselling at a glance — listed / sold / revenue / time-to-sale |
| 🔍 **Pricing** | Researcher's verdict per item with confidence and live comps |
| 🎬 **Listing** | Review and edit the generated copy before it goes live |
| 📦 **Active** | Every Facebook Marketplace listing in one place |
| 💬 **Messenger** | Closer's conversations, with human-takeover at any time |
| 📷 **Upload** | Add items and manage inventory |

Vite + React 19, Tailwind + custom CSS, no component library.

---

## Architecture

```
                ┌─────────────────────────────────────────┐
                │  Vite + React (dashboard/src/)         │
                │   LandingPage  /  DashboardPage  (6 tabs)│
                └────────────────────┬────────────────────┘
                                     │  HTTP
                                     ▼
                ┌─────────────────────────────────────────┐
                │  Express backend (dashboard/server/)    │
                │  index.ts  ·  ~20 REST endpoints        │
                └─┬───────────┬─────────────┬─────────────┘
                  ▼           ▼             ▼
              research.ts   video.ts    facebook.ts
              + media.ts                + messenger.ts
              ┌──────────┐  ┌──────┐    + buyer-agent.ts
              │OpenAI    │  │Pika  │    ┌───────────────┐
              │+ Stagehand│  │REST  │   │ Browserbase   │
              │+ Playwright│ │API   │   │ + Stagehand   │
              └──────────┘  └──────┘    │ + Playwright  │
                                        │   (CDP for    │
                                        │   Messenger)  │
                                        └───────────────┘
                                                │
                                                ▼
                                       Facebook Marketplace
                       ┌───────────────────────────────────┐
                       │  Supabase                          │
                       │  items · research_jobs · listings  │
                       │  Storage: photos · generated media │
                       └───────────────────────────────────┘
```

### Server endpoints (in `dashboard/server/index.ts`)

| Route | Purpose |
|---|---|
| `POST /api/research` · `GET /api/research/:jobId` · `GET /api/research/item/:itemId` | Kick off price research, poll status, fetch verdict |
| `POST /api/media/generate` · `GET /api/media/status/:itemId` | Generate enhanced product imagery |
| `POST /api/video/generate` · `GET /api/video/status/:itemId` | Generate Pika video |
| `POST /api/listing/build` · `GET /api/items/:itemId` | Compose the final listing |
| `POST /api/publish/facebook` · `GET /api/publish/facebook/:itemId` | Browserbase publishes to FB Marketplace, then polls verification |
| `POST /api/messenger/connect` · `GET /api/messenger/conversations` · `…/messages` · `…/send` · `POST /api/messenger/disconnect` | Closer's Messenger session |
| `POST /api/buyer-agent/start` · `…/stop` · `…/status` · `…/deals` · `…/deals/:id/finalize` | Auto-reply loop with negotiation floor |

---

## Tech

- **Vite + React 19** — UI ([`dashboard/`](./dashboard/))
- **Express 5** + **TypeScript** — backend orchestrator ([`dashboard/server/`](./dashboard/server/))
- **Supabase** — Postgres, Storage, pgvector for price-comp embeddings
- **OpenAI GPT-4o** — vision for product identification, listing copy, and Closer's replies
- **Browserbase** + **Stagehand** — real-browser automation: research scraping, FB Marketplace listing, Messenger session
- **Pika** — 15-second product video generation
- **Playwright** — research scraping across Mercari, OfferUp, Poshmark, Swappa, eBay (read-only, never used for listing)
- **Claude Code** — how the whole thing was built in a weekend

---

## Run it

The root `package.json` is a thin delegator — both scripts `cd` into `dashboard/`.

```bash
# install (root) — pulls in dashboard/
npm install

# frontend dev server (Vite)
npm run dev

# backend (in a second terminal, from dashboard/)
cd dashboard
cp .env.example .env  # see env vars below
npm run server
```

Open http://localhost:5173 (Vite) — frontend talks to backend on `http://localhost:3001`.

### Env vars

**Backend (`dashboard/.env`)**
```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
OPENAI_API_KEY=
BROWSERBASE_API_KEY=
PIKA_ACCESS_TOKEN=
```

**Frontend (`dashboard/.env`, same file, `VITE_` prefix exposes to client)**
```
VITE_API_URL=http://localhost:3001
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

---

Built in a weekend with **Claude Code**.

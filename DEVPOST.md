# Reseller

## Inspiration

You know the corner. Every home has one. The pile of stuff you swore you'd sell. The shelf of things that "still have value." The box in the closet that's been there since you moved in three years ago.

Everyone *wants* to clear it out. Nobody wants to do the work. Photographing items, researching prices across five different apps, writing descriptions, posting to Facebook Marketplace, then spending your evenings in DMs negotiating with strangers over $5 — it's a part-time job nobody signed up for.

We built Reseller because we wanted to see what happened when you handed that job to AI agents and just walked away.

## What it does

Drop a photo. That's it. Reseller's three-agent pipeline does everything else.

**Researcher** uses GPT-4o Vision to identify your item, then sends autonomous browser agents across eBay, Facebook Marketplace, Mercari, Poshmark, OfferUp, and Swappa to find what it actually sells for right now — real comparable listings scraped live, not a guess.

**Studio** writes the title, description, and tags. Generates AI lifestyle photos. Builds a complete listing and posts it to Facebook Marketplace automatically — no form-filling, no photo uploads, no copy-pasting.

**Closer** monitors your Marketplace Messenger inbox, reads every offer that comes in, counters intelligently based on your floor price, and confirms meetup logistics — while you're at work, asleep, or finally tackling a different corner.

## How we built it

The core challenge was browser automation at scale. Researching prices means navigating six different marketplaces with different layouts, anti-bot protections, and constantly-shifting DOM structures. Posting to Facebook Marketplace means handling photo uploads, multi-step forms, and authenticated sessions. Reading Messenger means scraping a dynamic inbox that was never designed to be scraped.

We used **Browserbase** to run persistent, authenticated browser sessions in the cloud — agents maintain logged-in state across jobs so they're not re-authenticating on every run. **Stagehand** sits on top of Browserbase to give the agents AI-guided form understanding: rather than brittle CSS selectors, Stagehand understands what the form is asking for and fills it correctly even when Facebook changes its UI.

The rest of the stack: **OpenAI GPT-4o** for vision analysis and copywriting, **Pika** for product video generation, **Supabase** for item storage and async job state, and a **React + Vite** frontend with a landing page and full inventory dashboard.

## Challenges we ran into

Facebook's Marketplace is specifically designed to resist automation. It changes its DOM frequently, uses fingerprinting, and silently fails on listings it suspects are bot-generated. Getting Stagehand's AI-guided approach to reliably navigate the full posting flow — photo upload, category selection, price, location, meetup preferences — took significant iteration.

Coordinating three async agents while keeping the UI feeling live and responsive was the other major challenge. Each agent has different latency and failure modes, and the user-facing experience needs to feel like one coherent pipeline, not three separate jobs.

## Accomplishments that we're proud of

A real end-to-end demo: drop a photo of a jacket, and within minutes the system has identified it, priced it against live comparable listings, written a listing, generated a product video, posted it to Facebook Marketplace, and is standing by to handle buyer messages — zero human input after the upload.

The corner actually gets cleared.

## What we learned

Browserbase changes the calculus on what's possible with browser automation. Persistent authenticated sessions in the cloud mean agents maintain context across long-running jobs the way a human would — logged in, warmed up, ready. Combined with Stagehand's AI-guided interaction layer, the class of tasks you can reliably automate is dramatically wider than traditional Selenium-style scraping.

The hardest part wasn't the AI — it was making three concurrent async processes feel like one trustworthy experience to the user.

## What's next for Reseller

- Extend Studio's posting beyond Facebook to OfferUp and Mercari
- Google Calendar sync for Closer's meetup scheduling
- Automated price-drop nudges when items sit unsold beyond 7 days
- Multi-platform inbox — FB Messenger and eBay messages in one negotiation view
- Mobile camera flow — photograph from a thrift store floor and have a listing live before you reach the checkout

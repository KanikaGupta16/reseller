import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright-core";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import { SupabaseClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });

interface ScrapedListing {
  source: string;
  title: string;
  price: number;
  condition: string;
  url: string;
}

interface DbItem {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  condition: string | null;
  description: string | null;
}

async function updateJob(
  supabase: SupabaseClient,
  jobId: string,
  updates: Record<string, unknown>
) {
  await supabase
    .from("research_jobs")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

function buildSearchQueries(item: DbItem) {
  const searchTerm = encodeURIComponent(
    [item.brand, item.model, item.title].filter(Boolean).join(" ")
  );
  return [
    { site: "Mercari", url: `https://www.mercari.com/search/?keyword=${searchTerm}` },
    { site: "Swappa", url: `https://swappa.com/search?q=${searchTerm}` },
    { site: "OfferUp", url: `https://offerup.com/search?q=${searchTerm}` },
    { site: "Poshmark", url: `https://poshmark.com/search?query=${searchTerm}&type=listings` },
  ];
}

async function scrapeWithBrowserbase(
  site: string,
  url: string
): Promise<ScrapedListing[]> {
  console.log(`  [Scrape] ${site}...`);
  let session: any;
  try {
    session = await bb.sessions.create({
      projectId: process.env.BROWSERBASE_PROJECT_ID!,
    });
  } catch (err: any) {
    console.error(`  [Scrape] Session failed for ${site}: ${err.message}`);
    return [];
  }

  let browser: any;
  try {
    browser = await chromium.connectOverCDP(session.connectUrl);
  } catch (err: any) {
    console.error(`  [Scrape] Connect failed for ${site}: ${err.message}`);
    return [];
  }

  try {
    const page = browser.contexts()[0].pages()[0];
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(5000);

    try {
      const btn = page.locator(
        'button:has-text("Accept All"), button:has-text("Accept"), #onetrust-accept-btn-handler'
      );
      if (await btn.first().isVisible({ timeout: 2000 })) {
        await btn.first().click();
        await page.waitForTimeout(1000);
      }
    } catch {}

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(1500);
    }

    const html = await page.content();
    let listings = parseListings(html, site);

    if (listings.length === 0) {
      listings = await extractViaPage(page, site);
    }

    console.log(`  [Scrape] ${site}: ${listings.length} listings`);
    return listings;
  } catch (err: any) {
    console.error(`  [Scrape] Error on ${site}: ${err.message}`);
    return [];
  } finally {
    await browser.close();
  }
}

function parsePrice(text: string): number {
  const m = text.replace(/,/g, "").match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : 0;
}

function parseListings(html: string, site: string): ScrapedListing[] {
  const $ = cheerio.load(html);
  const listings: ScrapedListing[] = [];

  if (site === "Mercari") {
    $('[data-testid="SearchResults"] [data-testid="ItemCell"]').each((_, el) => {
      const title = $(el).find('[data-testid="ItemName"]').text().trim();
      const price = parsePrice($(el).find('[data-testid="ItemPrice"]').text());
      if (title && price > 0) listings.push({ source: site, title, price, condition: "unknown", url: "https://www.mercari.com" });
    });
    if (listings.length === 0) {
      $('a[href*="/item/"]').each((_, el) => {
        const text = $(el).text();
        const priceMatch = text.replace(/,/g, "").match(/\$(\d+\.?\d*)/);
        const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
        const title = $(el).find("span, p").first().text().trim();
        if (title && price > 0 && title.length > 5) {
          listings.push({ source: site, title: title.substring(0, 120), price, condition: "unknown", url: "https://www.mercari.com" + ($(el).attr("href") || "") });
        }
      });
    }
  } else if (site === "Swappa") {
    $(".cell_product.search").each((_, el) => {
      const title = $(el).find("a.title").text().trim();
      const price = parsePrice($(el).find("a.price").text());
      const href = $(el).find("a.title").attr("href") || "";
      if (title && price > 0) listings.push({ source: site, title, price, condition: "unknown", url: href ? "https://swappa.com" + href : "https://swappa.com" });
    });
  } else if (site === "OfferUp") {
    $('[class*="listing-card"], [class*="ItemCard"], a[href*="/item/"]').each((_, el) => {
      const text = $(el).text();
      const priceMatch = text.replace(/,/g, "").match(/\$(\d+\.?\d*)/);
      const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
      const title = $(el).find('[class*="title"], h3, span').first().text().trim();
      if (title && price > 0 && title.length > 3) listings.push({ source: site, title: title.substring(0, 120), price, condition: "unknown", url: "https://offerup.com" });
    });
  } else if (site === "Poshmark") {
    $('[data-et-name="listing"], .card--small, .tile').each((_, el) => {
      const title = $(el).find('.title, [data-et-name="title"], a').first().text().trim();
      const price = parsePrice($(el).find('.price, [data-et-name="price"]').text());
      if (title && price > 0) listings.push({ source: site, title: title.substring(0, 120), price, condition: "unknown", url: "https://poshmark.com" });
    });
  }

  return listings.slice(0, 15);
}

async function extractViaPage(page: any, site: string): Promise<ScrapedListing[]> {
  try {
    if (site === "Mercari") {
      return await page.evaluate(() => {
        const items: any[] = [];
        document.querySelectorAll('[data-testid="ItemCell"], [class*="ItemContainer"], a[href*="/item/"]').forEach((el: any) => {
          const text = el.textContent || "";
          const priceMatch = text.replace(/,/g, "").match(/\$(\d+\.?\d*)/);
          const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
          const spans = el.querySelectorAll("span, p, div");
          let title = "";
          for (const s of spans) {
            const t = s.textContent?.trim() || "";
            if (t.length > 5 && !t.startsWith("$") && !t.match(/^\d/)) { title = t.substring(0, 120); break; }
          }
          if (title && price > 0) items.push({ source: "Mercari", title, price, condition: "unknown", url: el.href || "https://www.mercari.com" });
        });
        return items.slice(0, 15);
      });
    }
    if (site === "Swappa") {
      return await page.evaluate(() => {
        const items: any[] = [];
        document.querySelectorAll(".cell_product.search").forEach((el: any) => {
          const titleEl = el.querySelector("a.title");
          const priceEl = el.querySelector("a.price span");
          const title = titleEl?.textContent?.trim() || "";
          const price = priceEl ? parseFloat(priceEl.textContent.replace(/,/g, "")) : 0;
          const href = titleEl?.getAttribute("href") || "";
          if (title && price > 0) items.push({ source: "Swappa", title, price, condition: "unknown", url: href ? "https://swappa.com" + href : "https://swappa.com" });
        });
        return items.slice(0, 15);
      });
    }
    if (site === "OfferUp") {
      return await page.evaluate(() => {
        const items: any[] = [];
        document.querySelectorAll('[class*="listing-card"], [class*="ItemCard"], a[href*="/item/"]').forEach((el: any) => {
          const text = el.textContent || "";
          const priceMatch = text.replace(/,/g, "").match(/\$(\d+\.?\d*)/);
          const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
          const spans = el.querySelectorAll("span, p, h3");
          let title = "";
          for (const s of spans) {
            const t = s.textContent?.trim() || "";
            if (t.length > 3 && !t.startsWith("$") && !t.match(/^\d/)) { title = t.substring(0, 120); break; }
          }
          if (title && price > 0) items.push({ source: "OfferUp", title, price, condition: "unknown", url: el.href || "https://offerup.com" });
        });
        return items.slice(0, 15);
      });
    }
    if (site === "Poshmark") {
      return await page.evaluate(() => {
        const items: any[] = [];
        document.querySelectorAll('[data-et-name="listing"], .card--small, .tile, a[href*="/listing/"]').forEach((el: any) => {
          const text = el.textContent || "";
          const priceMatch = text.replace(/,/g, "").match(/\$(\d+\.?\d*)/);
          const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
          const titleEl = el.querySelector('.title, [data-et-name="title"], h3, span');
          const title = titleEl?.textContent?.trim() || "";
          if (title && price > 0 && title.length > 3) items.push({ source: "Poshmark", title: title.substring(0, 120), price, condition: "unknown", url: el.href || "https://poshmark.com" });
        });
        return items.slice(0, 15);
      });
    }
  } catch {}
  return [];
}

function filterListings(listings: ScrapedListing[], item: DbItem): ScrapedListing[] {
  const searchTitle = [item.brand, item.model, item.title].filter(Boolean).join(" ");
  const words = searchTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

  return listings.filter((l) => {
    const title = l.title.toLowerCase();
    const matchCount = words.filter((w) => title.includes(w)).length;
    if (matchCount < Math.ceil(words.length / 3)) return false;
    if (l.price < 5) return false;
    return true;
  });
}

async function analyzePricing(
  item: DbItem,
  comparables: ScrapedListing[]
): Promise<{ suggestedPrice: number; priceRange: { low: number; high: number }; confidence: string; reasoning: string }> {
  const compsText = comparables
    .map((c, i) => `${i + 1}. "${c.title}" - $${c.price} (${c.condition}) [${c.source}]`)
    .join("\n");

  const prompt = `You are a pricing expert for secondhand goods resale. Analyze the following item and comparable listings to suggest an optimal selling price.

**Item to Price:**
- Title: ${item.title}
- Brand: ${item.brand || "Unknown"}
- Model: ${item.model || "Unknown"}
- Category: ${item.category || "General"}
- Condition: ${item.condition || "Unknown"}
- Description: ${item.description || "N/A"}

**Comparable Listings Found:**
${compsText || "No comparable listings found."}

Provide your analysis as JSON:
{
  "suggestedPrice": <number>,
  "priceRange": { "low": <number>, "high": <number> },
  "confidence": "<low|medium|high>",
  "reasoning": "<2-3 sentences>"
}

Consider:
- The item's condition relative to comparables
- Sold prices carry more weight than active listing prices
- Local marketplace prices tend to be lower than shipped platforms
- New/sealed items command a premium

Return ONLY the JSON, no markdown fences.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
  });

  const content = response.choices[0].message.content || "{}";
  return JSON.parse(content.replace(/```json\n?|```/g, "").trim());
}

export async function runResearch(
  supabase: SupabaseClient,
  jobId: string,
  item: DbItem
) {
  console.log(`\n[Research] Starting for "${item.title}" (job: ${jobId})`);

  // Step 1: Scrape all sources in parallel
  const queries = buildSearchQueries(item);
  const sourcesStatus: Record<string, string> = {};
  queries.forEach((q) => (sourcesStatus[q.site] = "scraping"));
  await updateJob(supabase, jobId, { step: "scraping", progress: 10, sources_status: sourcesStatus });

  const results = await Promise.allSettled(
    queries.map(async (q) => {
      const listings = await scrapeWithBrowserbase(q.site, q.url);
      sourcesStatus[q.site] = listings.length > 0 ? `found ${listings.length}` : "no results";
      await updateJob(supabase, jobId, { sources_status: sourcesStatus });
      return listings;
    })
  );

  const allListings: ScrapedListing[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") allListings.push(...r.value);
  }

  console.log(`[Research] Total raw: ${allListings.length}`);
  await updateJob(supabase, jobId, { step: "filtering", progress: 50 });

  // Step 2: Filter
  const filtered = filterListings(allListings, item);
  console.log(`[Research] Filtered: ${filtered.length}`);

  if (filtered.length === 0 && allListings.length === 0) {
    await updateJob(supabase, jobId, {
      status: "completed",
      step: "done",
      progress: 100,
      comps: [],
      result: { suggestedPrice: null, priceRange: null, confidence: "low", reasoning: "No comparable listings found on any marketplace." },
    });
    return;
  }

  const comps = filtered.length > 0 ? filtered : allListings.slice(0, 20);
  await updateJob(supabase, jobId, { step: "analyzing", progress: 70, comps });

  // Step 3: Store scraped listings in listings table with embeddings
  for (const listing of comps) {
    try {
      const embeddingText = `${listing.title} ${listing.condition} $${listing.price}`;
      const embResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: embeddingText,
      });

      await supabase.from("listings").insert({
        title: listing.title,
        source: listing.source,
        price: listing.price,
        condition: listing.condition,
        url: listing.url,
        embedding: embResponse.data[0].embedding,
        tags: [item.title, item.brand, item.category].filter(Boolean),
      });
    } catch (err: any) {
      console.error(`  [Store] Error: ${err.message}`);
    }
  }

  // Step 4: Analyze pricing
  const analysis = await analyzePricing(item, comps);
  console.log(`[Research] Suggested: $${analysis.suggestedPrice} (${analysis.confidence})`);

  // Step 5: Update item with results
  await supabase
    .from("items")
    .update({
      research_suggested_price: analysis.suggestedPrice,
      research_range: analysis.priceRange,
      research_confidence: analysis.confidence,
      research_reasoning: analysis.reasoning,
    })
    .eq("id", item.id);

  // Step 6: Mark job complete
  await updateJob(supabase, jobId, {
    status: "completed",
    step: "done",
    progress: 100,
    result: analysis,
  });

  console.log(`[Research] Job ${jobId} complete`);
}

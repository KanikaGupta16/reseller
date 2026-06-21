import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright-core";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";
import { config } from "./config";
import { ScrapedListing, SearchQuery, ItemListing } from "./types";

const DEBUG_DIR = path.resolve(__dirname, "../debug");
if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });

const bb = new Browserbase({
  apiKey: config.browserbase.apiKey,
});

function buildSearchQueries(item: ItemListing): SearchQuery[] {
  const searchTerm = encodeURIComponent(item.title);

  return [
    {
      query: item.title,
      site: "Mercari",
      url: `https://www.mercari.com/search/?keyword=${searchTerm}`,
    },
    {
      query: item.title,
      site: "Swappa",
      url: `https://swappa.com/search?q=${searchTerm}`,
    },
    {
      query: item.title,
      site: "OfferUp",
      url: `https://offerup.com/search?q=${searchTerm}`,
    },
    {
      query: item.title,
      site: "Poshmark",
      url: `https://poshmark.com/search?query=${searchTerm}&type=listings`,
    },
  ];
}

async function scrapeWithBrowserbase(
  searchQuery: SearchQuery
): Promise<ScrapedListing[]> {
  console.log(`  [Browserbase] Scraping ${searchQuery.site}...`);

  let session: any;
  try {
    session = await bb.sessions.create({
      projectId: config.browserbase.projectId,
    });
    console.log(`  [Debug] Session created for ${searchQuery.site}: ${session.id}`);
  } catch (err: any) {
    console.error(`  [Debug] Failed to create session for ${searchQuery.site}: ${err.message}`);
    return [];
  }

  let browser: any;
  try {
    browser = await chromium.connectOverCDP(session.connectUrl);
    console.log(`  [Debug] Browser connected for ${searchQuery.site}`);
  } catch (err: any) {
    console.error(`  [Debug] Failed to connect browser for ${searchQuery.site}: ${err.message}`);
    return [];
  }

  try {
    const context = browser.contexts()[0];
    const page = context.pages()[0];

    console.log(`  [Debug] Navigating to: ${searchQuery.url}`);
    await page.goto(searchQuery.url, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForTimeout(5000);
    console.log(`  [Debug] Navigation complete for ${searchQuery.site}`);

    // Dismiss cookie consent modals
    try {
      const acceptBtn = page.locator('button:has-text("Accept All"), button:has-text("Accept"), button:has-text("I Accept"), #onetrust-accept-btn-handler');
      if (await acceptBtn.first().isVisible({ timeout: 2000 })) {
        await acceptBtn.first().click();
        console.log(`  [Debug] Dismissed cookie modal on ${searchQuery.site}`);
        await page.waitForTimeout(1000);
      }
    } catch {}


    // Scroll down to trigger lazy-loaded content
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(1500);
    }
    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    const safeName = searchQuery.site.replace(/[^a-zA-Z0-9]/g, "_");
    const screenshotPath = path.join(DEBUG_DIR, `${safeName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`  [Debug] Screenshot saved: ${screenshotPath}`);

    const html = await page.content();
    const htmlPath = path.join(DEBUG_DIR, `${safeName}.html`);
    fs.writeFileSync(htmlPath, html, "utf-8");
    console.log(`  [Debug] HTML saved: ${htmlPath} (${(html.length / 1024).toFixed(0)}KB)`);

    const pageTitle = await page.title();
    const pageUrl = page.url();
    console.log(`  [Debug] Page title: "${pageTitle}"`);
    console.log(`  [Debug] Final URL: ${pageUrl}`);

    let listings = parseListings(html, searchQuery.site, searchQuery.url);

    if (listings.length === 0) {
      console.log(`  [Debug] Cheerio parsing found 0 listings, trying page evaluation fallback...`);
      listings = await extractViaPage(page, searchQuery.site);
    }

    console.log(
      `  [Browserbase] Found ${listings.length} listings on ${searchQuery.site}`
    );
    return listings;
  } catch (error: any) {
    console.error(
      `  [Browserbase] Error scraping ${searchQuery.site}: ${error.message}`
    );
    console.error(`  [Debug] Full error:`, error.stack || error);
    return [];
  } finally {
    await browser.close();
  }
}

async function extractViaPage(
  page: any,
  site: string
): Promise<ScrapedListing[]> {
  try {
    if (site === "Mercari") {
      return await page.evaluate(() => {
        const items: any[] = [];
        // Try multiple selector patterns
        const cards = document.querySelectorAll(
          '[data-testid="ItemCell"], [class*="ItemContainer"], [class*="SearchResultItem"], a[href*="/item/"]'
        );
        cards.forEach((el: any) => {
          const text = el.textContent || "";
          const priceMatch = text.replace(/,/g, "").match(/\$(\d+\.?\d*)/);
          const price = priceMatch ? parseFloat(priceMatch[1]) : 0;

          // Get the first meaningful text as title
          const spans = el.querySelectorAll("span, p, div");
          let title = "";
          for (const s of spans) {
            const t = s.textContent?.trim() || "";
            if (t.length > 5 && !t.startsWith("$") && !t.match(/^\d/)) {
              title = t.substring(0, 120);
              break;
            }
          }

          if (title && price > 0) {
            items.push({
              source: "Mercari",
              title,
              price,
              condition: "unknown",
              url: el.href || "https://www.mercari.com",
            });
          }
        });
        return items.slice(0, 15);
      });
    }

    if (site === "Swappa") {
      return await page.evaluate(() => {
        const items: any[] = [];
        document
          .querySelectorAll(".cell_product.search")
          .forEach((el: any) => {
            const titleEl = el.querySelector("a.title");
            const priceEl = el.querySelector("a.price span");
            const title = titleEl?.textContent?.trim() || "";
            const price = priceEl ? parseFloat(priceEl.textContent.replace(/,/g, "")) : 0;
            const href = titleEl?.getAttribute("href") || "";

            if (title && price > 0) {
              items.push({
                source: "Swappa",
                title,
                price,
                condition: "unknown",
                url: href ? "https://swappa.com" + href : "https://swappa.com",
              });
            }
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
          if (title && price > 0) {
            items.push({ source: "OfferUp", title, price, condition: "unknown", url: el.href || "https://offerup.com" });
          }
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
          if (title && price > 0 && title.length > 3) {
            items.push({ source: "Poshmark", title: title.substring(0, 120), price, condition: "unknown", url: el.href || "https://poshmark.com" });
          }
        });
        return items.slice(0, 15);
      });
    }
  } catch {
    // fallback extraction failed silently
  }

  return [];
}

function parseListings(
  html: string,
  site: string,
  baseUrl: string
): ScrapedListing[] {
  const $ = cheerio.load(html);
  const listings: ScrapedListing[] = [];

  if (site === "Mercari") {
    // Primary selectors
    $('[data-testid="SearchResults"] [data-testid="ItemCell"]').each(
      (_, el) => {
        const title = $(el).find('[data-testid="ItemName"]').text().trim();
        const priceText = $(el).find('[data-testid="ItemPrice"]').text().trim();
        const price = parsePrice(priceText);

        if (title && price > 0) {
          listings.push({
            source: site,
            title,
            price,
            condition: "unknown",
            url: "https://www.mercari.com",
          });
        }
      }
    );

    // Fallback: grab any item cards with price patterns
    if (listings.length === 0) {
      $('a[href*="/item/"]').each((_, el) => {
        const text = $(el).text();
        const priceMatch = text.replace(/,/g, "").match(/\$(\d+\.?\d*)/);
        const price = priceMatch ? parseFloat(priceMatch[1]) : 0;

        const title = $(el).find("span, p").first().text().trim();

        if (title && price > 0 && title.length > 5) {
          listings.push({
            source: site,
            title: title.substring(0, 120),
            price,
            condition: "unknown",
            url: "https://www.mercari.com" + ($(el).attr("href") || ""),
          });
        }
      });
    }
  } else if (site === "Swappa") {
    $(".cell_product.search").each((_, el) => {
      const title = $(el).find("a.title").text().trim();
      const priceText = $(el).find("a.price").text().trim();
      const price = parsePrice(priceText);
      const href = $(el).find("a.title").attr("href") || "";

      if (title && price > 0) {
        listings.push({
          source: site,
          title,
          price,
          condition: "unknown",
          url: href ? "https://swappa.com" + href : "https://swappa.com",
        });
      }
    });
  } else if (site === "OfferUp") {
    $('[class*="listing-card"], [class*="ItemCard"], a[href*="/item/"]').each((_, el) => {
      const text = $(el).text();
      const priceMatch = text.replace(/,/g, "").match(/\$(\d+\.?\d*)/);
      const price = priceMatch ? parseFloat(priceMatch[1]) : 0;
      const title = $(el).find('[class*="title"], h3, span').first().text().trim();

      if (title && price > 0 && title.length > 3) {
        listings.push({
          source: site,
          title: title.substring(0, 120),
          price,
          condition: "unknown",
          url: "https://offerup.com",
        });
      }
    });
  } else if (site === "Poshmark") {
    $('[data-et-name="listing"], .card--small, .tile').each((_, el) => {
      const title = $(el).find('.title, [data-et-name="title"], a').first().text().trim();
      const priceText = $(el).find('.price, [data-et-name="price"]').text().trim();
      const price = parsePrice(priceText);

      if (title && price > 0) {
        listings.push({
          source: site,
          title: title.substring(0, 120),
          price,
          condition: "unknown",
          url: "https://poshmark.com",
        });
      }
    });
  }

  return listings.slice(0, 15);
}

function parsePrice(priceText: string): number {
  const match = priceText.replace(/,/g, "").match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
}

function extractCondition(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("new") || lower.includes("sealed")) return "new";
  if (lower.includes("like new") || lower.includes("open box")) return "like new";
  if (lower.includes("good")) return "good";
  if (lower.includes("fair") || lower.includes("acceptable")) return "fair";
  return "unknown";
}

export async function scrapeAllSources(
  item: ItemListing
): Promise<ScrapedListing[]> {
  const queries = buildSearchQueries(item);
  console.log(
    `\nStarting parallel scraping across ${queries.length} sources...`
  );

  const results = await Promise.allSettled(
    queries.map((q) => scrapeWithBrowserbase(q))
  );

  const allListings: ScrapedListing[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allListings.push(...result.value);
    }
  }

  console.log(`\nTotal listings found: ${allListings.length}`);
  return allListings;
}

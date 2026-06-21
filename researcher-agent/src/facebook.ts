import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod/v3";
import * as fs from "fs";
import * as path from "path";
import { config } from "./config";
import { ScrapedListing, ItemListing } from "./types";

const DEBUG_DIR = path.resolve(__dirname, "../debug");

const ListingSchema = z.object({
  listings: z.array(
    z.object({
      title: z.string(),
      price: z.number(),
      condition: z.string(),
      location: z.string().optional(),
    })
  ),
});

export async function scrapeFacebookMarketplace(
  item: ItemListing
): Promise<ScrapedListing[]> {
  const contextId = config.browserbase.contextId;
  if (!contextId) {
    console.log("  [Facebook] No BROWSERBASE_CONTEXT_ID set. Run 'npm run setup' first.");
    return [];
  }

  console.log("  [Facebook] Scraping Facebook Marketplace...");

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    verbose: 0,
    browserbaseSessionCreateParams: {
      browserSettings: {
        solveCaptchas: true,
        context: { id: contextId, persist: true },
      },
    },
  });

  try {
    await stagehand.init();
    console.log(`  [Facebook] Session: https://browserbase.com/sessions/${stagehand.browserbaseSessionId}`);

    const page = stagehand.context.pages()[0];

    try {
      await page.goto("https://www.facebook.com/", {
        waitUntil: "domcontentloaded",
        timeoutMs: 30000,
      });
    } catch {}
    await page.waitForTimeout(4000);

    const loginCheck = await stagehand.extract(
      "Is this a Facebook LOGIN page with email/password fields? Answer true ONLY if you see a login form.",
      z.object({ isLoginPage: z.boolean() }),
    );
    if (loginCheck.isLoginPage) {
      console.log("  [Facebook] Session expired. Re-run 'npm run setup'.");
      return [];
    }

    const searchTerm = item.title;
    const marketplaceUrl = `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(searchTerm)}`;

    console.log(`  [Facebook] Navigating to Marketplace search: ${searchTerm}`);
    try {
      await page.goto(marketplaceUrl, {
        waitUntil: "domcontentloaded",
        timeoutMs: 45000,
      });
    } catch {}
    await page.waitForTimeout(5000);

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(2000);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
    await page.screenshot({ path: path.join(DEBUG_DIR, "facebook_marketplace.png"), fullPage: true });
    console.log("  [Debug] Facebook screenshot saved");

    const extracted = await stagehand.extract(
      `Extract all visible product listings from this Facebook Marketplace search results page.
For each listing, get:
- title: the product name/title
- price: the numeric price in dollars (0 if free or not shown)
- condition: "new", "like new", "good", "fair", or "unknown"
- location: the seller's location if shown

Only include real product listings, not ads or suggested items.`,
      ListingSchema,
    );

    const listings: ScrapedListing[] = extracted.listings
      .filter((l) => l.price > 0)
      .map((l) => ({
        source: "Facebook Marketplace",
        title: l.title,
        price: l.price,
        condition: l.condition || "unknown",
        url: marketplaceUrl,
      }));

    console.log(`  [Facebook] Found ${listings.length} listings`);
    return listings.slice(0, 15);
  } catch (error: any) {
    console.error(`  [Facebook] Error: ${error.message}`);
    return [];
  } finally {
    await stagehand.close();
  }
}

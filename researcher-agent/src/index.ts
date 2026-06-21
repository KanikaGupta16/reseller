import * as fs from "fs";
import * as path from "path";
import { scrapeAllSources } from "./scraper";
import { scrapeFacebookMarketplace } from "./facebook";
import {
  ensureIndex,
  storeListings,
  findSimilarListings,
  disconnectRedis,
} from "./vectorstore";
import { analyzePricing } from "./pricing";
import { ItemListing, ScrapedListing, PriceResearchResult } from "./types";

function filterRelevantListings(
  listings: ScrapedListing[],
  item: ItemListing
): ScrapedListing[] {
  const itemWords = item.title.toLowerCase().split(/\s+/).filter((w) => w.length > 2);

  return listings.filter((listing) => {
    const title = listing.title.toLowerCase();

    // Must share at least half the significant words from the item title
    const matchCount = itemWords.filter((w) => title.includes(w)).length;
    if (matchCount < Math.ceil(itemWords.length / 2)) return false;

    // Reject accessories-only listings (controllers, cases, games, cables)
    const accessoryPatterns = /\b(joy-?con|controller|case|charger|cable|dock|grip|strap|screen protector|carrying|stand|games? bundle)\b/i;
    if (accessoryPatterns.test(listing.title) && !accessoryPatterns.test(item.title)) return false;

    // Reject different model generations (e.g. "Switch 2" when selling "Switch")
    const itemHasGenNumber = item.title.match(/switch\s*(\d+)/i);
    const listingGenNumber = listing.title.match(/switch\s*(\d+)/i);
    if (listingGenNumber && !itemHasGenNumber) return false;
    if (listingGenNumber && itemHasGenNumber && listingGenNumber[1] !== itemHasGenNumber[1]) return false;

    // Reject "Lite" or "OLED" variants if the item title doesn't include them
    const variants = ["lite", "oled"];
    for (const v of variants) {
      if (title.includes(v) && !item.title.toLowerCase().includes(v)) return false;
    }

    // Reject prices that are clearly absurd (< $10 or > 5x item price)
    if (listing.price < 10 || (item.price > 0 && listing.price > item.price * 5)) return false;

    return true;
  });
}

function loadItem(filePath: string): ItemListing {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as ItemListing;
}

function printComparables(comparables: ScrapedListing[]): void {
  console.log("\n  Top Comparables:");
  comparables.slice(0, 10).forEach((c, i) => {
    console.log(
      `    ${i + 1}. $${c.price.toFixed(2)} - "${c.title}" [${c.source}] (${c.condition})`
    );
  });
}

function printResult(result: PriceResearchResult): void {
  console.log("\n" + "=".repeat(60));
  console.log("  PRICING RESEARCH RESULTS");
  console.log("=".repeat(60));
  console.log(`\n  Item: ${result.item.title}`);
  console.log(`  Condition: ${result.item.condition}`);
  console.log(`  Location: ${result.item.location}`);
  console.log(`\n  Comparables Found: ${result.comparables.length}`);

  const sources = new Set(result.comparables.map((c) => c.source));
  console.log(`  Sources: ${[...sources].join(", ")}`);

  printComparables(result.comparables);

  console.log("\n" + "-".repeat(60));
  console.log(`  SUGGESTED PRICE:  $${result.suggestedPrice}`);
  console.log(
    `  PRICE RANGE:      $${result.priceRange.low} - $${result.priceRange.high}`
  );
  console.log(`  CONFIDENCE:       ${result.confidence}`);
  console.log(`\n  Reasoning: ${result.reasoning}`);
  console.log("=".repeat(60) + "\n");
}

async function main(): Promise<void> {
  const contentPath =
    process.argv[2] ||
    path.resolve(
      __dirname,
      "../../Nintendo Switch Sell/Content.txt"
    );

  if (!fs.existsSync(contentPath)) {
    console.error(`File not found: ${contentPath}`);
    process.exit(1);
  }

  console.log(`Loading item from: ${contentPath}`);
  const item = loadItem(contentPath);
  console.log(`Item: "${item.title}" | Condition: ${item.condition} | Listed: $${item.price}`);

  // Step 1: Scrape prices from multiple sources via Browserbase + Facebook Marketplace
  const [otherListings, fbListings] = await Promise.all([
    scrapeAllSources(item),
    scrapeFacebookMarketplace(item),
  ]);
  const rawListings = [...otherListings, ...fbListings];
  const scrapedListings = filterRelevantListings(rawListings, item);
  console.log(`\nFiltered: ${rawListings.length} raw → ${scrapedListings.length} relevant (removed ${rawListings.length - scrapedListings.length} outliers)`);

  if (scrapedListings.length === 0) {
    console.log("\n" + "=".repeat(60));
    console.log("  NO SCRAPE DATA FOUND");
    console.log("=".repeat(60));
    console.log(`\n  Item: ${item.title}`);
    console.log(`  Condition: ${item.condition}`);
    console.log(`  Could not find comparable listings from any source.`);
    console.log(`  Try adjusting the item title or check Browserbase logs.`);
    console.log("=".repeat(60) + "\n");
    return;
  }

  // Step 2: Store in Supabase with vector embeddings
  await ensureIndex();
  await storeListings(scrapedListings);

  // Step 3: Find most similar listings using vector search
  const searchQuery = `${item.title} ${item.condition} ${item.category}`;
  const similarListings = await findSimilarListings(searchQuery);

  const filteredSimilar = filterRelevantListings(similarListings, item);
  const comparables =
    filteredSimilar.length > 0 ? filteredSimilar : scrapedListings;

  // Step 4: Analyze with OpenAI
  const result = await analyzePricing(item, comparables);

  printResult(result);

  await disconnectRedis();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

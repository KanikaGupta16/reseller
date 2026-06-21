import OpenAI from "openai";
import { config } from "./config";
import { ItemListing, ScrapedListing, PriceResearchResult } from "./types";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export async function analyzePricing(
  item: ItemListing,
  comparables: ScrapedListing[]
): Promise<PriceResearchResult> {
  console.log("\n[OpenAI] Analyzing pricing with GPT-5.5...");

  const comparablesText = comparables
    .map(
      (c, i) =>
        `${i + 1}. "${c.title}" - $${c.price} (${c.condition}) [${c.source}]`
    )
    .join("\n");

  const prompt = `You are a pricing expert for secondhand goods resale. Analyze the following item and comparable listings to suggest an optimal selling price.

**Item to Price:**
- Title: ${item.title}
- Category: ${item.category}
- Condition: ${item.condition}
- Location: ${item.location}
- Description: ${item.description}

**Comparable Listings/Sales Found:**
${comparablesText || "No comparable listings found."}

Provide your analysis as JSON with this exact structure:
{
  "suggestedPrice": <number - the single best price to list at>,
  "priceRange": {
    "low": <number - lowest reasonable price>,
    "high": <number - highest reasonable price>
  },
  "confidence": "<low|medium|high>",
  "reasoning": "<2-3 sentences explaining your price recommendation, referencing the comparable data>"
}

Consider:
- The item's condition relative to comparables
- Sold prices carry more weight than active listing prices
- Local marketplace prices (FB Marketplace) tend to be lower than shipped platforms (eBay)
- Factor in the item being pickup-only in ${item.location}
- New/sealed items command a premium

Return ONLY the JSON, no markdown fences.`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.5",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
  });

  const content = response.choices[0].message.content || "{}";
  const analysis = JSON.parse(content);

  return {
    item,
    comparables,
    suggestedPrice: analysis.suggestedPrice,
    priceRange: analysis.priceRange,
    reasoning: analysis.reasoning,
    confidence: analysis.confidence,
  };
}

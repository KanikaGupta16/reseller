export interface ProductInfo {
  title: string;
  brand: string | null;
  model: string | null;
  category: string;
  condition: string;
  description: string;
  tags: string[];
}

export async function analyzeImage(base64: string): Promise<ProductInfo> {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) throw new Error("VITE_OPENAI_API_KEY is not set in .env");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a product identification expert for resellers. Analyze the product photo and extract structured information. Do NOT estimate price. Return ONLY valid JSON with these fields:
{
  "title": "concise product title (naturally include the brand name if identifiable)",
  "brand": "brand name or null",
  "model": "model name/number or null",
  "category": "e.g. Electronics, Clothing, Shoes, Accessories, Home, Sports, Toys, Books, Other",
  "condition": "New, Like New, Good, Fair, or Poor",
  "description": "2-3 sentence description of the product, key features, color, size if visible",
  "tags": ["relevant", "search", "tags"]
}`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this product photo for resale listing. Extract all relevant details but do NOT estimate price.",
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64}` },
            },
          ],
        },
      ],
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vision API error: ${err}`);
  }

  const data = await res.json();
  const content = data.choices[0].message.content;
  const jsonStr = content.replace(/```json\n?|```/g, "").trim();
  return JSON.parse(jsonStr);
}

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { messengerSession, type Conversation, type Message } from "./messenger";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const NEGOTIATION_FLOOR_PERCENT = 0.80;

interface ReplyLog {
  conversationId: string;
  question: string;
  reply: string;
  source: string;
  timestamp: number;
}

interface ItemContext {
  title: string;
  brand: string | null;
  model: string | null;
  category: string | null;
  condition: string | null;
  description: string | null;
  listing_price: number | null;
  research_suggested_price: number | null;
  research_range: any;
  research_reasoning: string | null;
  location: string | null;
}

export interface PendingDeal {
  conversationId: string;
  conversationName: string;
  itemName: string;
  buyerName: string;
  agreedPrice: number | null;
  meetupTime: string | null;
  meetupLocation: string | null;
  status: "awaiting_details" | "ready" | "calendar_created";
  timestamp: number;
}

type Intent = "question" | "negotiation" | "agreement" | "meetup_details" | "ignore";

class BuyerReplyAgent {
  private _running = false;
  private _pollTimer: ReturnType<typeof setTimeout> | null = null;
  private _repliedKeys = new Set<string>();
  private _log: ReplyLog[] = [];
  private _pollIntervalMs = 20_000;
  private _itemCache = new Map<string, { data: ItemContext | null; ts: number }>();
  private _pendingDeals = new Map<string, PendingDeal>();

  get running() { return this._running; }
  get log() { return this._log.slice(-50); }
  get pendingDeals() { return [...this._pendingDeals.values()]; }

  getPendingDeal(conversationId: string) { return this._pendingDeals.get(conversationId); }

  markDealCalendarCreated(conversationId: string) {
    const deal = this._pendingDeals.get(conversationId);
    if (deal) deal.status = "calendar_created";
  }

  start() {
    if (this._running) return;
    this._running = true;
    console.log("[BuyerAgent] Started");
    this.poll();
  }

  stop() {
    this._running = false;
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    console.log("[BuyerAgent] Stopped");
  }

  private scheduleNext() {
    if (!this._running) return;
    this._pollTimer = setTimeout(() => this.poll(), this._pollIntervalMs);
  }

  private async poll() {
    if (!this._running) return;

    try {
      if (messengerSession.status !== "connected") {
        this.scheduleNext();
        return;
      }

      const conversations = await messengerSession.getConversations();

      for (const conv of conversations) {
        if (!this._running) break;
        await this.checkConversation(conv);
      }
    } catch (err: any) {
      console.error("[BuyerAgent] Poll error:", err.message);
    }

    this.scheduleNext();
  }

  private async checkConversation(conv: Conversation) {
    const itemName = this.extractItemName(conv.name);
    if (!itemName) return;

    if (conv.lastMessage.startsWith("You:")) return;

    const { messages } = await messengerSession.getMessages(conv.id);
    if (messages.length === 0) return;

    const last = messages[messages.length - 1];

    if (last.isMe) return;

    const key = `${conv.id}::${last.text}::${last.timestamp}`;
    if (this._repliedKeys.has(key)) return;

    const recentContext = messages.slice(-8).map(m => `${m.isMe ? "You" : m.sender}: ${m.text}`).join("\n");
    const hasPendingDeal = this._pendingDeals.has(conv.id);
    const intent = await this.classifyIntent(last.text, itemName, recentContext, hasPendingDeal);

    if (intent === "ignore") return;

    console.log(`[BuyerAgent] [${intent}] from ${conv.name}: "${last.text}"`);

    const itemContext = await this.getItemContext(itemName);
    const buyerName = conv.name.split("·")[0].trim();
    let reply: string | null = null;

    if (intent === "agreement") {
      reply = await this.handleAgreement(conv, itemName, buyerName, messages, itemContext);
    } else if (intent === "meetup_details") {
      reply = await this.handleMeetupDetails(conv, last.text, itemName, buyerName, messages, itemContext);
    } else if (intent === "negotiation") {
      reply = await this.handleNegotiation(last.text, itemName, messages, itemContext);
    } else {
      const recentBuyerQs = messages
        .filter(m => !m.isMe && m.text.trim().endsWith("?"))
        .slice(-3)
        .map(m => m.text);

      let webInfo: string | null = null;
      if (this.needsWebSearch(last.text, itemContext, messages)) {
        const searchContext = recentBuyerQs.length > 1 ? recentBuyerQs.join(" / ") : last.text;
        webInfo = await this.webSearch(searchContext, itemName);
      }

      reply = await this.generateReply(last.text, itemName, messages, itemContext, webInfo);
    }

    if (!reply) return;

    console.log(`[BuyerAgent] Replying (${intent}): "${reply}"`);
    await messengerSession.sendMessage(conv.id, reply);

    this._repliedKeys.add(key);
    this._log.push({ conversationId: conv.id, question: last.text, reply, source: intent, timestamp: Date.now() });
  }

  private async classifyIntent(
    message: string,
    itemName: string,
    recentContext: string,
    hasPendingDeal: boolean
  ): Promise<Intent> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 20,
        messages: [
          {
            role: "system",
            content: `You classify buyer messages on Facebook Marketplace for the listing "${itemName}".
${hasPendingDeal ? "NOTE: This buyer has already agreed to buy. We are waiting for meetup time/location details." : ""}

Reply with exactly one word:
- "question" — buyer is asking about the item (availability, specs, condition, location, etc.)
- "negotiation" — buyer is making an offer, asking for a lower price, or discussing price
- "agreement" — buyer is confirming they want to buy at the current/listed price (e.g. "I'll take it", "deal", "sold", "yes I want it", "I'll buy it")
- "meetup_details" — buyer is providing or discussing meetup time, date, or location for pickup${hasPendingDeal ? " (PRIORITIZE this if the message contains any time, date, or place)" : ""}
- "ignore" — not relevant, chit-chat, greeting with no question, or spam

Recent conversation:
${recentContext}`,
          },
          { role: "user", content: message },
        ],
      });

      const result = response.choices[0]?.message?.content?.trim().toLowerCase() || "ignore";
      if (result.includes("agreement")) return "agreement";
      if (result.includes("meetup")) return "meetup_details";
      if (result.includes("question")) return "question";
      if (result.includes("negotiation")) return "negotiation";
      return "ignore";
    } catch (err: any) {
      console.error("[BuyerAgent] Classification error:", err.message);
      return "ignore";
    }
  }

  private async handleAgreement(
    conv: Conversation,
    itemName: string,
    buyerName: string,
    messages: Message[],
    itemContext: ItemContext | null
  ): Promise<string | null> {
    // Figure out agreed price from conversation
    const agreedPrice = await this.extractAgreedPrice(messages, itemContext);

    const deal: PendingDeal = {
      conversationId: conv.id,
      conversationName: conv.name,
      itemName,
      buyerName,
      agreedPrice,
      meetupTime: null,
      meetupLocation: null,
      status: "awaiting_details",
      timestamp: Date.now(),
    };
    this._pendingDeals.set(conv.id, deal);

    console.log(`[BuyerAgent] Deal started: ${buyerName} buying "${itemName}" for $${agreedPrice}`);

    // Update listing as pending in Supabase
    if (itemContext) {
      await supabase
        .from("items")
        .update({ status: "pending", pending_buyer: buyerName })
        .ilike("title", `%${itemName.replace(/[()]/g, "").trim()}%`);
    }

    return `Sounds good! When works for you to pick it up, and where do you want to meet?`;
  }

  private async handleMeetupDetails(
    conv: Conversation,
    text: string,
    itemName: string,
    buyerName: string,
    messages: Message[],
    itemContext: ItemContext | null
  ): Promise<string | null> {
    let deal = this._pendingDeals.get(conv.id);
    if (!deal) {
      // They're providing details without a formal agreement — create the deal
      const agreedPrice = await this.extractAgreedPrice(messages, itemContext);
      deal = {
        conversationId: conv.id,
        conversationName: conv.name,
        itemName,
        buyerName,
        agreedPrice,
        meetupTime: null,
        meetupLocation: null,
        status: "awaiting_details",
        timestamp: Date.now(),
      };
      this._pendingDeals.set(conv.id, deal);
    }

    // Use GPT to extract time and location from the message + recent context
    const recentContext = messages.slice(-6).map(m => `${m.isMe ? "You" : m.sender}: ${m.text}`).join("\n");
    const extracted = await this.extractMeetupInfo(text, recentContext);

    if (extracted.time) deal.meetupTime = extracted.time;
    if (extracted.location) deal.meetupLocation = extracted.location;

    if (deal.meetupTime && deal.meetupLocation) {
      deal.status = "ready";
      console.log(`[BuyerAgent] Deal READY: ${buyerName}, ${itemName}, time=${deal.meetupTime}, location=${deal.meetupLocation}`);

      // Update Supabase with meetup info
      if (itemContext) {
        await supabase
          .from("items")
          .update({
            status: "pending",
            pending_buyer: buyerName,
            pending_meetup_time: deal.meetupTime,
            pending_meetup_location: deal.meetupLocation,
            pending_agreed_price: deal.agreedPrice,
          })
          .ilike("title", `%${itemName.replace(/[()]/g, "").trim()}%`);
      }

      return `Got it — ${deal.meetupTime} at ${deal.meetupLocation}. See you there!`;
    }

    // Still missing info
    if (!deal.meetupTime && !deal.meetupLocation) {
      return `When and where works best for you?`;
    } else if (!deal.meetupTime) {
      return `What time works for you?`;
    } else {
      return `Where do you want to meet?`;
    }
  }

  private async extractAgreedPrice(messages: Message[], itemContext: ItemContext | null): Promise<number | null> {
    // Look at recent messages for the last mentioned price
    for (let i = messages.length - 1; i >= Math.max(0, messages.length - 10); i--) {
      const m = messages[i];
      const priceMatch = m.text.match(/\$\s*(\d+)/i) || m.text.match(/(\d+)\s*(?:dollars?|bucks|\$)/i)
        || m.text.match(/(?:for|do|at|pay)\s+(\d+)/i);
      if (priceMatch) return parseFloat(priceMatch[1]);
    }
    return itemContext?.listing_price ? Number(itemContext.listing_price) : null;
  }

  private async extractMeetupInfo(text: string, recentContext: string): Promise<{ time: string | null; location: string | null }> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 100,
        messages: [
          {
            role: "system",
            content: `Extract meetup time and location from a buyer's message. Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.

Reply as JSON: {"time": "...", "location": "..."}
- time: convert to a readable format like "Tomorrow at 3pm" or "Saturday June 22 at 2pm". null if not mentioned.
- location: the meetup place. null if not mentioned.

Recent context:
${recentContext}`,
          },
          { role: "user", content: text },
        ],
      });

      const raw = response.choices[0]?.message?.content?.trim() || "{}";
      const parsed = JSON.parse(raw.replace(/```json\n?|```/g, "").trim());
      return {
        time: parsed.time || null,
        location: parsed.location || null,
      };
    } catch (err: any) {
      console.error("[BuyerAgent] Extract meetup error:", err.message);
      return { time: null, location: null };
    }
  }

  private getFloorPrice(itemContext: ItemContext | null): { listingPrice: number; floorPrice: number } | null {
    const price = itemContext?.listing_price || itemContext?.research_suggested_price;
    if (!price) return null;
    return {
      listingPrice: Number(price),
      floorPrice: Math.round(Number(price) * NEGOTIATION_FLOOR_PERCENT),
    };
  }

  private extractOfferAmount(text: string): number | null {
    let match = text.match(/\$\s*(\d+(?:\.\d{2})?)/i)
      || text.match(/(\d+(?:\.\d{2})?)\s*(?:\$|dollars?|bucks)/i);
    if (match) {
      const num = parseFloat(match[1]);
      if (num > 0 && num < 100000) return num;
    }
    match = text.match(/(?:do|take|offer|give|pay|at|for)\s+(\d+(?:\.\d{2})?)/i);
    if (match) {
      const num = parseFloat(match[1]);
      if (num > 0 && num < 100000) return num;
    }
    return null;
  }

  private async handleNegotiation(
    text: string,
    itemName: string,
    messages: Message[],
    itemContext: ItemContext | null
  ): Promise<string | null> {
    const pricing = this.getFloorPrice(itemContext);
    const offerAmount = this.extractOfferAmount(text);

    const recentContext = messages
      .slice(-6)
      .map(m => `${m.isMe ? "You" : m.sender}: ${m.text}`)
      .join("\n");

    let negotiationContext = "";
    if (pricing) {
      negotiationContext = [
        `PRICING:`,
        `- Your listing price: $${pricing.listingPrice}`,
        `- Your absolute minimum (floor): $${pricing.floorPrice}`,
        `- Buyer's offer: ${offerAmount ? `$${offerAmount}` : "unclear"}`,
        "",
      ].join("\n");

      if (offerAmount) {
        if (offerAmount >= pricing.listingPrice) {
          negotiationContext += `STATUS: Offer is at or above listing price — ACCEPT.\n`;
        } else if (offerAmount >= pricing.floorPrice) {
          negotiationContext += `STATUS: Offer is between floor and listing — counter or accept if close.\n`;
        } else {
          negotiationContext += `STATUS: Offer is BELOW floor of $${pricing.floorPrice} — DECLINE.\n`;
        }
      }
    }

    try {
      const systemParts = [
        `You are a seller on Facebook Marketplace negotiating the price of: "${itemName}".`,
        "",
        negotiationContext,
        itemContext ? `Item condition: ${itemContext.condition || "not specified"}` : "",
        "",
        "Negotiation rules:",
        "- NEVER accept or suggest a price below the floor price",
        "- If below floor, decline and state your lowest is the floor price",
        "- If between floor and listing, counter or accept if close",
        "- If at or above listing, accept",
        "- If they ask 'lowest/best price', give a price slightly above floor",
        "- Be direct and brief — one or two sentences max",
        "- Sound like a real person, not a bot",
        "- No filler phrases",
        !pricing ? "- No pricing info — ask them to make an offer" : "",
      ];

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 100,
        messages: [
          { role: "system", content: systemParts.filter(Boolean).join("\n") },
          { role: "user", content: `Recent messages:\n${recentContext}\n\nBuyer says: "${text}"\n\nReply as the seller:` },
        ],
      });

      const reply = response.choices[0]?.message?.content?.trim();
      if (!reply) return null;

      if (pricing) {
        const replyPrices = reply.match(/\$(\d+)/g)?.map(p => parseInt(p.replace("$", ""))) || [];
        for (const p of replyPrices) {
          if (p < pricing.floorPrice && p > 0) {
            console.log(`[BuyerAgent] BLOCKED — $${p} below floor $${pricing.floorPrice}`);
            return `Lowest I can do is $${pricing.floorPrice}.`;
          }
        }
      }

      return reply.replace(/^["']|["']$/g, "");
    } catch (err: any) {
      console.error("[BuyerAgent] Negotiation GPT error:", err.message);
      return null;
    }
  }

  private extractItemName(conversationName: string): string | null {
    const parts = conversationName.split("·");
    if (parts.length < 2) return null;
    return parts.slice(1).join("·").trim();
  }

  private async getItemContext(itemName: string): Promise<ItemContext | null> {
    const cached = this._itemCache.get(itemName);
    if (cached && Date.now() - cached.ts < 300_000) return cached.data;

    try {
      const { data: items } = await supabase
        .from("items")
        .select("title, brand, model, category, condition, description, listing_price, research_suggested_price, research_range, research_reasoning, location")
        .or(`title.ilike.%${itemName.replace(/[()]/g, "").trim()}%`)
        .limit(1);

      if (items && items.length > 0) {
        this._itemCache.set(itemName, { data: items[0], ts: Date.now() });
        return items[0];
      }

      const keywords = itemName.replace(/[()]/g, "").split(/\s+/).filter(w => w.length > 2).slice(0, 3);
      if (keywords.length > 0) {
        const orFilter = keywords.map(k => `title.ilike.%${k}%`).join(",");
        const { data: fuzzy } = await supabase
          .from("items")
          .select("title, brand, model, category, condition, description, listing_price, research_suggested_price, research_range, research_reasoning, location")
          .or(orFilter)
          .limit(5);

        if (fuzzy && fuzzy.length > 0) {
          const best = fuzzy.reduce((a, b) => {
            const aHits = keywords.filter(k => a.title?.toLowerCase().includes(k.toLowerCase())).length;
            const bHits = keywords.filter(k => b.title?.toLowerCase().includes(k.toLowerCase())).length;
            return bHits > aHits ? b : a;
          });
          this._itemCache.set(itemName, { data: best, ts: Date.now() });
          return best;
        }
      }

      this._itemCache.set(itemName, { data: null, ts: Date.now() });
      return null;
    } catch (err: any) {
      console.error("[BuyerAgent] Supabase error:", err.message);
      return null;
    }
  }

  private needsWebSearch(question: string, itemContext: ItemContext | null, messages: Message[]): boolean {
    const q = question.toLowerCase();
    const hasGoodDescription = itemContext?.description && itemContext.description.length > 30 && itemContext.description.toLowerCase() !== "test";
    if (!hasGoodDescription) return true;

    const specPatterns = [
      "which version", "which model", "what model", "what version",
      "switch 1 or 2", "v1 or v2", "gen 1", "gen 2", "generation",
      "oled", "lite", "what year", "how old is",
      "specs", "specification", "storage", "memory", "battery",
      "compatible", "work with", "support",
    ];
    if (specPatterns.some(p => q.includes(p))) return true;

    const recentBuyer = messages.filter(m => !m.isMe).slice(-5);
    for (const msg of recentBuyer) {
      if (specPatterns.some(p => msg.text.toLowerCase().includes(p))) return true;
    }

    if (!itemContext) return true;
    return false;
  }

  private async webSearch(question: string, itemName: string): Promise<string | null> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 200,
        messages: [
          { role: "system", content: "You are a product research assistant. Provide brief factual answers about product specs. 2-3 sentences max." },
          { role: "user", content: `Product: ${itemName}\nQuestion: ${question}` },
        ],
      });
      return response.choices[0]?.message?.content?.trim() || null;
    } catch (err: any) {
      console.error("[BuyerAgent] Web search error:", err.message);
      return null;
    }
  }

  private async generateReply(
    question: string,
    itemName: string,
    messages: Message[],
    itemContext: ItemContext | null,
    webInfo: string | null
  ): Promise<string | null> {
    const recentContext = messages.slice(-6).map(m => `${m.isMe ? "You" : m.sender}: ${m.text}`).join("\n");

    let itemKnowledge = "";
    if (itemContext) {
      const parts: string[] = [];
      parts.push(`Title: ${itemContext.title}`);
      if (itemContext.brand) parts.push(`Brand: ${itemContext.brand}`);
      if (itemContext.model) parts.push(`Model: ${itemContext.model}`);
      if (itemContext.category) parts.push(`Category: ${itemContext.category}`);
      if (itemContext.condition) parts.push(`Condition: ${itemContext.condition}`);
      if (itemContext.description) parts.push(`Description: ${itemContext.description}`);
      if (itemContext.listing_price) parts.push(`Listed price: $${itemContext.listing_price}`);
      if (itemContext.location) parts.push(`Location: ${itemContext.location}`);
      if (itemContext.research_reasoning) parts.push(`Market notes: ${itemContext.research_reasoning}`);
      itemKnowledge = parts.join("\n");
    }

    try {
      const systemParts = [
        `You are a Facebook Marketplace seller replying about: "${itemName}".`,
        "",
        itemKnowledge ? `ITEM DETAILS:\n${itemKnowledge}` : "",
        webInfo ? `PRODUCT INFO:\n${webInfo}` : "",
        "",
        "Rules:",
        "- Direct and concise — one sentence, two max",
        "- If 'still available?' just say 'Yeah it's still available'",
        "- No 'let me know if you have questions', no 'I'll check', no filler",
        "- Sound like a real person texting",
      ];

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 150,
        messages: [
          { role: "system", content: systemParts.filter(Boolean).join("\n") },
          { role: "user", content: `Recent messages:\n${recentContext}\n\nBuyer: "${question}"\n\nReply:` },
        ],
      });

      const reply = response.choices[0]?.message?.content?.trim();
      if (!reply) return null;
      return reply.replace(/^["']|["']$/g, "");
    } catch (err: any) {
      console.error("[BuyerAgent] GPT error:", err.message);
      return null;
    }
  }
}

export const buyerAgent = new BuyerReplyAgent();
buyerAgent.start();

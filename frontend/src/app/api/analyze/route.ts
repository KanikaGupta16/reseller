import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const MAX_FOLLOW_UPS = 2

const SYSTEM_PROMPT = `You are a resale-item analyst. The user uploaded a photo of something they want to sell on Depop, Facebook Marketplace, or eBay.

Your job: examine the image and extract structured info. If you can't tell the EXACT model/version, you MUST ask the user — guessing wrong wastes their time and tanks the listing.

Always respond with ONLY a JSON object (no prose, no code fences) shaped exactly like this:
{
  "fields": {
    "name": string,            // human-friendly product name (use "<brand> <model>" if known, else best guess)
    "brand": string | null,    // brand if visible/identifiable
    "model": string | null,    // specific model name or SKU. Null if you are genuinely unsure.
    "category": string,        // e.g. "laptop", "headphones", "sneakers", "denim", "bag"
    "condition": string,       // "new" | "like new" | "good" | "fair" | "worn"
    "dimensions": string | null,
    "market_price_usd": { "low": number, "mid": number, "high": number },
    "tags": string[],          // 3-6 short searchable tags
    "notes": string            // 1-2 sentence summary of what you see + why this price
  },
  "follow_up_question": string | null,  // ONE concise question, or null only when you are fully confident
  "assistant_message": string            // short friendly message shown to the user (1-2 sentences)
}

DEFAULT BEHAVIOR: ASK. Set follow_up_question to null ONLY when one of the rare null-conditions below is true. When in any doubt — ASK.

WHEN YOU MUST ASK (set follow_up_question, do NOT just commit to a guess):
- The product has multiple generations or variants in the wild and you cannot see a printed SKU/year. This is the COMMON case. Ask even if you have a strong guess. Examples (these MUST trigger a question):
  - Sony WH-1000XM series → "Are these the XM3, XM4, or XM5? Quick tell: XM5 has a non-folding thinner headband; XM4 folds and has a thicker hinge."
  - AirPods Pro → "Are these AirPods Pro 1 (Lightning case) or Pro 2 (USB-C case)?"
  - AirPods (standard) → "Are these AirPods 2nd gen, 3rd gen, or 4th gen?"
  - MacBook Air/Pro → "Which size and chip — e.g. 13" M1, 14" M2, 15" M3?"
  - iPhone → "Which iPhone — 13, 14, 15, or 16? And Pro/Pro Max or standard?"
  - iPad → "Which iPad — Air, Pro, mini, or standard? And which generation?"
  - Asus ROG Zephyrus → "Which model — G14, G15, M16? And what year?"
  - Nike Air Force 1 → "Low, Mid, or '07?"
  - Nike Dunks → "Low or High? Retro or original?"
  - Designer bags (Coach/LV/Gucci) → confirm exact line and year if you cannot see a date code.
  - Game consoles → "PS5 disc or digital? Slim or original?"
- Condition isn't obvious from the angle shown (you only see the back/side/closed).
- Authenticity is plausibly in question for designer items.
- Size/dimension matters for pricing and isn't visible (clothing → "what size?", shoes → "US size?", furniture → "dimensions?").

Each question must:
- Be ONE sentence, friendly, AND include a hint about how the user can tell (e.g. "check the back near the hinge", "look at the case port — Lightning vs USB-C").
- Reference the most price-impactful uncertainty FIRST.

WHEN TO SET follow_up_question TO null (rare):
- The image clearly shows a printed model number, SKU sticker, or unambiguous variant-specific badging (e.g. "WH-1000XM5" printed on the headband).
- The product has only ONE variant on the market (e.g. a generic mug, a single-edition product).
- The user has already answered every material question in the conversation.
- After ${MAX_FOLLOW_UPS} user turns — do not ask more, commit to your best estimate.

Always provide a market_price_usd estimate even when asking — based on the most likely interpretation. The price range should be WIDER when you're uncertain (covering both candidate variants), and tighten after the user answers.

When you ask, the "model" field MUST be null (don't commit to a guess in the structured field while asking the user). The "name" field can use a generic form like "Sony WH-1000XM series headphones".`

type Msg = { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  try {
    const { imageUrl, messages = [] } = (await req.json()) as {
      imageUrl: string
      messages?: Msg[]
    }

    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl required' }, { status: 400 })
    }

    const userTurns = messages.filter(m => m.role === 'user').length
    const followUpsExhausted = userTurns >= MAX_FOLLOW_UPS

    const chat: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyse this item.' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ]

    if (followUpsExhausted) {
      chat.push({
        role: 'system',
        content:
          'The follow-up budget has been spent. Return your final answer with follow_up_question set to null.',
      })
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: chat,
      response_format: { type: 'json_object' },
      max_tokens: 800,
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw)

    // GPT sometimes nests follow_up_question / assistant_message inside `fields`.
    // Hoist them to the top level so the frontend can rely on a stable shape.
    const fields = parsed.fields ?? {}
    const follow_up_question =
      parsed.follow_up_question ?? fields.follow_up_question ?? null
    const assistant_message =
      parsed.assistant_message ?? fields.assistant_message ?? ''
    delete fields.follow_up_question
    delete fields.assistant_message

    const normalised = {
      fields,
      follow_up_question: followUpsExhausted ? null : follow_up_question,
      assistant_message,
    }

    return NextResponse.json(normalised)
  } catch (err) {
    console.error('[analyze] error', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

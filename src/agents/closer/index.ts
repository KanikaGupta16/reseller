import Anthropic from '@anthropic-ai/sdk'
import type { Offer, CloserResult } from '@/lib/types'

const client = new Anthropic()

export async function runCloser(
  offer: Offer,
  listingPrice: number,
  calendarContext: string
): Promise<CloserResult> {
  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 512,
    system: `You are Closer, a negotiation agent for resellers.
Your goal: get the best price while being friendly and closing fast.
You have access to the seller's calendar context for scheduling meetups.
Never accept below 80% of the listing price without explicit permission.
Be conversational — buyers are real people. Respond with valid JSON.`,
    messages: [
      {
        role: 'user',
        content: `Handle this offer:
Listing price: $${listingPrice}
Offer amount: $${offer.amount}
Buyer message: "${offer.message}"
Calendar availability: ${calendarContext}

Return JSON with: decision (accept|counter|decline), counter_amount (if countering),
response_message (the DM to send the buyer), meetup ({location, time}) if accepting.`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Closer: no JSON in response')
  return JSON.parse(jsonMatch[0]) as CloserResult
}

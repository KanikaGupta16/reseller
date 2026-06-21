import Anthropic from '@anthropic-ai/sdk'
import type { ScoutResult } from '@/lib/types'

const client = new Anthropic()

export async function runScout(itemDescription: string, images: string[]): Promise<ScoutResult> {
  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: `You are Scout, a market research agent for resellers.
Given an item description and images, you research current market prices across
Depop, Facebook Marketplace, and eBay, then return a structured pricing recommendation.
Always respond with valid JSON matching the ScoutResult schema.`,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Research pricing for this item and return JSON:
Item: ${itemDescription}

Return JSON with: recommended_price, min_price, max_price, avg_price, demand_score (0-100),
comps (array of {platform, title, price, url, sold}), reasoning (string).`,
          },
        ],
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Scout: no JSON in response')
  return JSON.parse(jsonMatch[0]) as ScoutResult
}

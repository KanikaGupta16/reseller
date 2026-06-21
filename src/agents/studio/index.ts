import Anthropic from '@anthropic-ai/sdk'
import type { ScoutResult, StudioResult } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'

const client = new Anthropic()

export async function runStudio(
  itemDescription: string,
  scoutResult: ScoutResult,
  listingId: string
): Promise<StudioResult> {
  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: `You are Studio, a content creation agent for resellers.
You write compelling, platform-optimised listing copy for Depop and Facebook Marketplace.
Titles are concise (under 60 chars). Descriptions are honest, specific, and conversion-focused.
Tags are relevant and searchable. Respond with valid JSON.`,
    messages: [
      {
        role: 'user',
        content: `Create listing content for:
Item: ${itemDescription}
Recommended price: $${scoutResult.recommended_price}
Demand score: ${scoutResult.demand_score}/100

Return JSON with: title (string), description (string), tags (string[]).`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Studio: no JSON in response')
  const content = JSON.parse(jsonMatch[0])

  const result: StudioResult = { ...content, listing_id: listingId }

  // Persist to Supabase
  const supabase = await createClient()
  await supabase
    .from('listings')
    .update({
      title: result.title,
      description: result.description,
      tags: result.tags,
      status: 'draft',
    })
    .eq('id', listingId)

  return result
}

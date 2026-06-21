import { NextRequest, NextResponse } from 'next/server'
import { runStudio } from '@/agents/studio'

export async function POST(req: NextRequest) {
  try {
    const { itemDescription, scoutResult, listingId } = await req.json()
    if (!itemDescription || !scoutResult || !listingId) {
      return NextResponse.json({ error: 'itemDescription, scoutResult, listingId required' }, { status: 400 })
    }
    const result = await runStudio(itemDescription, scoutResult, listingId)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { runCloser } from '@/agents/closer'

export async function POST(req: NextRequest) {
  try {
    const { offer, listingPrice, calendarContext = 'Available weekdays 5–8pm, weekends 10am–4pm' } = await req.json()
    if (!offer || !listingPrice) {
      return NextResponse.json({ error: 'offer and listingPrice required' }, { status: 400 })
    }
    const result = await runCloser(offer, listingPrice, calendarContext)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

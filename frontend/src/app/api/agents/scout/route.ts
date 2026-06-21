import { NextRequest, NextResponse } from 'next/server'
import { runScout } from '@/agents/scout'

export async function POST(req: NextRequest) {
  try {
    const { itemDescription, images = [] } = await req.json()
    if (!itemDescription) {
      return NextResponse.json({ error: 'itemDescription required' }, { status: 400 })
    }
    const result = await runScout(itemDescription, images)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

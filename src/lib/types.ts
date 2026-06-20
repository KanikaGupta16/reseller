export type AgentStatus = 'idle' | 'running' | 'done' | 'error'

export interface Listing {
  id: string
  user_id: string
  title: string
  description: string
  price: number
  images: string[]
  video_url?: string
  platform: 'depop' | 'facebook' | 'ebay' | 'vinted'
  status: 'draft' | 'posted' | 'sold' | 'archived'
  created_at: string
  updated_at: string
}

export interface ScoutResult {
  recommended_price: number
  min_price: number
  max_price: number
  avg_price: number
  demand_score: number  // 0–100
  comps: Comp[]
  reasoning: string
}

export interface Comp {
  platform: string
  title: string
  price: number
  url: string
  sold: boolean
}

export interface StudioResult {
  title: string
  description: string
  tags: string[]
  video_url?: string
  listing_id: string
}

export interface Offer {
  id: string
  listing_id: string
  platform: string
  buyer_handle: string
  amount: number
  message: string
  received_at: string
  status: 'pending' | 'countered' | 'accepted' | 'declined'
}

export interface CloserResult {
  decision: 'accept' | 'counter' | 'decline'
  counter_amount?: number
  response_message: string
  meetup?: {
    location: string
    time: string
  }
}

'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export default function ActiveTab() {
  const [listings, setListings] = useState<any[]>([])

  useEffect(() => {
    supabase.from('items').select('*').not('listed_on', 'is', null).order('created_at', { ascending: false })
      .then(({ data }) => setListings(data || []))
  }, [])

  if (!listings.length) return <div className="db-section"><p className="db-empty">No active listings yet.</p></div>

  return (
    <div className="db-section">
      <h3 className="db-subtitle" style={{ marginBottom: '1.5rem' }}>active listings</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {listings.map(item => (
          <div key={item.id} className="db-card db-card--row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {item.image_url && <img src={item.image_url} alt={item.title} style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />}
            <div style={{ flex: 1 }}>
              <div className="db-card-title">{item.title}</div>
              <div className="db-tags">
                {item.brand && <span className="db-tag">{item.brand}</span>}
                <span className="db-tag">{item.category}</span>
                <span className="db-tag db-tag--accent">{item.condition}</span>
                {(item.listed_on || []).map((p: string) => (
                  <span key={p} className="db-tag db-tag--fb">📘 {p}</span>
                ))}
              </div>
              {item.listing_price && <div style={{ fontSize: '1.375rem', fontWeight: 900, letterSpacing: '-0.03em', margin: '0.375rem 0' }}>${item.listing_price}</div>}
              {item.location && <div style={{ fontSize: '0.75rem', color: 'var(--db-muted)' }}>📍 {item.location}</div>}
              {item.description && <p style={{ fontSize: '0.8rem', color: 'var(--db-muted)', marginTop: '0.375rem' }}>{item.description.slice(0, 150)}{item.description.length > 150 ? '...' : ''}</p>}
              {item.meetup_preferences?.length > 0 && (
                <div className="db-tags" style={{ marginTop: '0.5rem' }}>
                  {item.meetup_preferences.map((m: string) => <span key={m} className="db-tag">🤝 {m}</span>)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

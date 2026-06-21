'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Job { id: string; status: string; step: string; progress: number; result?: any; error?: string; sources_status?: any; comps?: any[] }

export default function PricingTab() {
  const [items, setItems] = useState<any[]>([])
  const [jobs, setJobs] = useState<Record<string, Job>>({})
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('items').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setItems(data || []))
  }, [])

  useEffect(() => {
    if (!items.length) return
    const poll = async () => {
      const next: Record<string, Job> = {}
      await Promise.all(items.map(async item => {
        try {
          const r = await fetch(`${API}/api/research/item/${item.id}`)
          if (r.ok) next[item.id] = await r.json()
        } catch {}
      }))
      setJobs(next)
    }
    poll()
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [items])

  const startResearch = async (itemId: string) => {
    await fetch(`${API}/api/research`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId }) })
    setJobs(j => ({ ...j, [itemId]: { id: '', status: 'running', step: 'starting', progress: 0 } }))
  }

  const confidenceColor = (c: string) => c === 'high' ? 'var(--pink-2)' : c === 'medium' ? 'var(--yellow)' : '#888'

  return (
    <div className="db-section">
      <h3 className="db-subtitle" style={{ marginBottom: '1.5rem' }}>pricing research</h3>
      {items.length === 0 && <p className="db-empty">No items yet — upload something first.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {items.map(item => {
          const job = jobs[item.id]
          const isExp = expanded === item.id
          return (
            <div key={item.id} className="db-card db-card--row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {item.image_url && <img src={item.image_url} alt={item.title} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />}
              <div style={{ flex: 1 }}>
                <div className="db-card-title">{item.title}</div>
                <div className="db-tags">
                  {item.brand && <span className="db-tag">{item.brand}</span>}
                  <span className="db-tag">{item.category}</span>
                  <span className="db-tag db-tag--accent">{item.condition}</span>
                </div>
                {!job && (
                  <button className="db-pill db-pill--sm" style={{ marginTop: '0.5rem' }} onClick={() => startResearch(item.id)}>
                    Start Research
                  </button>
                )}
                {job?.status === 'running' && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div className="db-progress-bar">
                      <div className="db-progress-fill" style={{ width: `${job.progress || 0}%` }} />
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--db-muted)', marginTop: '0.25rem' }}>{job.step} · {job.progress}%</div>
                  </div>
                )}
                {job?.status === 'complete' && job.result && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <span style={{ fontSize: '1.75rem', fontWeight: 900, letterSpacing: '-0.03em' }}>${job.result.suggested_price}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--db-muted)', marginLeft: '0.5rem' }}>
                      ${job.result.price_range?.min}–${job.result.price_range?.max}
                    </span>
                    {job.result.confidence && (
                      <span style={{ marginLeft: '0.75rem', fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: confidenceColor(job.result.confidence) }}>
                        {job.result.confidence} confidence
                      </span>
                    )}
                    <button className="db-pill db-pill--sm db-pill--outline" style={{ marginLeft: '1rem' }} onClick={() => setExpanded(isExp ? null : item.id)}>
                      {isExp ? 'Hide' : 'Details'} {isExp ? '▲' : '▼'}
                    </button>
                    {isExp && (
                      <div style={{ marginTop: '1rem' }}>
                        {job.result.reasoning && <p style={{ fontSize: '0.8rem', color: 'var(--db-muted)', fontStyle: 'italic', marginBottom: '0.75rem' }}>{job.result.reasoning}</p>}
                        {job.comps && job.comps.length > 0 && (
                          <div className="db-table-wrap">
                            <table className="db-table">
                              <thead><tr><th>Title</th><th>Price</th><th>Source</th><th>Condition</th></tr></thead>
                              <tbody>
                                {job.comps.slice(0, 8).map((c: any, i: number) => (
                                  <tr key={i}>
                                    <td>{c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--pink-2)' }}>{c.title}</a> : c.title}</td>
                                    <td style={{ fontWeight: 700 }}>${c.price}</td>
                                    <td>{c.source}</td>
                                    <td>{c.condition}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {job?.status === 'failed' && (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                    <span className="db-error">Research failed</span>
                    <button className="db-pill db-pill--sm" onClick={() => startResearch(item.id)}>Retry</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

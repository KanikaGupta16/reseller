'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const CATEGORIES = ['Clothing','Shoes','Bags','Accessories','Electronics','Books','Home','Furniture','Toys','Sports','Art','Other']
const CONDITIONS = ['new','like new','good','fair']
const PUBLISH_STEPS = ['Downloading photos','Starting browser','Navigating to Marketplace','Uploading photos','Filling form','Publishing','Verifying']

export default function ListingTab() {
  const [items, setItems] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [form, setForm] = useState({ title: '', price: '', category: '', condition: '', location: '', description: '', meetup: [] as string[] })
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishStep, setPublishStep] = useState('')
  const [publishResult, setPublishResult] = useState<{ success: boolean; message: string } | null>(null)
  const [showJson, setShowJson] = useState(false)
  const pollRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    supabase.from('items').select('*').order('created_at', { ascending: false }).then(({ data }) => setItems(data || []))
  }, [])

  const selectItem = (item: any) => {
    setSelected(item)
    setForm({ title: item.title || '', price: item.listing_price || '', category: item.category || '', condition: item.condition || '', location: item.location || '', description: item.description || '', meetup: item.meetup_preferences || [] })
    setPublishResult(null)
  }

  const save = async () => {
    if (!selected) return
    setSaving(true)
    await fetch(`${API}/api/listing/build`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: selected.id, ...form }) })
    setSaving(false)
  }

  const publish = async () => {
    if (!selected) return
    setPublishing(true); setPublishResult(null); setPublishStep(PUBLISH_STEPS[0])
    await fetch(`${API}/api/publish/facebook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: selected.id }) })
    let stepIdx = 0
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/publish/facebook/${selected.id}`)
        const data = await r.json()
        if (data.step) { stepIdx = Math.min(stepIdx + 1, PUBLISH_STEPS.length - 1); setPublishStep(PUBLISH_STEPS[stepIdx]) }
        if (data.status === 'done' || data.status === 'failed') {
          clearInterval(pollRef.current); setPublishing(false)
          setPublishResult(data.result || { success: data.status === 'done', message: data.status === 'failed' ? 'Failed to publish' : 'Published!' })
        }
      } catch { clearInterval(pollRef.current); setPublishing(false) }
    }, 3000)
  }

  const toggleMeetup = (v: string) => setForm(f => ({ ...f, meetup: f.meetup.includes(v) ? f.meetup.filter(m => m !== v) : [...f.meetup, v] }))

  return (
    <div className="db-section">
      <h3 className="db-subtitle" style={{ marginBottom: '1.5rem' }}>listing builder</h3>
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1.5fr' : '1fr', gap: '1.5rem' }}>
        {/* Item grid */}
        <div>
          <div className="db-card-grid db-card-grid--sm">
            {items.map(item => (
              <div key={item.id} className={`db-card db-card--selectable ${selected?.id === item.id ? 'db-card--selected' : ''}`} onClick={() => selectItem(item)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {item.image_url && <img src={item.image_url} alt={item.title} className="db-card-img db-card-img--sm" />}
                <div className="db-card-body">
                  <div className="db-card-title" style={{ fontSize: '0.8rem' }}>{item.title}</div>
                  <div className="db-tags">
                    <span className="db-tag">{item.category}</span>
                    {item.listing_price && <span className="db-tag db-tag--accent">${item.listing_price}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        {selected && (
          <div className="db-card">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              {/* Left: form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <div className="db-field"><label>Title</label><input className="db-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
                <div className="db-field"><label>Price ($)</label><input className="db-input" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></div>
                <div className="db-field"><label>Category</label>
                  <select className="db-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="db-field"><label>Condition</label>
                  <select className="db-input" value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}>
                    {CONDITIONS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="db-field"><label>Location</label><input className="db-input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>
                <div className="db-field"><label>Description</label><textarea className="db-input db-textarea" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
                <div className="db-field">
                  <label>Meetup</label>
                  {['door pickup','door dropoff','public meetup'].map(v => (
                    <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                      <input type="checkbox" checked={form.meetup.includes(v)} onChange={() => toggleMeetup(v)} />{v}
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  <button className="db-pill db-pill--sm" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save listing'}</button>
                  <button className="db-pill db-pill--sm db-pill--outline" onClick={() => setShowJson(!showJson)}>JSON</button>
                  <button className="db-pill db-pill--sm db-pill--fb" onClick={publish} disabled={publishing}>{publishing ? publishStep + '...' : 'Publish to Facebook'}</button>
                </div>
                {publishResult && (
                  <div className={`db-result ${publishResult.success ? 'db-result--ok' : 'db-result--err'}`}>{publishResult.message}</div>
                )}
              </div>
              {/* Right: images */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {selected.image_url && (
                  <div>
                    <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--db-muted)', marginBottom: '0.375rem' }}>Original</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selected.image_url} alt="original" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10 }} />
                  </div>
                )}
                {selected.media_urls?.generated && (
                  <div>
                    <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--db-muted)', marginBottom: '0.375rem' }}>AI Generated</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selected.media_urls.generated} alt="generated" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10 }} />
                  </div>
                )}
                {showJson && <pre style={{ fontSize: '0.65rem', background: 'var(--db-surface)', padding: '0.75rem', borderRadius: 8, overflow: 'auto', maxHeight: 200 }}>{JSON.stringify(form, null, 2)}</pre>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

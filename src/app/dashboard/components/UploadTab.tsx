'use client'
import { useCallback, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface AnalysedItem {
  file: File
  preview: string
  title: string
  brand: string
  model: string
  category: string
  condition: string
  description: string
  tags: string[]
  saved?: boolean
  saving?: boolean
  error?: string
}

export default function UploadTab({ onSaved }: { onSaved: () => void }) {
  const [items, setItems] = useState<AnalysedItem[]>([])
  const [analysing, setAnalysing] = useState(false)
  const [drag, setDrag] = useState(false)
  const [dbItems, setDbItems] = useState<any[]>([])
  const [loadingDb, setLoadingDb] = useState(false)

  const loadInventory = useCallback(async () => {
    setLoadingDb(true)
    const { data } = await supabase.from('items').select('*').order('created_at', { ascending: false })
    setDbItems(data || [])
    setLoadingDb(false)
  }, [])

  const analyseFiles = useCallback(async (files: File[]) => {
    setAnalysing(true)
    const results: AnalysedItem[] = []
    for (const file of files) {
      const preview = URL.createObjectURL(file)
      try {
        const b64 = await new Promise<string>((res, rej) => {
          const r = new FileReader()
          r.onload = e => res((e.target?.result as string).split(',')[1])
          r.onerror = rej
          r.readAsDataURL(file)
        })
        const resp = await fetch('/api/vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ b64, mimeType: file.type }),
        })
        const data = await resp.json()
        results.push({ file, preview, ...data })
      } catch {
        results.push({ file, preview, title: file.name, brand: '', model: '', category: 'other', condition: 'good', description: '', tags: [], error: 'Analysis failed' })
      }
    }
    setItems(prev => [...prev, ...results])
    setAnalysing(false)
  }, [])

  const saveItem = useCallback(async (idx: number) => {
    const item = items[idx]
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, saving: true } : it))
    try {
      const path = `${Date.now()}-${item.file.name}`
      await supabase.storage.from('product-images').upload(path, item.file)
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path)
      const { data: row } = await supabase.from('items').insert({
        image_url: publicUrl, title: item.title, brand: item.brand,
        model: item.model, category: item.category, condition: item.condition,
        description: item.description, tags: item.tags,
      }).select().single()
      // trigger background jobs
      fetch(`${API}/api/research`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: row.id }) }).catch(() => {})
      fetch(`${API}/api/media/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: row.id }) }).catch(() => {})
      setItems(prev => prev.map((it, i) => i === idx ? { ...it, saving: false, saved: true } : it))
      onSaved()
    } catch {
      setItems(prev => prev.map((it, i) => i === idx ? { ...it, saving: false, error: 'Save failed' } : it))
    }
  }, [items, onSaved])

  const saveAll = () => items.forEach((_, i) => !items[i].saved && saveItem(i))

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    analyseFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')))
  }, [analyseFiles])

  return (
    <div className="db-section">
      {/* Drop zone */}
      <div
        className={`db-dropzone ${drag ? 'db-dropzone--over' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => document.getElementById('db-file-input')?.click()}
      >
        <span className="db-dropzone-icon">📷</span>
        <span className="db-dropzone-label">{analysing ? 'Analysing with GPT-4o...' : 'Drop photos here or click to upload'}</span>
        <span className="db-dropzone-hint">jpg · png · webp · avif</span>
        <input id="db-file-input" type="file" multiple accept="image/*" style={{ display: 'none' }}
          onChange={e => analyseFiles(Array.from(e.target.files || []))} />
      </div>

      {/* Analysed results */}
      {items.length > 0 && (
        <div>
          <div className="db-row-between" style={{ marginBottom: '1rem' }}>
            <h3 className="db-subtitle">{items.length} item{items.length !== 1 ? 's' : ''} analysed</h3>
            <button className="db-pill" onClick={saveAll}>Save all</button>
          </div>
          <div className="db-card-grid">
            {items.map((item, i) => (
              <div key={i} className="db-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.preview} alt={item.title} className="db-card-img" />
                <div className="db-card-body">
                  <div className="db-card-title">{item.title}</div>
                  <div className="db-tags">
                    {item.brand && <span className="db-tag">{item.brand}</span>}
                    {item.category && <span className="db-tag">{item.category}</span>}
                    {item.condition && <span className="db-tag db-tag--accent">{item.condition}</span>}
                  </div>
                  <p className="db-card-desc">{item.description}</p>
                  {item.error && <p className="db-error">{item.error}</p>}
                  <button
                    className={`db-pill db-pill--sm ${item.saved ? 'db-pill--success' : ''}`}
                    onClick={() => saveItem(i)}
                    disabled={item.saving || item.saved}
                  >
                    {item.saved ? '✓ Saved' : item.saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inventory table */}
      <div>
        <div className="db-row-between" style={{ marginBottom: '1rem', marginTop: '2rem' }}>
          <h3 className="db-subtitle">inventory</h3>
          <button className="db-pill db-pill--outline" onClick={loadInventory}>
            {loadingDb ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        {dbItems.length === 0 ? (
          <p className="db-empty" onClick={loadInventory} style={{ cursor: 'pointer' }}>Click refresh to load inventory</p>
        ) : (
          <div className="db-table-wrap">
            <table className="db-table">
              <thead><tr>
                <th>Image</th><th>Title</th><th>Brand</th><th>Category</th><th>Condition</th><th>Date</th>
              </tr></thead>
              <tbody>
                {dbItems.map(item => (
                  <tr key={item.id}>
                    <td>{item.image_url && <img src={item.image_url} alt={item.title} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }} />}</td>
                    <td><strong>{item.title}</strong>{item.model && <div style={{ fontSize: '0.72rem', color: 'var(--db-muted)' }}>{item.model}</div>}</td>
                    <td>{item.brand}</td>
                    <td>{item.category}</td>
                    <td><span className="db-tag db-tag--accent">{item.condition}</span></td>
                    <td style={{ fontSize: '0.72rem', color: 'var(--db-muted)' }}>{new Date(item.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

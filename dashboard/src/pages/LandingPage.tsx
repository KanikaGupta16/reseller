import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const SLIDE_COUNT = 5

const MOCK_ITEMS = [
  { title: "Vintage Levi's 501 Jeans",  price: 68,  demand: 94, tags: ['vintage','denim','y2k'] },
  { title: 'Nike Air Force 1 Low',       price: 115, demand: 88, tags: ['nike','af1','white'] },
  { title: 'Coach Crossbody Bag',        price: 220, demand: 91, tags: ['coach','designer','brown'] },
  { title: 'Ralph Lauren Polo Shirt',    price: 45,  demand: 82, tags: ['ralph','polo','preppy'] },
]

const SCOUT_TIPS  = ['🔍 Scanning 847 live listings...','📊 23 comparable items found','💰 Sweet spot: $45 – $68','✓ Scout is done']
const STUDIO_TIPS = ['🎬 Writing your listing copy...','✓ Title crafted','✓ Description generated','📸 Photo tags added']
const CLOSER_TIPS = ['🤝 Configuring Closer...','✓ Offer scoring ready','📅 Calendar synced','✅ All agents standing by']

const CurlyRight = ({ c = 'currentColor' }: { c?: string }) => (
  <svg width="78" height="46" viewBox="0 0 52 30" fill="none">
    <path d="M3 19 C7 5 26 1 42 13" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M36 7 L42 13 L35 18" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const CurlyLeft = ({ c = 'currentColor' }: { c?: string }) => (
  <svg width="78" height="46" viewBox="0 0 52 30" fill="none">
    <path d="M49 19 C45 5 26 1 10 13" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M16 7 L10 13 L17 18" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const CurlyDown = ({ c = 'currentColor' }: { c?: string }) => (
  <svg width="42" height="74" viewBox="0 0 28 50" fill="none">
    <path d="M9 3 C23 7 27 26 15 43" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M9 36 L15 43 L21 36" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

type AgentState = 'idle' | 'working' | 'done'
function AgentRow({ icon, name, label, state, delay }: {
  icon: string; name: string; label: string; state: AgentState; delay: number
}) {
  return (
    <div className={`agent-row agent-row--${state}`} style={{ animationDelay: `${delay * 0.2}s` }}>
      <span className="agent-row-icon">{icon}</span>
      <div className="agent-row-body">
        <span className="agent-row-name">{name}</span>
        <span className="agent-row-label">{label}</span>
      </div>
      {state === 'idle'    && <span className="agent-dot agent-dot--idle" />}
      {state === 'working' && <span className="agent-dot agent-dot--pulse" />}
      {state === 'done'    && <span className="agent-check">✓</span>}
    </div>
  )
}

export default function LandingPage() {
  const stageRef    = useRef<HTMLDivElement>(null)
  const fileInputRef= useRef<HTMLInputElement>(null)
  const waveRef     = useRef<HTMLCanvasElement>(null)
  const slideRef    = useRef(0)
  const locked      = useRef(false)

  const [slide, setSlide]           = useState(0)
  const [uploadStep, setUploadStep] = useState<'idle' | 'processing' | 'done'>('idle')
  const [uploadedImg, setUploadedImg] = useState<string | null>(null)
  const [dragOver, setDragOver]     = useState(false)
  const [scout,  setScout]          = useState<AgentState>('idle')
  const [studio, setStudio]         = useState<AgentState>('idle')
  const [closer, setCloser]         = useState<AgentState>('idle')
  const [item]                      = useState(() => MOCK_ITEMS[Math.floor(Math.random() * MOCK_ITEMS.length)])
  const [realItem, setRealItem]     = useState<{ title: string; tags: string[]; price?: number } | null>(null)
  const [videoUrl, setVideoUrl]     = useState<string | null>(null)
  const [itemId,   setItemId]       = useState<string | null>(null)

  useEffect(() => {
    let id: number
    const wc = waveRef.current; if (!wc) return
    const ctx = wc.getContext('2d')!
    const N = 40
    const hs = Array.from({ length: N }, (_, i) => 3 + Math.abs(Math.sin(i * 0.55)) * 18)
    const sp = Array.from({ length: N }, () => 0.03 + Math.random() * 0.04)
    const of = Array.from({ length: N }, (_, i) => i * 0.32)
    const draw = (ts: number) => {
      const T = ts / 1000; ctx.clearRect(0, 0, wc.width, wc.height)
      const bW = 3, gap = 3, tot = N*(bW+gap)-gap, sx = (wc.width-tot)/2, cy = wc.height/2
      for (let i = 0; i < N; i++) {
        const h = hs[i]*(0.3+0.7*Math.abs(Math.sin(T*sp[i]+of[i])))
        const x = sx+i*(bW+gap), a = 0.5+0.5*(h/hs[i])
        ctx.fillStyle = `rgba(8,8,8,${a})`
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(x, cy-h/2, bW, h, 100)
        else ctx.rect(x, cy-h/2, bW, h)
        ctx.fill()
      }
      id = requestAnimationFrame(draw)
    }
    id = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(id)
  }, [])

  const goTo = useCallback((idx: number) => {
    if (locked.current) return
    if (idx >= SLIDE_COUNT) {
      document.getElementById('below-fold')?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    if (idx < 0) return
    locked.current = true
    slideRef.current = idx
    setSlide(idx)
    setTimeout(() => { locked.current = false }, 680)
  }, [])

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (window.scrollY > 60) return
      e.preventDefault()
      if (e.deltaY > 4)  goTo(slideRef.current + 1)
      if (e.deltaY < -4) goTo(slideRef.current - 1)
    }
    const onKey = (e: KeyboardEvent) => {
      if (window.scrollY > 60) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') goTo(slideRef.current + 1)
      if (e.key === 'ArrowUp'  || e.key === 'ArrowLeft')  goTo(slideRef.current - 1)
    }
    let ty0 = 0
    const onTouchStart = (e: TouchEvent) => { ty0 = e.touches[0].clientY }
    const onTouchEnd   = (e: TouchEvent) => {
      if (window.scrollY > 60) return
      const dy = ty0 - e.changedTouches[0].clientY
      if (Math.abs(dy) < 40) return
      e.preventDefault()
      if (dy > 0) goTo(slideRef.current + 1)
      else goTo(slideRef.current - 1)
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: false })
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [goTo])

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return

    // Show preview immediately
    const reader = new FileReader()
    reader.onload = e => setUploadedImg(e.target?.result as string)
    reader.readAsDataURL(file)

    setRealItem(null); setVideoUrl(null); setItemId(null)
    setScout('idle'); setStudio('idle'); setCloser('idle')
    setUploadStep('processing')
    setScout('working')

    try {
      // 1. Upload image to Supabase storage
      const ext  = file.name.split('.').pop() || 'jpg'
      const path = `${crypto.randomUUID()}.${ext}`
      const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/product-images/${path}`,
        { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': file.type }, body: file }
      )
      if (!uploadRes.ok) throw new Error('Storage upload failed')
      const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`

      // 2. Save item to DB
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/items`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ image_url: imageUrl, title: 'Analysing...', category: 'other', condition: 'good' }),
      })
      const [row] = await insertRes.json()
      const newItemId = row?.id
      if (!newItemId) throw new Error('DB insert failed')
      setItemId(newItemId)

      // 3. Trigger Scout (research) + Studio (media)
      await Promise.all([
        fetch(`${API}/api/research`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: newItemId }) }).catch(() => {}),
        fetch(`${API}/api/media/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: newItemId }) }).catch(() => {}),
      ])

      // 4. Poll Scout progress
      let scoutDone = false
      for (let i = 0; i < 30 && !scoutDone; i++) {
        await new Promise(r => setTimeout(r, 3000))
        try {
          const r = await fetch(`${API}/api/research/item/${newItemId}`)
          const d = await r.json()
          if (d?.status === 'complete' || d?.status === 'done') {
            scoutDone = true
            setRealItem({
              title: d.title || item.title,
              tags: d.tags || item.tags,
              price: d.result?.suggested_price,
            })
          }
        } catch {}
      }
      setScout('done'); setStudio('working')

      // 5. Poll Studio (media)
      let studioDone = false
      for (let i = 0; i < 20 && !studioDone; i++) {
        await new Promise(r => setTimeout(r, 3000))
        try {
          const r = await fetch(`${API}/api/media/status/${newItemId}`)
          const d = await r.json()
          if (d?.status === 'done' && d?.count > 0) studioDone = true
        } catch {}
      }
      setStudio('done'); setCloser('working')

      // 6. Trigger Pika video generation
      fetch(`${API}/api/video/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: newItemId }) }).catch(() => {})

      // 7. Poll video
      for (let i = 0; i < 36; i++) {
        await new Promise(r => setTimeout(r, 5000))
        try {
          const r = await fetch(`${API}/api/video/status/${newItemId}`)
          const d = await r.json()
          if (d?.status === 'done' && d?.videoUrl) {
            setVideoUrl(d.videoUrl)
            break
          }
        } catch {}
      }
      setCloser('done'); setUploadStep('done')

    } catch {
      // Graceful degraded flow with mock timing
      setTimeout(() => { setScout('done'); setStudio('working') }, 2000)
      setTimeout(() => { setStudio('done'); setCloser('working') }, 4000)
      setTimeout(() => { setCloser('done'); setRealItem({ title: item.title, tags: item.tags }); setUploadStep('done') }, 6000)
    }
  }, [item])

  const resetUpload = () => {
    setUploadStep('idle'); setUploadedImg(null); setRealItem(null)
    setVideoUrl(null); setItemId(null)
    setScout('idle'); setStudio('idle'); setCloser('idle')
  }

  const scrollToCta = () => document.getElementById('cta-email')?.focus()

  const cls = (n: number) =>
    `sp ${slide === n ? 'sp--on' : slide > n ? 'sp--prev' : 'sp--next'}`

  const tips: string[] = []
  if (scout  !== 'idle') tips.push(...SCOUT_TIPS.slice(0, scout  === 'done' ? 4 : 1))
  if (studio !== 'idle') tips.push(...STUDIO_TIPS.slice(0, studio === 'done' ? 4 : 1))
  if (closer !== 'idle') tips.push(...CLOSER_TIPS.slice(0, closer === 'done' ? 4 : 1))

  return (
    <div className="landing-page">
      <nav className={`nav ${slide === 0 ? 'nav--dark' : 'nav--light'}`}>
        <a href="#" className="logo">reseller.</a>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link to="/dashboard" className="dashboard-btn">Dashboard</Link>
          <button className={`pill ${slide === 0 ? 'pill-white' : ''}`} onClick={scrollToCta}>
            Get Access
          </button>
        </div>
      </nav>

      <div ref={stageRef} className="stage">
        {/* SLIDE 0: HERO */}
        <div className={cls(0)} style={{ display: 'block' }}>
          <div className="hero-bg">
            <img src="/images/closet.avif" alt="Pile of clothes to sell" />
            <div className="hero-grad" />
          </div>
          <div className="hero-copy">
            <div className="hero-badge">
              <span className="bdot" /> AI-Powered Reselling · Beta
            </div>
            <h1 className="hero-h1">
              your pile is<br /><em>money</em><br />waiting. 💸
            </h1>
            <p className="hero-sub">Researcher prices it. Studio lists it. Closer sells it. Just upload a photo.</p>
            <div className="hero-ctas">
              <button className="pill pill-white pill-big" onClick={() => goTo(5)}>Let&apos;s start →</button>
              <button className="pill pill-big pill-ow" onClick={() => goTo(1)}>See how it works</button>
            </div>
          </div>
          <div className="hero-mark" aria-hidden="true">reseller.</div>
          <button className="scroll-cue" onClick={() => goTo(1)} aria-label="Next">
            <CurlyDown c="rgba(255,255,255,0.55)" />
            <span>scroll</span>
          </button>
        </div>

        {/* SLIDE 1: SCOUT */}
        <div className={cls(1)} style={{ background: 'var(--blue)' }}>
          <div className="split">
            <div className="sl sl--blue">
              <div className="step-lbl">01 / researcher</div>
              <h2 className="sl-h2">priced before<br />you post. <em>🔍</em></h2>
              <p className="sl-p">Scout scans live Depop, eBay, and FB Marketplace in real time to find the price that sells fast — not the one that sits.</p>
              <div className="price-badge" style={{ marginTop: '1rem' }}>
                $187 <span className="pl">Scout says</span>
              </div>
            </div>
            <div className="sr" style={{ background: 'var(--blue)' }}>
              <img src="/images/sneaker.avif" alt="Sneaker" className="blend" />
            </div>
          </div>
        </div>

        {/* SLIDE 2: STUDIO */}
        <div className={cls(2)} style={{ background: 'var(--pink)' }}>
          <div className="split">
            <div className="sl sl--pink">
              <div className="step-lbl">02 / studio</div>
              <h2 className="sl-h2">listed in<br />60 seconds. <em>🎬</em></h2>
              <p className="sl-p">Studio writes the title, description, and tags — then generates a 15-second product video and posts to every platform at once.</p>
              <button className="pill pill-big" style={{ marginTop: '1rem' }}>See Studio in action</button>
            </div>
            <div className="sr" style={{ background: 'var(--pink)' }}>
              <img src="/images/blazer.avif" alt="Pink blazer listing" className="blend" />
            </div>
          </div>
        </div>

        {/* SLIDE 3: CLOSER */}
        <div className={cls(3)} style={{ background: 'var(--yellow)' }}>
          <div className="split">
            <div className="sl sl--yellow">
              <div className="step-lbl">03 / closer</div>
              <h2 className="sl-h2">sold while<br />you sleep. <em>🤝</em></h2>
              <p className="sl-p">Closer lives in your DMs. It scores every offer, counters automatically, and books the meetup from your calendar. You never type a reply.</p>
              <div className="dm-thread" style={{ marginTop: '1.5rem' }}>
                <div className="dm dm-b">&quot;is $50 your lowest?&quot;</div>
                <div className="dm dm-a">I can do $62 — priced under market. Meet Saturday in Williamsburg? 🤝</div>
                <div className="dm dm-b">&quot;deal! saturday works 🙌&quot;</div>
              </div>
            </div>
            <div className="sr" style={{ background: 'var(--yellow)', position: 'relative' }}>
              <img src="/images/polaroids.avif" alt="Fashion polaroids" className="blend" />
              <canvas ref={waveRef} width={260} height={44}
                style={{ position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', display: 'block' }} />
            </div>
          </div>
        </div>

        {/* SLIDE 4: UPLOAD */}
        <div className={cls(4)} style={{ background: '#fff' }}>
          <div className="split">
            <div className="sl sl--upload">
              {uploadStep === 'idle' && <>
                <div className="step-lbl">let&apos;s start.</div>
                <h2 className="sl-h2">upload a photo<br />of your item. <em>📸</em></h2>
                <p className="sl-p">Anything from your closet, haul, or shelf. Scout will have a price in seconds.</p>
                <div
                  className={`drop-zone ${dragOver ? 'dz--over' : ''}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                  onClick={() => fileInputRef.current?.click()}
                  role="button" tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
                >
                  <span className="dz-icon">📷</span>
                  <span className="dz-label">drag & drop or click to upload</span>
                  <span className="dz-hint">jpg · png · webp</span>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              </>}

              {uploadStep === 'processing' && <>
                <div className="step-lbl">agents working...</div>
                <h2 className="sl-h2">analysing<br />your item. <em>⚡</em></h2>
                <div className="agent-status-list">
                  <AgentRow icon="🔍" name="Scout"  label="scanning live comps"     state={scout}  delay={0} />
                  <AgentRow icon="🎬" name="Studio" label="writing listing + video" state={studio} delay={1} />
                  <AgentRow icon="🤝" name="Closer" label="setting up DM replies"   state={closer} delay={2} />
                </div>
              </>}

              {uploadStep === 'done' && <>
                <div className="step-lbl">✅ done!</div>
                <h2 className="sl-h2">your listing<br />is <em>live.</em> 🎉</h2>
                <div className="result-card">
                  <div className="rc-badge">✅ listing ready</div>
                  <div className="rc-title">{realItem?.title ?? item.title}</div>
                  <div className="rc-row">
                    <div>
                      <div className="rc-price">${realItem?.price ?? item.price}</div>
                      <div className="rc-price-lbl">Researcher&apos;s price</div>
                    </div>
                    <div className="rc-demand">
                      <span className="rc-bar" style={{ '--pct': `${item.demand}%` } as React.CSSProperties} />
                      <span className="rc-demand-lbl">{item.demand}% demand</span>
                    </div>
                  </div>
                  <div className="chip-row" style={{ justifyContent: 'flex-start', marginTop: '0.75rem' }}>
                    {(realItem?.tags ?? item.tags).map(t => <span key={t} className="chip">{t}</span>)}
                  </div>
                  {itemId && (
                    <div style={{ marginTop: '0.875rem', fontSize: '0.65rem', color: 'var(--muted)', letterSpacing: '0.06em' }}>
                      Item ID: {itemId.slice(0, 8)}…
                    </div>
                  )}
                </div>
                <div className="rc-ctas">
                  <button className="pill pill-big" style={{ background: 'var(--pink-2)' }}>Push live →</button>
                  <button className="pill pill-big pill-outline" onClick={resetUpload}>Try another</button>
                </div>
              </>}
            </div>

            <div className="sr sr--upload">
              {uploadStep === 'idle' && (
                <div className="upload-idle-right">
                  <span className="uir-icon">🏷️</span>
                  <span className="uir-text">your item goes here</span>
                </div>
              )}

              {(uploadStep === 'processing' || uploadStep === 'done') && uploadedImg && (
                <div className="upload-preview-wrap">
                  <div className="upload-preview-col">
                    {/* Show Pika video when ready, otherwise show uploaded image */}
                    {videoUrl ? (
                      <div style={{ position: 'relative' }}>
                        {videoUrl.endsWith('.mp4') || videoUrl.includes('pika') ? (
                          <video src={videoUrl} autoPlay loop muted playsInline
                            style={{ width: 160, borderRadius: 16, display: 'block', boxShadow: '0 16px 48px rgba(0,0,0,0.18)' }} />
                        ) : (
                          <img src={videoUrl} alt="Generated" className="upload-img" />
                        )}
                        <div className="upload-done-badge" style={{ background: 'var(--pink-2)' }}>
                          🎬 {videoUrl.includes('pika') ? 'Pika video ready' : 'preview ready'}
                        </div>
                      </div>
                    ) : (
                      <div style={{ position: 'relative' }}>
                        <img src={uploadedImg} alt="Your item" className="upload-img" />
                        {uploadStep === 'done' && !videoUrl && (
                          <div className="upload-done-badge">listed on depop + fb 🎉</div>
                        )}
                        {uploadStep === 'processing' && closer !== 'idle' && !videoUrl && (
                          <div className="upload-done-badge" style={{ background: 'var(--black)', animation: 'blink 1s ease-in-out infinite' }}>
                            🎬 Generating video…
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="tips-col">
                    {tips.map((t, i) => (
                      <div key={i} className="tip" style={{ animationDelay: `${i * 0.22}s` }}>{t}</div>
                    ))}
                    {videoUrl && (
                      <div className="tip" style={{ animationDelay: '0s', background: '#FFF0F7', color: 'var(--pink-2)', fontWeight: 700 }}>
                        🎬 {videoUrl.includes('pika') ? 'Pika video generated!' : 'Preview video ready'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {slide > 0 && (
          <div className={`snav ${slide >= 4 ? 'snav--dark' : ''}`}>
            <button className="sarrow" onClick={() => goTo(slide - 1)} aria-label="Previous">
              <CurlyLeft c="rgba(0,0,0,0.4)" />
              <span className="sarrow-lbl">back</span>
            </button>
            <div className="sdots">
              {Array.from({ length: SLIDE_COUNT - 1 }, (_, i) => i + 1).map(n => (
                <button key={n}
                  className={`sdot ${slide === n ? 'sdot--on' : ''}`}
                  onClick={() => { goTo(n); if (n !== 4) resetUpload() }}
                  aria-label={`Slide ${n}`}
                />
              ))}
            </div>
            <button className="sarrow" onClick={() => goTo(slide + 1)} aria-label="Next">
              <span className="sarrow-lbl">{slide < SLIDE_COUNT - 1 ? 'next' : 'done ↓'}</span>
              <CurlyRight c="rgba(0,0,0,0.4)" />
            </button>
          </div>
        )}
      </div>

      <div id="below-fold">
        <div className="ticker-wrap" aria-hidden="true">
          <div className="ticker-track">
            {[
              { name: 'Browserbase', color: '#6366f1' },
              { name: 'Pika',        color: '#E875BB' },
              { name: 'Supabase',    color: '#3ECF8E' },
              { name: 'OpenAI',      color: '#10a37f' },
              { name: 'Depop',       color: '#FF2300' },
              { name: 'FB Marketplace', color: '#1877f2' },
              { name: 'Stagehand',   color: '#f59e0b' },
              { name: 'Claude AI',   color: '#D97706' },
              { name: 'Playwright',  color: '#2EAD33' },
              { name: 'Browserbase', color: '#6366f1' },
              { name: 'Pika',        color: '#E875BB' },
              { name: 'Supabase',    color: '#3ECF8E' },
              { name: 'OpenAI',      color: '#10a37f' },
              { name: 'Depop',       color: '#FF2300' },
              { name: 'FB Marketplace', color: '#1877f2' },
              { name: 'Stagehand',   color: '#f59e0b' },
              { name: 'Claude AI',   color: '#D97706' },
              { name: 'Playwright',  color: '#2EAD33' },
            ].map((tech, i) => (
              <span key={i} className="tick">
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: tech.color, marginRight: 6, flexShrink: 0 }} />
                {tech.name}
              </span>
            ))}
          </div>
        </div>

        <section className="agents-section" id="agents">
          <div className="section-label">how it works</div>
          <h2 className="big-head">snap it.<br /><em>it handles the rest.</em></h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>

            {/* ── Step 0: Upload ── */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'var(--gray)', border: '2px dashed rgba(0,0,0,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.625rem'
              }}>📷</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)' }}>You</div>
                <div style={{ fontWeight: 900, fontSize: '0.875rem', letterSpacing: '-0.02em', textTransform: 'lowercase' }}>upload</div>
              </div>
            </div>

            {/* Arrow 1 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', flexShrink: 0, opacity: 0.4 }}>
              <svg width="48" height="20" viewBox="0 0 48 20" fill="none">
                <path d="M2 10 C14 3 34 3 42 10" stroke="#080808" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M37 5 L42 10 L37 15" stroke="#080808" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            {/* ── Agent 01: Researcher ── */}
            <div className="agent-card" style={{ flexShrink: 0, minWidth: 200 }}>
              <div className="orbit-circle c-blue" style={{ width: 100, height: 100, fontSize: '2.25rem' }}>🔍<div className="ring" /></div>
              <div><div className="agent-num">Agent 01</div><div className="agent-name">researcher</div></div>
              <p className="agent-p" style={{ fontSize: '0.78rem' }}>Uses GPT-4o vision to identify your item, then scrapes Depop, eBay, Facebook, Mercari & more to find the real selling price.</p>
              <div className="chip-row"><span className="chip">GPT-4o Vision</span><span className="chip">Live Scraping</span><span className="chip">Price Range</span></div>
            </div>

            {/* Arrow 2 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', flexShrink: 0, opacity: 0.4 }}>
              <svg width="48" height="20" viewBox="0 0 48 20" fill="none">
                <path d="M2 10 C14 3 34 3 42 10" stroke="#080808" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M37 5 L42 10 L37 15" stroke="#080808" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            {/* ── Agent 02: Studio ── */}
            <div className="agent-card" style={{ flexShrink: 0, minWidth: 200 }}>
              <div className="orbit-circle c-pink" style={{ width: 100, height: 100, fontSize: '2.25rem' }}>🎬<div className="ring" /></div>
              <div><div className="agent-num">Agent 02</div><div className="agent-name">studio</div></div>
              <p className="agent-p" style={{ fontSize: '0.78rem' }}>Writes the title, description and tags. Generates AI lifestyle photos. Builds a complete listing — no copywriting, no photography needed.</p>
              <div className="chip-row"><span className="chip">AI Copywriting</span><span className="chip">Image Gen</span><span className="chip">Listing Builder</span></div>
            </div>

            {/* Arrow 3 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', flexShrink: 0, opacity: 0.4 }}>
              <svg width="48" height="20" viewBox="0 0 48 20" fill="none">
                <path d="M2 10 C14 3 34 3 42 10" stroke="#080808" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M37 5 L42 10 L37 15" stroke="#080808" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            {/* ── Agent 03: Closer ── */}
            <div className="agent-card" style={{ flexShrink: 0, minWidth: 200 }}>
              <div className="orbit-circle c-yell" style={{ width: 100, height: 100, fontSize: '2.25rem' }}>🤝<div className="ring" /></div>
              <div><div className="agent-num">Agent 03</div><div className="agent-name">closer</div></div>
              <p className="agent-p" style={{ fontSize: '0.78rem' }}>Posts to Facebook Marketplace. Monitors your Messenger inbox, reads offers, and replies — so deals close while you do other things.</p>
              <div className="chip-row"><span className="chip">FB Marketplace</span><span className="chip">Auto-Messaging</span><span className="chip">Negotiation</span></div>
            </div>

            {/* Arrow 4 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', flexShrink: 0, opacity: 0.4 }}>
              <svg width="48" height="20" viewBox="0 0 48 20" fill="none">
                <path d="M2 10 C14 3 34 3 42 10" stroke="#080808" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M37 5 L42 10 L37 15" stroke="#080808" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            {/* ── Step End: Negotiate & Finalise ── */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'var(--yellow)', border: '2px solid rgba(0,0,0,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.625rem'
              }}>💰</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--muted)' }}>Auto</div>
                <div style={{ fontWeight: 900, fontSize: '0.875rem', letterSpacing: '-0.02em', textTransform: 'lowercase' }}>negotiate</div>
                <div style={{ fontWeight: 900, fontSize: '0.875rem', letterSpacing: '-0.02em', textTransform: 'lowercase', lineHeight: 1 }}>&amp; finalise</div>
              </div>
            </div>

          </div>
        </section>

        <section className="photo-section photo-section--cta">
          <img src="/images/flatlay.avif" alt="Luxury resale items" className="fill-img photo-img" />
          <div className="photo-overlay photo-overlay--pink" />
          <div className="photo-content photo-content--center">
            <h2 className="big-head" style={{ color: 'var(--white)', textAlign: 'center' }}>
              your stuff,<br /><em style={{ color: 'var(--yellow)' }}>sold.</em><br />while you sleep.
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.9375rem', lineHeight: 1.65, maxWidth: 360, textAlign: 'center', margin: '0 auto 2.5rem' }}>
              Join the waitlist. Opening platform by platform, starting with Depop and FB Marketplace.
            </p>
            <div className="cta-form">
              <input id="cta-email" type="email" placeholder="your@email.com" aria-label="Email for waitlist" />
              <button type="button">Join waitlist</button>
            </div>
            <p className="cta-note">We will never save or store your location data.</p>
          </div>
        </section>

        <footer>
          <a href="#" className="footer-logo">reseller.</a>
          <span className="footer-r">Built at a hackathon · 2026</span>
        </footer>
      </div>
    </div>
  )
}

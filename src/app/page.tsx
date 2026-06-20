'use client'

import { useCallback, useRef, useState, useEffect } from 'react'

type UploadStep = 'idle' | 'processing' | 'result'
type AgentState = 'idle' | 'working' | 'done'

const MOCK_ITEMS = [
  { title: 'Vintage Levi\'s 501 Jeans', price: 68, demand: 94, tags: ['vintage','denim','y2k','levi'] },
  { title: 'Nike Air Force 1 Low',       price: 115, demand: 88, tags: ['nike','sneakers','af1','streetwear'] },
  { title: 'Y2K Butterfly Crop Top',     price: 32,  demand: 97, tags: ['y2k','crop','butterfly','2000s'] },
  { title: 'Coach Crossbody Bag',        price: 220, demand: 91, tags: ['coach','bag','designer','leather'] },
  { title: 'Ralph Lauren Polo Shirt',    price: 45,  demand: 82, tags: ['ralph','polo','preppy','vintage'] },
]

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const waveRef      = useRef<HTMLCanvasElement>(null)

  const [slide, setSlide]           = useState(0)
  const [uploadStep, setUploadStep] = useState<UploadStep>('idle')
  const [uploadedImg, setUploadedImg] = useState<string | null>(null)
  const [dragOver, setDragOver]     = useState(false)
  const [scout, setScout]           = useState<AgentState>('idle')
  const [studio, setStudio]         = useState<AgentState>('idle')
  const [closer, setCloser]         = useState<AgentState>('idle')
  const [item]                      = useState(() => MOCK_ITEMS[Math.floor(Math.random() * MOCK_ITEMS.length)])

  /* waveform */
  useEffect(() => {
    let id: number
    const wc = waveRef.current
    if (!wc) return
    const ctx = wc.getContext('2d')!
    const N = 44
    const hs = Array.from({ length: N }, (_, i) => 4 + Math.abs(Math.sin(i * 0.55)) * 22)
    const sp = Array.from({ length: N }, () => 0.03 + Math.random() * 0.04)
    const of = Array.from({ length: N }, (_, i) => i * 0.32)
    const draw = (ts: number) => {
      const T = ts / 1000
      ctx.clearRect(0, 0, wc.width, wc.height)
      const bW = 3, gap = 3, tot = N * (bW + gap) - gap
      const sx = (wc.width - tot) / 2, cy = wc.height / 2
      for (let i = 0; i < N; i++) {
        const h = hs[i] * (0.3 + 0.7 * Math.abs(Math.sin(T * sp[i] + of[i])))
        const x = sx + i * (bW + gap), a = 0.5 + 0.5 * (h / hs[i])
        ctx.fillStyle = `rgba(8,8,8,${a})`
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(x, cy - h / 2, bW, h, 100)
        else ctx.rect(x, cy - h / 2, bW, h)
        ctx.fill()
      }
      id = requestAnimationFrame(draw)
    }
    id = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(id)
  }, [])

  const runProcessing = useCallback((img: string) => {
    setUploadedImg(img)
    setScout('idle'); setStudio('idle'); setCloser('idle')
    setUploadStep('processing')
    setTimeout(() => setScout('working'), 300)
    setTimeout(() => { setScout('done'); setStudio('working') }, 1700)
    setTimeout(() => { setStudio('done'); setCloser('working') }, 3000)
    setTimeout(() => setCloser('done'), 4100)
    setTimeout(() => setUploadStep('result'), 4700)
  }, [])

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = e => runProcessing(e.target?.result as string)
    reader.readAsDataURL(file)
  }, [runProcessing])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]; if (f) handleFile(f)
  }, [handleFile])

  const resetUpload = () => {
    setUploadStep('idle'); setUploadedImg(null)
    setScout('idle'); setStudio('idle'); setCloser('idle')
  }

  const scrollToCta = () => document.getElementById('cta-email')?.focus()

  const TABS = [
    { num: '01', label: 'upload it' },
    { num: '02', label: 'scout prices' },
    { num: '03', label: 'studio lists' },
    { num: '04', label: 'closer sells' },
  ]

  return (
    <>
      {/* ── NAV ── */}
      <nav className="nav">
        <a href="#" className="logo">reseller.</a>
        <button className="pill pill-white" onClick={scrollToCta}>Get Access</button>
      </nav>

      {/* ── HERO (Luffu-style full bleed) ── */}
      <section className="hero">
        <div className="hero-bg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/closet.avif" alt="Person surrounded by a pile of clothes" />
        </div>

        <div className="hero-top">
          <div className="hero-badge">
            <span className="badge-dot" />
            AI-Powered Reselling · Now in Beta
          </div>
          <h1>your pile is<br /><em>money</em><br />waiting. 💸</h1>
          <p className="hero-sub">
            Scout prices it. Studio lists it with a video. Closer handles every DM — offers, meetups, all of it.
          </p>
          <div className="hero-cta-row">
            <button className="pill pill-big hero-try-btn" onClick={() => { setSlide(0); document.getElementById('process')?.scrollIntoView({ behavior: 'smooth' }) }}>
              Try it out →
            </button>
            <button className="pill pill-big pill-outline-w" onClick={() => document.getElementById('agents')?.scrollIntoView({ behavior: 'smooth' })}>
              See how
            </button>
          </div>
        </div>

        <div className="hero-wordmark" aria-hidden="true">reseller.</div>
      </section>

      {/* ── TICKER ── */}
      <div className="ticker-wrap" aria-hidden="true">
        <div className="ticker-track">
          {['upload your item','scout prices it','studio lists it','closer negotiates','calendar sync','depop + fb marketplace'].flatMap((t, i) => [
            <span key={`a${i}`} className="tick">{t} <span className="tick-dot">●</span></span>,
            <span key={`b${i}`} className="tick">{t} <span className="tick-dot">●</span></span>,
          ])}
        </div>
      </div>

      {/* ── PROCESS SLIDER (4 panels) ── */}
      <section className="process-section" id="process">
        {/* Tab navigation */}
        <div className="slide-nav" role="tablist">
          {TABS.map((t, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={slide === i}
              className={`slide-tab ${slide === i ? 'active' : ''}`}
              onClick={() => { setSlide(i); if (i !== 0) resetUpload() }}
            >
              <span className="slide-tab-num">{t.num}</span>
              <span className="slide-tab-label">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Slides */}
        <div className="slide-viewport">
          <div className="slide-track" style={{ transform: `translateX(-${slide * 100}%)` }}>

            {/* ── SLIDE 1: Upload / Try it out ── */}
            <div className="slide slide-1" role="tabpanel">
              <div className="slide-left">
                {uploadStep === 'idle' && (
                  <>
                    <div className="slide-step">Step 01 / Upload</div>
                    <h2>drop your<br />item. <em>📸</em></h2>
                    <p>Any item from your closet, shelf, or thrift haul. Scout will price it in seconds.</p>
                    <div
                      className={`drop-zone ${dragOver ? 'drop-zone--over' : ''}`}
                      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      role="button" tabIndex={0}
                      onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
                    >
                      <span className="drop-icon">📷</span>
                      <span className="drop-label">drag & drop or click to upload</span>
                      <span className="drop-hint">jpg, png, webp — any item works</span>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                  </>
                )}

                {uploadStep === 'processing' && (
                  <>
                    <div className="slide-step">Agents working...</div>
                    <h2>analysing<br />your item. <em>⚡</em></h2>
                    <div className="agent-status-list" style={{ marginTop: '1.5rem' }}>
                      <AgentRow icon="🔍" name="Scout"  label="scanning live comps"       state={scout}  delay={0} />
                      <AgentRow icon="🎬" name="Studio" label="writing listing + video"    state={studio} delay={1} />
                      <AgentRow icon="🤝" name="Closer" label="setting up DM responses"    state={closer} delay={2} />
                    </div>
                  </>
                )}

                {uploadStep === 'result' && (
                  <>
                    <div className="slide-step">✅ done!</div>
                    <h2>your listing<br />is <em>live.</em> 🎉</h2>
                    <div className="result-card" style={{ marginTop: '1.5rem' }}>
                      <div className="result-badge">✅ listing ready</div>
                      <div className="result-title">{item.title}</div>
                      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
                        <div>
                          <div className="result-price-val">${item.price}</div>
                          <div style={{ fontSize: '0.68rem', color: '#888', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Scout&apos;s price</div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <span className="result-demand-bar" style={{ '--pct': `${item.demand}%` } as React.CSSProperties} />
                          <span className="result-demand-label">{item.demand}% demand</span>
                        </div>
                      </div>
                      <div className="result-tags">{item.tags.map(t => <span key={t} className="chip">{t}</span>)}</div>
                    </div>
                    <div className="result-ctas" style={{ marginTop: '1.5rem' }}>
                      <button className="pill pill-big" style={{ background: 'var(--pink-2)' }}>Push live →</button>
                      <button className="pill pill-big pill-outline" onClick={resetUpload}>Try another</button>
                    </div>
                  </>
                )}
              </div>

              {/* Right: phone mockup art or uploaded image */}
              <div className="slide-right" style={{ background: '#F7F7F7' }}>
                {uploadedImg && (uploadStep === 'processing' || uploadStep === 'result') ? (
                  <div style={{ position: 'relative', width: '70%', maxWidth: 340 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={uploadedImg} alt="Uploaded item" style={{ width: '100%', borderRadius: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.14)', display: 'block' }} />
                    {uploadStep === 'result' && (
                      <div style={{ position: 'absolute', bottom: '-1rem', left: '50%', transform: 'translateX(-50%)', background: 'var(--pink-2)', color: '#fff', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.45rem 1rem', borderRadius: 100, whiteSpace: 'nowrap' }}>
                        listed on depop + fb 🎉
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="slide-phone-art">
                    <div className="spa-pill" />
                    <div className="spa-screen">
                      <div className="spa-status">● ready to list</div>
                      <div className="spa-box spa-box-1">📦</div>
                      <div className="spa-prog-w"><div className="spa-prog" /></div>
                      <div className="spa-copy">Upload any item and we&apos;ll price, list, and sell it for you.</div>
                      <div className="spa-tags">
                        {['y2k','vintage','depop','style'].map((t, i) => <span key={t} className="spa-tag" style={{ animationDelay: `${1.5 + i * 0.4}s` }}>{t}</span>)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── SLIDE 2: Scout ── */}
            <div className="slide slide-2" role="tabpanel">
              <div className="slide-left">
                <div className="slide-step">Step 02 / Scout</div>
                <h2>priced before<br />you post. <em>🔍</em></h2>
                <p>Scout scans live Depop, eBay, and FB Marketplace listings in real time to find the exact price that moves — not the one that sits for months collecting dust.</p>
                <div className="price-badge" style={{ marginTop: '0.5rem' }}>
                  $187 <span className="price-label">Scout says</span>
                </div>
                <p style={{ marginTop: '1rem', fontSize: '0.78rem', color: 'rgba(0,0,0,0.5)', fontWeight: 600 }}>
                  avg +24% vs. manual pricing
                </p>
              </div>
              {/* Sneaker image — mix-blend-mode knocks out the grey bg on blue */}
              <div className="slide-right" style={{ background: 'var(--blue)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/sneaker.avif" alt="Nike Air Jordan sneaker" className="blend-img" style={{ maxHeight: '80%' }} />
              </div>
            </div>

            {/* ── SLIDE 3: Studio ── */}
            <div className="slide slide-3" role="tabpanel">
              <div className="slide-left">
                <div className="slide-step">Step 03 / Studio</div>
                <h2>listed in<br />60 seconds. <em>🎬</em></h2>
                <p>Studio writes the title, description, and tags — then generates a 15-second product video and posts it to Depop, FB Marketplace, and more simultaneously.</p>
                <div style={{ marginTop: '1.5rem' }}>
                  <button className="pill pill-big" style={{ background: 'var(--black)' }}>See Studio</button>
                </div>
              </div>
              {/* Blazer image — mix-blend-mode knocks out bg on pink */}
              <div className="slide-right" style={{ background: 'var(--pink)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/blazer.avif" alt="Pink blazer styled listing" className="blend-img" />
              </div>
            </div>

            {/* ── SLIDE 4: Closer ── */}
            <div className="slide slide-4" role="tabpanel">
              <div className="slide-left">
                <div className="slide-step">Step 04 / Closer</div>
                <h2>sold while<br />you sleep. <em>🤝</em></h2>
                <p>Closer lives in your DMs. It scores every offer, writes the counter, and books the meetup straight from your calendar — you never type a single message.</p>
                <div className="dm-thread" style={{ marginTop: '1.5rem', maxWidth: 340 }}>
                  <div className="dm dm-buyer">&quot;is $50 your lowest for the coat?&quot;</div>
                  <div className="dm dm-ai">I can do $62 — it&apos;s under market. Meet Saturday in Williamsburg? 🤝</div>
                  <div className="dm dm-buyer">&quot;deal! saturday works 🙌&quot;</div>
                </div>
              </div>
              {/* Polaroid image — mix-blend-mode on yellow */}
              <div className="slide-right" style={{ background: 'var(--yellow)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/polaroids.avif" alt="Fashion moodboard polaroids" className="blend-img" />
                <canvas ref={waveRef} width={260} height={48} style={{ position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', display: 'block' }} />
              </div>
            </div>

          </div>{/* /slide-track */}
        </div>{/* /slide-viewport */}

        {/* Dots */}
        <div className="slide-dots" aria-hidden="true">
          {TABS.map((_, i) => (
            <button key={i} className={`slide-dot ${slide === i ? 'active' : ''}`} onClick={() => { setSlide(i); if (i !== 0) resetUpload() }} />
          ))}
        </div>
      </section>

      {/* ── AGENTS ── */}
      <section className="agents-section" id="agents">
        <div className="section-label">the pipeline</div>
        <h2 className="big-head">three agents.<br /><em>one system.</em> 🤖</h2>
        <div className="agents-grid">
          {[
            { icon: '🔍', cls: 'c-blue', num: '01', name: 'scout',  desc: 'Prices your item against live market data before you post a single photo.', tags: ['Price Analysis','Demand Score','Comp Watch'] },
            { icon: '🎬', cls: 'c-pink', num: '02', name: 'studio', desc: 'Writes the listing, generates a short product video, and posts everywhere simultaneously.', tags: ['Video Gen','SEO Copy','Auto-Post'] },
            { icon: '🤝', cls: 'c-yell', num: '03', name: 'closer', desc: 'Lives in your DMs — scores offers, counters, books meetups from your calendar.', tags: ['Auto-DM','Offer Scoring','Calendar Sync'] },
          ].map(a => (
            <div key={a.name} className="agent-card">
              <div className={`orbit-circle ${a.cls}`}>{a.icon}<div className="ring" /></div>
              <div><div className="agent-num">Agent {a.num}</div><div className="agent-name">{a.name}</div></div>
              <p className="agent-p">{a.desc}</p>
              <div className="chip-row">{a.tags.map(t => <span key={t} className="chip">{t}</span>)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="stats-section">
        <div className="stat-cell"><div className="stat-num">3×</div><div className="stat-lbl">more listings per hour</div></div>
        <div className="stat-cell"><div className="stat-num">0</div><div className="stat-lbl">DMs you ever type</div></div>
        <div className="stat-cell"><div className="stat-num">↑24%</div><div className="stat-lbl">avg sale price with scout</div></div>
      </section>

      {/* ── FLATLAY CTA ── */}
      <section className="photo-section photo-section--cta">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/flatlay.avif" alt="Luxury resale items flatlay" className="fill-img photo-img" />
        <div className="photo-overlay photo-overlay--pink" />
        <div className="photo-content photo-content--center">
          <h2 className="big-head" style={{ color: 'var(--white)', textAlign: 'center' }}>
            your stuff,<br /><em style={{ color: 'var(--yellow)' }}>sold.</em> ✨<br />while you sleep.
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

      {/* FOOTER */}
      <footer>
        <a href="#" className="footer-logo">reseller.</a>
        <span className="footer-r">Built at a hackathon · 2026</span>
      </footer>
    </>
  )
}

function AgentRow({ icon, name, label, state, delay }: { icon: string; name: string; label: string; state: AgentState; delay: number }) {
  return (
    <div className={`agent-row agent-row--${state}`} style={{ animationDelay: `${delay * 0.15}s` }}>
      <div className="agent-row-icon">{icon}</div>
      <div className="agent-row-body">
        <span className="agent-row-name">{name}</span>
        <span className="agent-row-label">{label}</span>
      </div>
      <div className="agent-row-status">
        {state === 'idle'    && <span className="agent-dot agent-dot--idle" />}
        {state === 'working' && <span className="agent-dot agent-dot--working" />}
        {state === 'done'    && <span className="agent-check">✓</span>}
      </div>
    </div>
  )
}

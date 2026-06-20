'use client'

import { useCallback, useRef, useState, useEffect } from 'react'

type UploadStep = 'idle' | 'processing' | 'result'
type AgentState = 'idle' | 'working' | 'done'

const SLIDE_COUNT = 5  // 0=hero, 1=upload, 2=scout, 3=studio, 4=closer

const MOCK_ITEMS = [
  { title: "Vintage Levi's 501 Jeans",  price: 68,  demand: 94, tags: ['vintage','denim','y2k','levi'] },
  { title: 'Nike Air Force 1 Low',       price: 115, demand: 88, tags: ['nike','sneakers','af1','white'] },
  { title: 'Y2K Butterfly Crop Top',     price: 32,  demand: 97, tags: ['y2k','crop','butterfly','tops'] },
  { title: 'Coach Crossbody Bag',        price: 220, demand: 91, tags: ['coach','bag','designer','brown'] },
  { title: 'Ralph Lauren Polo Shirt',    price: 45,  demand: 82, tags: ['ralph','polo','preppy','vintage'] },
]

/* ── Curly SVG arrows ── */
const CurlyRight = ({ color = 'currentColor' }: { color?: string }) => (
  <svg width="56" height="32" viewBox="0 0 56 32" fill="none">
    <path d="M4 20 C8 6 28 2 44 14" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M38 8 L44 14 L37 19" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const CurlyLeft = ({ color = 'currentColor' }: { color?: string }) => (
  <svg width="56" height="32" viewBox="0 0 56 32" fill="none">
    <path d="M52 20 C48 6 28 2 12 14" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M18 8 L12 14 L19 19" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const CurlyDown = ({ color = 'currentColor' }: { color?: string }) => (
  <svg width="32" height="52" viewBox="0 0 32 52" fill="none">
    <path d="M10 4 C24 8 28 28 16 44" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M9 37 L16 44 L22 37" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export default function Home() {
  const sectionRef   = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const waveRef      = useRef<HTMLCanvasElement>(null)

  const [slideIndex, setSlideIndex] = useState(0)
  const [uploadStep, setUploadStep] = useState<UploadStep>('idle')
  const [uploadedImg, setUploadedImg] = useState<string | null>(null)
  const [dragOver, setDragOver]     = useState(false)
  const [scout,  setScout]          = useState<AgentState>('idle')
  const [studio, setStudio]         = useState<AgentState>('idle')
  const [closer, setCloser]         = useState<AgentState>('idle')
  const [item]                      = useState(() => MOCK_ITEMS[Math.floor(Math.random() * MOCK_ITEMS.length)])

  /* scroll → slide index */
  useEffect(() => {
    const onScroll = () => {
      const vh = window.innerHeight
      const raw = window.scrollY / vh
      const idx = Math.min(SLIDE_COUNT - 1, Math.max(0, Math.round(raw)))
      setSlideIndex(idx)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const goTo = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(SLIDE_COUNT - 1, idx))
    window.scrollTo({ top: clamped * window.innerHeight, behavior: 'smooth' })
  }, [])

  /* waveform */
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
    id = requestAnimationFrame(draw); return () => cancelAnimationFrame(id)
  }, [])

  /* upload flow */
  const runProcessing = useCallback((img: string) => {
    setUploadedImg(img); setScout('idle'); setStudio('idle'); setCloser('idle')
    setUploadStep('processing')
    setTimeout(() => setScout('working'), 300)
    setTimeout(() => { setScout('done'); setStudio('working') }, 1800)
    setTimeout(() => { setStudio('done'); setCloser('working') }, 3200)
    setTimeout(() => setCloser('done'), 4400)
    setTimeout(() => setUploadStep('result'), 4900)
  }, [])

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = e => runProcessing(e.target?.result as string)
    r.readAsDataURL(file)
  }, [runProcessing])

  const resetUpload = () => {
    setUploadStep('idle'); setUploadedImg(null)
    setScout('idle'); setStudio('idle'); setCloser('idle')
  }

  const scrollToCta = () => document.getElementById('cta-email')?.focus()

  /* nav color: white on hero (dark photo), black on everything else */
  const navDark = slideIndex === 0

  /* panel visibility helper */
  const active = (n: number) => slideIndex === n
  const prev   = (n: number) => slideIndex > n
  const panelCls = (n: number) => `slide-panel ${active(n) ? 'slide-panel--active' : prev(n) ? 'slide-panel--prev' : ''}`

  return (
    <>
      {/* ── NAV (fixed, color-aware) ── */}
      <nav className={`nav ${navDark ? 'nav--dark' : 'nav--light'}`}>
        <a href="#" className="logo">reseller.</a>
        <button className={`pill ${navDark ? 'pill-white' : ''}`} onClick={scrollToCta}>Get Access</button>
      </nav>

      {/* ── STICKY SLIDE SECTION ── */}
      <div ref={sectionRef} style={{ height: `${SLIDE_COUNT * 100}svh` }}>
        <div className="sticky-stage">

          {/* ─── SLIDE 0: HERO ─── */}
          <div className={panelCls(0)} style={{ display: 'block' }}>
            <div className="hero-bg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/closet.avif" alt="Pile of clothes" />
              <div className="hero-bg-grad" />
            </div>
            <div className="hero-content">
              <div className="hero-badge">
                <span className="badge-dot" />&nbsp;AI-Powered Reselling · Beta
              </div>
              <h1 className="hero-h1">
                your pile is<br /><em>money</em><br />waiting. 💸
              </h1>
              <p className="hero-sub">Scout prices it. Studio lists it. Closer sells it. You just upload a photo.</p>
              <div className="hero-cta-row">
                <button className="pill pill-white pill-big" onClick={() => goTo(1)}>
                  Try it out →
                </button>
                <button className="pill pill-big pill-outline-w" onClick={() => document.getElementById('agents')?.scrollIntoView({ behavior: 'smooth' })}>
                  See how
                </button>
              </div>
            </div>
            <div className="hero-wordmark" aria-hidden="true">reseller.</div>
            {/* Scroll down cue */}
            <button className="scroll-cue" onClick={() => goTo(1)} aria-label="Next slide">
              <CurlyDown color="rgba(255,255,255,0.6)" />
              <span>scroll</span>
            </button>
          </div>

          {/* ─── SLIDE 1: UPLOAD ─── */}
          <div className={panelCls(1)} style={{ background: '#fff' }}>
            <div className="slide-split">
              {/* Left */}
              <div className="slide-left slide-left--white">
                <div className="slide-step-label">01 / upload</div>

                {uploadStep === 'idle' && <>
                  <h2 className="slide-h2">drop your<br />item. <em>📸</em></h2>
                  <p className="slide-p">Any item from your closet, haul, or shelf. Scout will price it in seconds.</p>
                  <div
                    className={`drop-zone ${dragOver ? 'drop-zone--over' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                    onClick={() => fileInputRef.current?.click()}
                    role="button" tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
                  >
                    <span className="drop-icon">📷</span>
                    <span className="drop-label">drag & drop or click to upload</span>
                    <span className="drop-hint">jpg · png · webp — anything works</span>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                </>}

                {uploadStep === 'processing' && <>
                  <h2 className="slide-h2">analysing<br />your item. <em>⚡</em></h2>
                  <div className="agent-status-list">
                    <AgentRow icon="🔍" name="Scout"  label="scanning live comps"     state={scout}  delay={0} />
                    <AgentRow icon="🎬" name="Studio" label="writing listing + video" state={studio} delay={1} />
                    <AgentRow icon="🤝" name="Closer" label="setting up DM replies"   state={closer} delay={2} />
                  </div>
                </>}

                {uploadStep === 'result' && <>
                  <h2 className="slide-h2">listed &<br /><em>ready. 🎉</em></h2>
                  <div className="result-card">
                    <div className="result-badge">✅ listing ready</div>
                    <div className="result-title">{item.title}</div>
                    <div className="result-row">
                      <div>
                        <div className="result-price-val">${item.price}</div>
                        <div className="result-price-lbl">Scout&apos;s price</div>
                      </div>
                      <div className="result-demand-wrap">
                        <span className="result-demand-bar" style={{ '--pct': `${item.demand}%` } as React.CSSProperties} />
                        <span className="result-demand-lbl">{item.demand}% demand</span>
                      </div>
                    </div>
                    <div className="chip-row" style={{ justifyContent: 'flex-start', marginTop: '0.75rem' }}>
                      {item.tags.map(t => <span key={t} className="chip">{t}</span>)}
                    </div>
                  </div>
                  <div className="result-ctas">
                    <button className="pill pill-big" style={{ background: 'var(--pink-2)' }}>Push live →</button>
                    <button className="pill pill-big pill-outline" onClick={resetUpload}>Try another</button>
                  </div>
                </>}
              </div>

              {/* Right — clean, no animation */}
              <div className="slide-right" style={{ background: '#F8F4F2' }}>
                {uploadedImg ? (
                  <div className="upload-preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={uploadedImg} alt="Your uploaded item" className="upload-preview-img" />
                    {uploadStep === 'result' && (
                      <div className="upload-preview-badge">listed on depop + fb 🎉</div>
                    )}
                  </div>
                ) : (
                  <div className="upload-placeholder">
                    <span className="upload-placeholder-icon">🏷️</span>
                    <span className="upload-placeholder-text">your item goes here</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ─── SLIDE 2: SCOUT ─── */}
          <div className={panelCls(2)} style={{ background: 'var(--blue)' }}>
            <div className="slide-split">
              <div className="slide-left slide-left--blue">
                <div className="slide-step-label">02 / scout</div>
                <h2 className="slide-h2">priced before<br />you post. <em>🔍</em></h2>
                <p className="slide-p">Scout scans live Depop, eBay, and FB Marketplace to find the exact price that moves fast — not the one that sits for months.</p>
                <div className="price-badge" style={{ marginTop: '1rem' }}>
                  $187 <span className="price-label">Scout says</span>
                </div>
              </div>
              <div className="slide-right slide-right--blend" style={{ background: 'var(--blue)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/sneaker.avif" alt="Nike Air Jordan sneaker" className="blend-img" />
              </div>
            </div>
          </div>

          {/* ─── SLIDE 3: STUDIO ─── */}
          <div className={panelCls(3)} style={{ background: 'var(--pink)' }}>
            <div className="slide-split">
              <div className="slide-left slide-left--pink">
                <div className="slide-step-label">03 / studio</div>
                <h2 className="slide-h2">listed in<br />60 seconds. <em>🎬</em></h2>
                <p className="slide-p">Studio writes the title, description, tags — then generates a 15-second product video and posts to Depop and FB Marketplace simultaneously.</p>
                <button className="pill pill-big" style={{ marginTop: '1rem' }}>See Studio</button>
              </div>
              <div className="slide-right slide-right--blend" style={{ background: 'var(--pink)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/blazer.avif" alt="Pink blazer styled listing" className="blend-img" />
              </div>
            </div>
          </div>

          {/* ─── SLIDE 4: CLOSER ─── */}
          <div className={panelCls(4)} style={{ background: 'var(--yellow)' }}>
            <div className="slide-split">
              <div className="slide-left slide-left--yellow">
                <div className="slide-step-label">04 / closer</div>
                <h2 className="slide-h2">sold while<br />you sleep. <em>🤝</em></h2>
                <p className="slide-p">Closer lives in your DMs. It scores every offer, writes the counter, and books the meetup from your calendar. You never type a single reply.</p>
                <div className="dm-thread" style={{ marginTop: '1.5rem' }}>
                  <div className="dm dm-buyer">&quot;is $50 your lowest for the coat?&quot;</div>
                  <div className="dm dm-ai">I can do $62 — it&apos;s under market. Meet Saturday in Williamsburg? 🤝</div>
                  <div className="dm dm-buyer">&quot;deal! saturday works 🙌&quot;</div>
                </div>
              </div>
              <div className="slide-right slide-right--blend" style={{ background: 'var(--yellow)', position: 'relative' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/polaroids.avif" alt="Fashion polaroids and jewellery" className="blend-img" />
                <canvas ref={waveRef} width={280} height={44}
                  style={{ position: 'absolute', bottom: '2.5rem', left: '50%', transform: 'translateX(-50%)', display: 'block' }} />
              </div>
            </div>
          </div>

          {/* ── Navigation (hidden on hero) ── */}
          {slideIndex > 0 && (
            <div className="slide-nav-bar">
              <button
                className="slide-arrow-btn"
                onClick={() => goTo(slideIndex - 1)}
                aria-label="Previous slide"
                disabled={slideIndex === 0}
              >
                <CurlyLeft />
                <span className="slide-arrow-label">back</span>
              </button>

              <div className="slide-progress">
                {[1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    className={`slide-prog-dot ${slideIndex === n ? 'active' : ''}`}
                    onClick={() => { goTo(n); if (n !== 1) resetUpload() }}
                    aria-label={`Go to slide ${n}`}
                  />
                ))}
              </div>

              <button
                className="slide-arrow-btn"
                onClick={() => { goTo(slideIndex + 1); if (slideIndex === 0) resetUpload() }}
                aria-label="Next slide"
              >
                <span className="slide-arrow-label">
                  {slideIndex < SLIDE_COUNT - 1 ? 'next' : 'done ↓'}
                </span>
                <CurlyRight />
              </button>
            </div>
          )}

        </div>{/* /sticky-stage */}
      </div>{/* /scroll section */}

      {/* ── REST OF PAGE (normal scroll) ── */}
      <section className="agents-section" id="agents">
        <div className="section-label">the pipeline</div>
        <h2 className="big-head">three agents.<br /><em>one system.</em> 🤖</h2>
        <div className="agents-grid">
          {[
            { icon: '🔍', cls: 'c-blue', num: '01', name: 'scout',  desc: 'Prices your item against live market data across every major resale platform before you post a single photo.', tags: ['Price Analysis','Demand Score','Comp Watch'] },
            { icon: '🎬', cls: 'c-pink', num: '02', name: 'studio', desc: 'Writes the listing, generates a short product video, and posts everywhere simultaneously.', tags: ['Video Gen','SEO Copy','Auto-Post'] },
            { icon: '🤝', cls: 'c-yell', num: '03', name: 'closer', desc: 'Lives in your DMs — scores offers, counters, books meetups from your calendar automatically.', tags: ['Auto-DM','Offer Scoring','Calendar Sync'] },
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

      <section className="stats-section">
        <div className="stat-cell"><div className="stat-num">3×</div><div className="stat-lbl">more listings per hour</div></div>
        <div className="stat-cell"><div className="stat-num">0</div><div className="stat-lbl">DMs you ever type</div></div>
        <div className="stat-cell"><div className="stat-num">↑24%</div><div className="stat-lbl">avg sale price with scout</div></div>
      </section>

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

      <footer>
        <a href="#" className="footer-logo">reseller.</a>
        <span className="footer-r">Built at a hackathon · 2026</span>
      </footer>
    </>
  )
}

function AgentRow({ icon, name, label, state, delay }: {
  icon: string; name: string; label: string; state: AgentState; delay: number
}) {
  return (
    <div className={`agent-row agent-row--${state}`} style={{ animationDelay: `${delay * 0.2}s` }}>
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

'use client'

import { useEffect, useRef } from 'react'

export default function Home() {
  const orbitRef = useRef<HTMLCanvasElement>(null)
  const waveRef  = useRef<HTMLCanvasElement>(null)
  const ctaRef   = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let id1: number, id2: number, id3: number

    /* ── orbit canvas ── */
    const oc = orbitRef.current
    if (oc) {
      const ctx = oc.getContext('2d')!
      const items = [
        { emoji: '👟', color: '#A9D8F2', r: 130, angle: 0,   speed: 0.005,  size: 56 },
        { emoji: '👖', color: '#F2AACD', r: 200, angle: 2.1, speed: -0.004, size: 64 },
        { emoji: '📷', color: '#FFE24A', r: 90,  angle: 1.2, speed: 0.007,  size: 48 },
        { emoji: '👜', color: '#F2AACD', r: 260, angle: 4.0, speed: 0.003,  size: 72 },
        { emoji: '🧥', color: '#A9D8F2', r: 160, angle: 3.3, speed: -0.006, size: 52 },
      ]
      const resize = () => { oc.width = oc.offsetWidth; oc.height = oc.offsetHeight }
      resize()
      window.addEventListener('resize', resize)

      const draw = () => {
        const { width: w, height: h } = oc
        ctx.clearRect(0, 0, w, h)
        const cx = w * 0.45, cy = h * 0.5
        items.forEach(it => {
          ctx.beginPath(); ctx.arc(cx, cy, it.r, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(0,0,0,0.045)'; ctx.lineWidth = 1; ctx.stroke()
        })
        items.forEach(it => {
          const x = cx + Math.cos(it.angle) * it.r
          const y = cy + Math.sin(it.angle) * it.r
          ctx.beginPath(); ctx.arc(x, y, it.size / 2, 0, Math.PI * 2)
          ctx.fillStyle = it.color; ctx.shadowColor = it.color; ctx.shadowBlur = 18
          ctx.fill(); ctx.shadowBlur = 0
          ctx.font = `${it.size * 0.52}px serif`
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText(it.emoji, x, y + 1)
          it.angle += it.speed
        })
        id1 = requestAnimationFrame(draw)
      }
      draw()
      return () => window.removeEventListener('resize', resize)
    }

    /* ── waveform canvas ── */
    const wc = waveRef.current
    if (wc) {
      const wctx = wc.getContext('2d')!
      const N = 48
      const heights = Array.from({ length: N }, (_, i) => 6 + Math.abs(Math.sin(i * 0.55)) * 38)
      const speeds  = Array.from({ length: N }, () => 0.03 + Math.random() * 0.04)
      const offsets = Array.from({ length: N }, (_, i) => i * 0.32)
      const drawWave = (ts: number) => {
        const T = ts / 1000
        wctx.clearRect(0, 0, wc.width, wc.height)
        const barW = 4, gap = 3.5, totalW = N * (barW + gap) - gap
        const startX = (wc.width - totalW) / 2, cy = wc.height / 2
        for (let i = 0; i < N; i++) {
          const h = heights[i] * (0.35 + 0.65 * Math.abs(Math.sin(T * speeds[i] + offsets[i])))
          const x = startX + i * (barW + gap)
          const alpha = 0.4 + 0.6 * (h / heights[i])
          wctx.fillStyle = `rgba(232,117,187,${alpha})`
          wctx.beginPath()
          wctx.roundRect(x, cy - h / 2, barW, h, 100)
          wctx.fill()
        }
        id2 = requestAnimationFrame(drawWave)
      }
      id2 = requestAnimationFrame(drawWave)
    }

    /* ── cta canvas ── */
    const cc = ctaRef.current
    if (cc) {
      const cctx = cc.getContext('2d')!
      const circles = [
        { x: 0.1,  y: 0.2,  r: 90,  speed: 0.003  },
        { x: 0.85, y: 0.15, r: 130, speed: -0.002 },
        { x: 0.75, y: 0.8,  r: 80,  speed: 0.004  },
        { x: 0.2,  y: 0.85, r: 110, speed: -0.003 },
        { x: 0.5,  y: 0.1,  r: 60,  speed: 0.005  },
      ]
      const resize2 = () => { cc.width = cc.offsetWidth; cc.height = cc.offsetHeight }
      resize2()
      window.addEventListener('resize', resize2)
      let t = 0
      const drawCta = () => {
        t += 0.01
        const { width: w, height: h } = cc
        cctx.clearRect(0, 0, w, h)
        circles.forEach((c, i) => {
          const ox = Math.sin(t * c.speed * 80 + i) * 28
          const oy = Math.cos(t * c.speed * 60 + i) * 20
          cctx.beginPath(); cctx.arc(c.x * w + ox, c.y * h + oy, c.r, 0, Math.PI * 2)
          cctx.fillStyle = 'rgba(255,255,255,0.22)'; cctx.fill()
        })
        id3 = requestAnimationFrame(drawCta)
      }
      drawCta()
      return () => window.removeEventListener('resize', resize2)
    }

    return () => {
      cancelAnimationFrame(id1)
      cancelAnimationFrame(id2)
      cancelAnimationFrame(id3)
    }
  }, [])

  const scrollToCta = () => document.getElementById('cta-email')?.focus()

  return (
    <>
      {/* NAV */}
      <nav className="nav">
        <a href="#" className="logo">reseller.</a>
        <button className="pill" onClick={scrollToCta}>get access</button>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="hero-left">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            AI-Powered · Depop &amp; FB Marketplace
          </div>
          <h1>
            list it.<br />
            <em>close it.</em><br />
            repeat. 🏷️
          </h1>
          <p className="hero-sub">
            <strong>Scout</strong> prices the market. <strong>Studio</strong> shoots the listing and drops the video.{' '}
            <strong>Closer</strong> handles every DM — offers, meetups, the works.
          </p>
          <div className="hero-ctas">
            <button className="pill big" onClick={scrollToCta}>Join waitlist</button>
            <button className="pill outline big">See how it works</button>
          </div>
          <p className="hero-footnote">We will never save or store your listing data.</p>
        </div>
        <div className="hero-right">
          <canvas ref={orbitRef} className="orbit-canvas" />
        </div>
      </section>

      {/* TICKER */}
      <div className="ticker-wrap" aria-hidden="true">
        <div className="ticker-track">
          {['market research','video generation','auto-listing','offer handling','calendar sync','depop + fb marketplace','supabase backend'].flatMap((t, i) => [
            <span key={`a${i}`} className="tick">{t} <span className="tick-dot">●</span></span>,
            <span key={`b${i}`} className="tick">{t} <span className="tick-dot">●</span></span>,
          ])}
        </div>
      </div>

      {/* AGENTS */}
      <section className="agents-section" id="agents">
        <div className="section-label">the pipeline</div>
        <h2 className="big-head">three agents.<br /><em>one system.</em> 🤖</h2>
        <p className="section-sub">Each agent owns a phase. Together they take an item from your hands to sold — automatically.</p>
        <div className="agents-grid">
          {[
            { icon: '🔍', color: 'c-blue', num: '01', name: 'scout', role: 'Market Research Agent', desc: 'Scans live Depop, FB Marketplace, and eBay listings to find your item\'s sweet-spot price — before you post a single photo.', tags: ['Price Analysis','Competitor Watch','Demand Score'] },
            { icon: '🎬', color: 'c-pink', num: '02', name: 'studio', role: 'Content Agent', desc: 'Writes the title, description, and tags. Generates a short product video. Posts to every platform simultaneously and logs it to Supabase.', tags: ['Video Gen','SEO Copy','Auto-Post','Supabase'] },
            { icon: '🤝', color: 'c-yell', num: '03', name: 'closer', role: 'Negotiation Agent', desc: 'Lives in your DMs. Scores every offer, counters when needed, and confirms meetup details straight from your calendar — no typing required.', tags: ['Auto-DM','Offer Scoring','Calendar Sync','Meetup Confirm'] },
          ].map(a => (
            <div key={a.name} className="agent-card">
              <div className={`orbit-circle ${a.color}`}>
                {a.icon}
                <div className="ring" />
              </div>
              <div>
                <div className="agent-role-label">Agent {a.num}</div>
                <div className="agent-title">{a.name}</div>
              </div>
              <p className="agent-p">{a.desc}</p>
              <div className="chip-row">{a.tags.map(t => <span key={t} className="chip">{t}</span>)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* STUDIO */}
      <section className="studio-section">
        <div className="studio-text">
          <div className="section-label">agent 02</div>
          <h2 className="big-head">studio<br /><em>creates.</em> 🎬</h2>
          <p>Snap three photos. Studio writes a listing, generates a 15-second product video, and posts it across every platform — all before you&apos;ve put your phone down.</p>
          <button className="pill big">See studio in action</button>
        </div>
        <div className="studio-visual">
          <div className="studio-bg-circle" style={{width:480,height:480,top:'50%',left:'50%',transform:'translate(-50%,-50%)',animation:'slowSpin 25s linear infinite'}} />
          <div className="studio-bg-circle" style={{width:340,height:340,top:'50%',left:'50%',transform:'translate(-50%,-50%)',animation:'slowSpin 18s linear infinite reverse'}} />
          <div className="phone">
            <div className="phone-pill" />
            <div className="phone-screen">
              <div className="phone-status">● Studio · Generating video...</div>
              <div className="phone-item">👟</div>
              <div className="phone-progress-wrap"><div className="phone-progress" /></div>
              <div className="phone-copy">&quot;Nike Air Max 90 in great condition.<br />Size 10. No box. Depop-era gem.&quot;</div>
              <div className="phone-tags">
                <span className="phone-tag">vintage</span>
                <span className="phone-tag">nike</span>
                <span className="phone-tag">sneakers</span>
                <span className="phone-tag">y2k</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CLOSER */}
      <section className="closer-section" id="closer">
        <div className="closer-ring closer-ring-1" />
        <div className="closer-ring closer-ring-2" />
        <div className="closer-ring closer-ring-3" />
        <div className="closer-inner">
          <div className="section-label" style={{color:'rgba(255,255,255,0.35)'}}>agent 03</div>
          <h2 className="big-head">closer<br /><em style={{color:'var(--pink-2)'}}>negotiates.</em> 💬</h2>
          <p className="closer-sub">Every offer, handled. Closer reads the message, scores the deal, writes the counter — and books the meetup from your actual calendar.</p>
          <div className="dm-thread">
            <div className="dm buyer">&quot;hey is $50 the lowest you can go on the coat?&quot;</div>
            <div className="dm ai">I can do $62 — it&apos;s priced under comps and in excellent condition. Want to meet Saturday afternoon in Williamsburg? 🤝</div>
            <div className="dm buyer">&quot;deal! saturday works&quot;</div>
          </div>
          <canvas ref={waveRef} className="wave-canvas" width={360} height={80} />
        </div>
      </section>

      {/* STATS */}
      <section className="stats-section" aria-label="Stats">
        <div className="stat-cell"><div className="stat-num-big">3×</div><div className="stat-label-sm">more listings per hour</div></div>
        <div className="stat-cell"><div className="stat-num-big">0</div><div className="stat-label-sm">DMs you ever type</div></div>
        <div className="stat-cell"><div className="stat-num-big">↑24%</div><div className="stat-label-sm">avg sale price with scout</div></div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <canvas ref={ctaRef} className="cta-canvas" />
        <div className="cta-inner">
          <h2>your stuff,<br /><em>sold.</em> ✨<br />while you sleep.</h2>
          <p className="cta-p">Join the waitlist. We&apos;re opening access platform by platform, starting with Depop and FB Marketplace.</p>
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

'use client'

import { useEffect, useRef } from 'react'

export default function Home() {
  const waveRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let id: number
    const wc = waveRef.current
    if (!wc) return
    const ctx = wc.getContext('2d')!
    const N = 48
    const heights = Array.from({ length: N }, (_, i) => 4 + Math.abs(Math.sin(i * 0.55)) * 26)
    const speeds  = Array.from({ length: N }, () => 0.03 + Math.random() * 0.04)
    const offsets = Array.from({ length: N }, (_, i) => i * 0.32)

    const draw = (ts: number) => {
      const T = ts / 1000
      ctx.clearRect(0, 0, wc.width, wc.height)
      const bW = 3, gap = 3, tot = N * (bW + gap) - gap
      const sx = (wc.width - tot) / 2, cy = wc.height / 2
      for (let i = 0; i < N; i++) {
        const h = heights[i] * (0.3 + 0.7 * Math.abs(Math.sin(T * speeds[i] + offsets[i])))
        const x = sx + i * (bW + gap)
        const a = 0.5 + 0.5 * (h / heights[i])
        ctx.fillStyle = `rgba(242,170,205,${a})`
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

  const scrollToCta = () => document.getElementById('cta-email')?.focus()

  return (
    <>
      {/* NAV */}
      <nav className="nav">
        <a href="#" className="logo">reseller.</a>
        <button className="pill" onClick={scrollToCta}>Get Access</button>
      </nav>

      {/* ① HERO — clothes pile */}
      <section className="hero">
        <div className="hero-left">
          <div className="hero-badge">
            <span className="badge-dot" />
            AI-Powered Reselling · Now in Beta
          </div>
          <h1>
            your pile<br />
            is <em>money</em><br />
            waiting. 💸
          </h1>
          <p className="hero-sub">
            Please allow <strong>Scout</strong>, <strong>Studio</strong> &amp; <strong>Closer</strong> to turn your stuff into cash — automatically.
          </p>
          <div className="hero-ctas">
            <button className="pill pill-big" onClick={scrollToCta}>Join Waitlist</button>
            <button className="pill pill-big pill-outline" onClick={() => document.getElementById('agents')?.scrollIntoView({ behavior: 'smooth' })}>See How</button>
          </div>
          <p className="hero-fine">We will never save or store your location data.</p>
        </div>
        <div className="hero-right">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/closet.avif" alt="A reseller surrounded by a massive pile of clothes" className="fill-img" />
          <div className="hero-right-overlay" />
          <span className="hero-tag">before reseller.</span>
        </div>
      </section>

      {/* TICKER */}
      <div className="ticker-wrap" aria-hidden="true">
        <div className="ticker-track">
          {['market research','video generation','auto-listing','offer handling','calendar sync','depop + fb marketplace'].flatMap((t, i) => [
            <span key={`a${i}`} className="tick">{t} <span className="tick-dot">●</span></span>,
            <span key={`b${i}`} className="tick">{t} <span className="tick-dot">●</span></span>,
          ])}
        </div>
      </div>

      {/* ② SNEAKER — Scout */}
      <section className="photo-section">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/sneaker.avif" alt="Person holding Nike Air Jordan sneakers" className="fill-img photo-img" />
        <div className="photo-overlay photo-overlay--bottom" />
        <div className="photo-content photo-content--split">
          <div className="photo-text">
            <div className="section-label">Agent 01 — Scout</div>
            <h2 className="big-head" style={{ color: 'var(--white)' }}>
              priced before<br />you post. <em style={{ color: 'var(--pink-2)' }}>always.</em>
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9375rem', lineHeight: 1.65, maxWidth: 400 }}>
              Scout scans live comps on Depop, eBay, and FB Marketplace to find the price that actually sells.
            </p>
          </div>
          <div className="photo-aside">
            <div className="price-badge">$187 <span className="price-label">Scout says</span></div>
            <button className="pill pill-big pill-outline-w">See Scout in action</button>
          </div>
        </div>
      </section>

      {/* ③ AGENTS */}
      <section className="agents-section" id="agents">
        <div className="section-label">the pipeline</div>
        <h2 className="big-head">three agents.<br /><em>one system.</em> 🤖</h2>
        <div className="agents-grid">
          {[
            { icon: '🔍', cls: 'c-blue',  num: '01', name: 'scout',  desc: 'Prices your item against live market data across every major resale platform before you post a single photo.', tags: ['Price Analysis','Demand Score','Comp Watch'] },
            { icon: '🎬', cls: 'c-pink',  num: '02', name: 'studio', desc: 'Writes the listing, generates a short product video, and posts everywhere simultaneously.', tags: ['Video Gen','SEO Copy','Auto-Post','Supabase'] },
            { icon: '🤝', cls: 'c-yell',  num: '03', name: 'closer', desc: 'Lives in your DMs. Scores every offer, counters when needed, books the meetup from your calendar automatically.', tags: ['Auto-DM','Offer Scoring','Calendar Sync'] },
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

      {/* ④ BLAZER — Studio */}
      <section className="photo-section">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/blazer.avif" alt="Hot pink blazer on a rack" className="fill-img photo-img" />
        <div className="photo-overlay photo-overlay--left" />
        <div className="photo-content photo-content--left">
          <div className="section-label" style={{ color: 'rgba(255,255,255,0.45)' }}>Agent 02 — Studio</div>
          <h2 className="big-head" style={{ color: 'var(--white)' }}>
            studio<br /><em style={{ color: 'var(--pink-2)' }}>creates.</em> 🎬
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9375rem', lineHeight: 1.65, maxWidth: 420, marginBottom: '2rem' }}>
            Snap three photos. Studio writes a listing, generates a 15-second product video, and posts it across every platform.
          </p>
          <button className="pill pill-big" style={{ background: 'var(--pink-2)' }}>See Studio in action</button>
        </div>
        <div className="phone-wrap">
          <div className="phone">
            <div className="phone-pill" />
            <div className="phone-screen">
              <div className="phone-status">● Studio · Generating...</div>
              <div className="phone-item">🧥</div>
              <div className="phone-prog-w"><div className="phone-prog" /></div>
              <div className="phone-copy">&quot;Hot pink blazer, perfect condition. Worn once. Fits a size 6–8.&quot;</div>
              <div className="phone-tags">
                {['vintage','blazer','y2k','pink'].map((t, i) => (
                  <span key={t} className="phone-tag" style={{ animationDelay: `${1.5 + i * 0.4}s` }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ⑤ POLAROIDS — Closer */}
      <section className="photo-section photo-section--tall">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/polaroids.avif" alt="Fashion polaroid photos and jewelry" className="fill-img photo-img" />
        <div className="photo-overlay photo-overlay--full" />
        <div className="photo-content photo-content--bottom-split">
          <div>
            <div className="section-label" style={{ color: 'rgba(255,255,255,0.45)' }}>Agent 03 — Closer</div>
            <h2 className="big-head" style={{ color: 'var(--white)' }}>
              closer<br /><em style={{ color: 'var(--pink-2)' }}>negotiates.</em> 💬
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', lineHeight: 1.65, maxWidth: 380, marginBottom: '1.75rem' }}>
              Every offer handled. Closer reads the message, scores the deal, writes the counter — and books the meetup from your calendar.
            </p>
            <button className="pill pill-big" onClick={scrollToCta}>Start for free</button>
          </div>
          <div>
            <div className="dm-thread">
              <div className="dm dm-buyer">&quot;hey is $50 the lowest you can go?&quot;</div>
              <div className="dm dm-ai">I can do $62 — priced under comps. Meet Saturday in Williamsburg? 🤝</div>
              <div className="dm dm-buyer">&quot;deal! saturday works 🙌&quot;</div>
            </div>
            <canvas ref={waveRef} width={340} height={52} style={{ display: 'block', marginTop: '1.5rem' }} />
          </div>
        </div>
      </section>

      {/* ⑥ STATS */}
      <section className="stats-section">
        <div className="stat-cell"><div className="stat-num">3×</div><div className="stat-lbl">more listings per hour</div></div>
        <div className="stat-cell"><div className="stat-num">0</div><div className="stat-lbl">DMs you ever type</div></div>
        <div className="stat-cell"><div className="stat-num">↑24%</div><div className="stat-lbl">avg sale price with scout</div></div>
      </section>

      {/* ⑦ FLATLAY — CTA */}
      <section className="photo-section photo-section--cta">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/flatlay.avif" alt="Luxury resale items flatlay" className="fill-img photo-img" />
        <div className="photo-overlay photo-overlay--pink" />
        <div className="photo-content photo-content--center">
          <h2 className="big-head" style={{ color: 'var(--white)', textAlign: 'center' }}>
            your stuff,<br /><em style={{ color: 'var(--yellow)' }}>sold.</em> ✨<br />while you sleep.
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.9375rem', lineHeight: 1.65, maxWidth: 360, textAlign: 'center', margin: '0 auto 2.5rem' }}>
            Join the waitlist. Opening access platform by platform, starting with Depop and FB Marketplace.
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

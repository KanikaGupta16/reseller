'use client'
import { useState } from 'react'
import Link from 'next/link'
import UploadTab   from './components/UploadTab'
import PricingTab  from './components/PricingTab'
import ListingTab  from './components/ListingTab'
import ActiveTab   from './components/ActiveTab'
import MessengerTab from './components/MessengerTab'

type Tab = 'upload' | 'pricing' | 'listing' | 'active' | 'messenger'

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'upload',    label: 'upload',    emoji: '📷' },
  { id: 'pricing',   label: 'pricing',   emoji: '🔍' },
  { id: 'listing',   label: 'listing',   emoji: '🎬' },
  { id: 'active',    label: 'active',    emoji: '📦' },
  { id: 'messenger', label: 'messenger', emoji: '💬' },
]

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>('upload')
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="db-root">
      {/* Nav */}
      <nav className="db-nav">
        <Link href="/" className="db-nav-logo">reseller.</Link>
        <div className="db-nav-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`db-nav-tab ${tab === t.id ? 'db-nav-tab--active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="db-nav-tab-emoji">{t.emoji}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <Link href="/" className="db-pill db-pill--sm db-pill--outline" style={{ fontSize: '0.65rem' }}>
          ← back
        </Link>
      </nav>

      {/* Content */}
      <main className="db-main">
        <div className="db-page-header">
          <h1 className="db-page-title">
            {TABS.find(t => t.id === tab)?.emoji} {TABS.find(t => t.id === tab)?.label}
          </h1>
        </div>

        <div className="db-content">
          {tab === 'upload'    && <UploadTab   key={refreshKey} onSaved={() => setRefreshKey(k => k + 1)} />}
          {tab === 'pricing'   && <PricingTab  key={refreshKey} />}
          {tab === 'listing'   && <ListingTab  key={refreshKey} />}
          {tab === 'active'    && <ActiveTab   key={refreshKey} />}
          {tab === 'messenger' && <MessengerTab />}
        </div>
      </main>
    </div>
  )
}

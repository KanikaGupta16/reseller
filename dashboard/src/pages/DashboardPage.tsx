import { useState } from "react";
import { Link } from "react-router-dom";
import PhotoUploader from "../components/PhotoUploader";
import ItemsTable from "../components/ItemsTable";
import PriceInfo from "../components/PriceInfo";
import ListingBuilder from "../components/ListingBuilder";
import ActiveListings from "../components/ActiveListings";
import MessengerChat from "../components/MessengerChat";

type Tab = "upload" | "price-info" | "listing-builder" | "active-listings" | "messenger";

const TABS: { key: Tab; label: string; emoji: string; accent: string; sub: string }[] = [
  { key: "upload",          label: "Upload",    emoji: "📷", accent: "accent-upload",    sub: "Add items & manage inventory" },
  { key: "price-info",      label: "Pricing",   emoji: "🔍", accent: "accent-pricing",   sub: "Scout live market comps" },
  { key: "listing-builder", label: "Listing",   emoji: "🎬", accent: "accent-listing",   sub: "Build & publish listings" },
  { key: "active-listings", label: "Active",    emoji: "📦", accent: "accent-active",    sub: "Live listings across platforms" },
  { key: "messenger",       label: "Messenger", emoji: "💬", accent: "accent-messenger", sub: "Buyer DMs & negotiations" },
];

export default function DashboardPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<Tab>("upload");
  const current = TABS.find((t) => t.key === tab)!;

  return (
    <div className="db-root">

      {/* ── NAV: logo left · pill tabs centred · back right ── */}
      <nav className="db-nav">
        <Link to="/" className="db-nav-logo">reseller.</Link>

        <div className="db-nav-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`db-nav-tab ${tab === t.key ? "db-nav-tab--active" : ""}`}
              aria-selected={tab === t.key}
            >
              <span className="db-nav-tab-emoji">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>

        <Link to="/" className="db-nav-back">← Back</Link>
      </nav>

      {/* ── MAIN CONTENT ── */}
      <main className="db-main">

        {/* Section header — consistent across all tabs */}
        <div className="db-section-header" style={{ marginBottom: "2rem" }}>
          <div className="db-section-title-group">
            <div className={`db-section-accent ${current.accent}`} />
            <div>
              <div className="db-section-title">{current.label}</div>
              <div className="db-section-subtitle">{current.sub}</div>
            </div>
          </div>
        </div>

        {/* Upload tab */}
        {tab === "upload" && (
          <>
            <section style={{ marginBottom: "2.5rem" }}>
              <PhotoUploader onItemSaved={() => setRefreshKey((k) => k + 1)} />
            </section>

            <section>
              <div className="db-section-header">
                <div className="db-section-title-group">
                  <div className="db-section-accent accent-upload" style={{ height: 20 }} />
                  <div className="db-section-title" style={{ fontSize: "1.125rem" }}>Inventory</div>
                </div>
                <span className="db-section-subtitle">All uploaded items</span>
              </div>
              <div className="card table-wrap">
                <ItemsTable refreshKey={refreshKey} />
              </div>
            </section>
          </>
        )}

        {tab === "price-info"      && <PriceInfo />}
        {tab === "listing-builder" && <ListingBuilder />}
        {tab === "active-listings" && <ActiveListings />}
        {tab === "messenger"       && <MessengerChat />}

      </main>
    </div>
  );
}

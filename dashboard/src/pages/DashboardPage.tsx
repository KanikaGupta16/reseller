import { useState } from "react";
import { Link } from "react-router-dom";
import PhotoUploader from "../components/PhotoUploader";
import ItemsTable from "../components/ItemsTable";
import PriceInfo from "../components/PriceInfo";
import ListingBuilder from "../components/ListingBuilder";
import ActiveListings from "../components/ActiveListings";
import MessengerChat from "../components/MessengerChat";

type Tab = "upload" | "price-info" | "listing-builder" | "active-listings" | "messenger";

const TABS: { key: Tab; label: string; emoji: string }[] = [
  { key: "upload", label: "upload", emoji: "📷" },
  { key: "price-info", label: "pricing", emoji: "🔍" },
  { key: "listing-builder", label: "listing", emoji: "🎬" },
  { key: "active-listings", label: "active", emoji: "📦" },
  { key: "messenger", label: "messenger", emoji: "💬" },
];

export default function DashboardPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<Tab>("upload");

  return (
    <div className="db-root">
      <nav className="db-nav">
        <Link to="/" className="db-nav-logo">reseller.</Link>
        <div className="db-nav-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`db-nav-tab ${tab === t.key ? "db-nav-tab--active" : ""}`}
            >
              <span className="db-nav-tab-emoji">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="db-main">
        {tab === "upload" && (
          <>
            <section style={{ marginBottom: 40 }}>
              <PhotoUploader onItemSaved={() => setRefreshKey((k) => k + 1)} />
            </section>
            <section>
              <h2 style={{ fontSize: 20, marginBottom: 16, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "lowercase" }}>inventory</h2>
              <ItemsTable refreshKey={refreshKey} />
            </section>
          </>
        )}

        {tab === "price-info" && <PriceInfo />}
        {tab === "listing-builder" && <ListingBuilder />}
        {tab === "active-listings" && <ActiveListings />}
        {tab === "messenger" && <MessengerChat />}
      </main>
    </div>
  );
}

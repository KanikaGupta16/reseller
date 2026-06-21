import { useState } from "react";
import PhotoUploader from "./components/PhotoUploader";
import ItemsTable from "./components/ItemsTable";
import PriceInfo from "./components/PriceInfo";
import ListingBuilder from "./components/ListingBuilder";
import ActiveListings from "./components/ActiveListings";
import MessengerChat from "./components/MessengerChat";

type Tab = "upload" | "price-info" | "listing-builder" | "active-listings" | "messenger";

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<Tab>("upload");

  return (
    <div style={{ maxWidth: 1060, margin: "0 auto", padding: "24px 16px" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Reseller Dashboard</h1>
        <p style={{ color: "#888", marginTop: 4 }}>
          Upload product photos to auto-identify, catalog, and price items for resale
        </p>
      </header>

      <nav style={{ display: "flex", gap: 0, marginBottom: 32, borderBottom: "1px solid #2a2a3a" }}>
        {([
          { key: "upload" as Tab, label: "Upload & Inventory" },
          { key: "price-info" as Tab, label: "Price Info" },
          { key: "listing-builder" as Tab, label: "Listing Builder" },
          { key: "active-listings" as Tab, label: "Active Listings" },
          { key: "messenger" as Tab, label: "Messenger" },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 24px",
              background: "none",
              border: "none",
              borderBottom: tab === t.key ? "2px solid #4f46e5" : "2px solid transparent",
              color: tab === t.key ? "#e0e0e0" : "#666",
              fontSize: 15,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "upload" && (
        <>
          <section style={{ marginBottom: 40 }}>
            <PhotoUploader onItemSaved={() => setRefreshKey((k) => k + 1)} />
          </section>
          <section>
            <h2 style={{ fontSize: 20, marginBottom: 16 }}>Inventory</h2>
            <ItemsTable refreshKey={refreshKey} />
          </section>
        </>
      )}

      {tab === "price-info" && <PriceInfo />}
      {tab === "listing-builder" && <ListingBuilder />}
      {tab === "active-listings" && <ActiveListings />}
      {tab === "messenger" && <MessengerChat />}
    </div>
  );
}

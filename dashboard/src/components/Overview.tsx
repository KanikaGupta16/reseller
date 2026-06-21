import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface Metrics {
  total: number;
  needsReview: number;   // draft, no listing_price
  inProgress: number;    // research running / media generating
  listed: number;        // has listed_on entries
  sold: number;          // status = sold
  totalRevenue: number;
}

interface RecentItem {
  id: string;
  title: string;
  image_url: string | null;
  category: string;
  condition: string;
  listing_price: number | null;
  listed_on: string[] | null;
  created_at: string;
}

const STAT_CARDS = [
  { key: "total",       label: "Total Items",    emoji: "📦", color: "var(--black)",   bg: "var(--gray)" },
  { key: "needsReview", label: "Needs Review",   emoji: "👀", color: "#92400e",        bg: "#fef3c7" },
  { key: "inProgress",  label: "In Progress",    emoji: "🔄", color: "#1e40af",        bg: "#dbeafe" },
  { key: "listed",      label: "Listed",         emoji: "✅", color: "#166534",        bg: "#dcfce7" },
  { key: "sold",        label: "Sold",           emoji: "🎉", color: "var(--black)",   bg: "var(--yellow)" },
];

export default function Overview({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [recent, setRecent]   = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: items } = await supabase
        .from("items")
        .select("id, title, image_url, category, condition, listing_price, listed_on, created_at, status")
        .order("created_at", { ascending: false });

      if (!items) { setLoading(false); return; }

      const m: Metrics = {
        total:       items.length,
        needsReview: items.filter(i => !i.listing_price && !(i.listed_on?.length)).length,
        inProgress:  items.filter(i => i.listing_price && !(i.listed_on?.length)).length,
        listed:      items.filter(i => i.listed_on?.length > 0 && i.status !== "sold").length,
        sold:        items.filter(i => i.status === "sold").length,
        totalRevenue: items
          .filter(i => i.status === "sold" && i.listing_price)
          .reduce((acc, i) => acc + (i.listing_price ?? 0), 0),
      };

      setMetrics(m);
      setRecent(items.slice(0, 6) as RecentItem[]);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return (
    <div className="empty">
      <div className="spinner" />
      <span>Loading overview…</span>
    </div>
  );

  if (!metrics) return (
    <div className="empty">
      <span className="empty-icon">📊</span>
      <span>No data yet — upload your first item to get started.</span>
      <button className="btn btn-primary btn-sm" onClick={() => onNavigate("upload")}>Upload Item</button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "1rem" }}>
        {STAT_CARDS.map(s => {
          const val = metrics[s.key as keyof Metrics] as number;
          return (
            <div key={s.key} className="card" style={{ cursor: "pointer", transition: "transform 0.12s" }}
              onClick={() => {
                if (s.key === "needsReview" || s.key === "inProgress") onNavigate("price-info");
                if (s.key === "listed" || s.key === "sold") onNavigate("active-listings");
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "none")}
            >
              <div className="card-body" style={{ textAlign: "center" }}>
                <div style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: s.bg, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "1.375rem", margin: "0 auto 0.875rem"
                }}>{s.emoji}</div>
                <div style={{ fontSize: "2rem", fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1, color: s.color }}>
                  {s.key === "totalRevenue" ? `$${val.toLocaleString()}` : val}
                </div>
                <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginTop: "0.375rem" }}>
                  {s.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Revenue highlight */}
      {metrics.totalRevenue > 0 && (
        <div className="card" style={{ background: "var(--black)", border: "none" }}>
          <div className="card-body" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginBottom: "0.5rem" }}>
                Total Revenue
              </div>
              <div style={{ fontSize: "clamp(2rem,4vw,3.5rem)", fontWeight: 900, letterSpacing: "-0.04em", color: "var(--yellow)", lineHeight: 1 }}>
                ${metrics.totalRevenue.toLocaleString()}
              </div>
            </div>
            <div style={{ fontSize: "3rem", opacity: 0.3 }}>💰</div>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <div style={{ fontWeight: 900, fontSize: "1.125rem", letterSpacing: "-0.02em", marginBottom: "1rem" }}>Quick Actions</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.875rem" }}>
          {[
            { label: "Upload New Item",   emoji: "📷", tab: "upload",          desc: "Add photos to analyse" },
            { label: "Check Pricing",     emoji: "🔍", tab: "price-info",      desc: `${metrics.inProgress} items awaiting research` },
            { label: "Build a Listing",   emoji: "🎬", tab: "listing-builder", desc: "Edit & publish to marketplace" },
            { label: "View Active",       emoji: "📦", tab: "active-listings", desc: `${metrics.listed} live listings` },
            { label: "Open Messenger",    emoji: "💬", tab: "messenger",       desc: "Reply to buyer messages" },
          ].map(a => (
            <div key={a.tab} className="card" style={{ cursor: "pointer", transition: "transform 0.12s, box-shadow 0.12s" }}
              onClick={() => onNavigate(a.tab)}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = ""; }}
            >
              <div className="card-body" style={{ display: "flex", gap: "0.875rem", alignItems: "center" }}>
                <div style={{ fontSize: "1.5rem", flexShrink: 0 }}>{a.emoji}</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: "var(--text-sm)", letterSpacing: "-0.01em" }}>{a.label}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--muted)", marginTop: "0.125rem" }}>{a.desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent items */}
      {recent.length > 0 && (
        <div>
          <div style={{ fontWeight: 900, fontSize: "1.125rem", letterSpacing: "-0.02em", marginBottom: "1rem" }}>Recent Items</div>
          <div className="card table-wrap">
            <table>
              <thead><tr>
                <th>Item</th><th>Category</th><th>Condition</th><th>Price</th><th>Status</th><th>Added</th>
              </tr></thead>
              <tbody>
                {recent.map(item => (
                  <tr key={item.id}>
                    <td style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      {item.image_url
                        ? <img src={item.image_url} alt={item.title} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
                        : <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--gray)", flexShrink: 0 }} />
                      }
                      <span style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{item.title}</span>
                    </td>
                    <td><span className="chip">{item.category}</span></td>
                    <td><span className="chip chip-pink">{item.condition}</span></td>
                    <td style={{ fontWeight: 700 }}>{item.listing_price ? `$${item.listing_price}` : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                    <td>
                      {item.listed_on?.length
                        ? <span className="chip" style={{ background: "#dcfce7", color: "#166534" }}>Listed</span>
                        : item.listing_price
                          ? <span className="chip" style={{ background: "#dbeafe", color: "#1e40af" }}>In Progress</span>
                          : <span className="chip" style={{ background: "#fef3c7", color: "#92400e" }}>Needs Review</span>
                      }
                    </td>
                    <td style={{ color: "var(--muted)", fontSize: "var(--text-xs)" }}>
                      {new Date(item.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

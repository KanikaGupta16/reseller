import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface Metrics {
  total: number; needsReview: number; inProgress: number; listed: number; sold: number; revenue: number;
}
interface RecentItem {
  id: string; title: string; image_url: string | null; category: string;
  condition: string; listing_price: number | null; listed_on: string[] | null;
  created_at: string; status: string | null;
}

// Mock next pickup — wire to calendar API when ready
const NEXT_PICKUP = { date: "Sat 28 Jun", time: "2:00 PM", location: "Williamsburg, Brooklyn" };

const STAT_TILES = [
  { key: "total",       label: "Total Items",   emoji: "📦", cls: "card-stat-black",  nav: "" },
  { key: "needsReview", label: "Needs Review",  emoji: "👀", cls: "card-stat-yellow", nav: "price-info" },
  { key: "inProgress",  label: "In Progress",   emoji: "🔄", cls: "card-stat-blue",   nav: "listing-builder" },
  { key: "listed",      label: "Live Listings", emoji: "✅", cls: "card-stat-green",  nav: "active-listings" },
  { key: "sold",        label: "Sold",          emoji: "🎉", cls: "card-stat-pink",   nav: "active-listings" },
];

const QUICK_ACTIONS = [
  { label: "Upload",    emoji: "📷", tab: "upload",          desc: "Drop photos to analyse" },
  { label: "Pricing",   emoji: "🔍", tab: "price-info",      desc: "Live market comps" },
  { label: "Listing",   emoji: "🎬", tab: "listing-builder", desc: "Build & publish" },
  { label: "Active",    emoji: "📦", tab: "active-listings", desc: "Live on marketplace" },
  { label: "Messenger", emoji: "💬", tab: "messenger",       desc: "Reply to buyers" },
];

const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 style={{ fontWeight: 900, fontSize: "clamp(1.5rem, 2.5vw, 2rem)", letterSpacing: "-0.04em", textTransform: "lowercase", lineHeight: 1, marginBottom: "1.25rem" }}>
    {children}
  </h2>
);

export default function Overview({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [recent,  setRecent]  = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("items").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (!data) { setLoading(false); return; }
      setMetrics({
        total:       data.length,
        needsReview: data.filter(i => !i.listing_price && !i.listed_on?.length).length,
        inProgress:  data.filter(i => i.listing_price  && !i.listed_on?.length).length,
        listed:      data.filter(i => i.listed_on?.length > 0 && i.status !== "sold").length,
        sold:        data.filter(i => i.status === "sold").length,
        revenue:     data.filter(i => i.status === "sold" && i.listing_price).reduce((a, i) => a + (i.listing_price ?? 0), 0),
      });
      setRecent(data.slice(0, 5) as RecentItem[]);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="empty"><div className="spinner" /><span>Loading…</span></div>;

  if (!metrics || metrics.total === 0) return (
    <div className="empty" style={{ minHeight: 300 }}>
      <span className="empty-icon">📦</span>
      <span style={{ fontWeight: 900, fontSize: "1.5rem", letterSpacing: "-0.03em" }}>no items yet.</span>
      <span style={{ color: "var(--muted)" }}>Upload your first item to get started</span>
      <button className="btn btn-primary" onClick={() => onNavigate("upload")}>Upload Item 📷</button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>

      {/* ══ ROW 1: stat tiles + pickup ══ */}
      <div>
        <H2>at a glance.</H2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr) 1.4fr", gap: "1rem" }}>

          {/* 5 metric tiles */}
          {STAT_TILES.map(s => {
            const val = metrics[s.key as keyof Metrics] as number;
            return (
              <div key={s.key} className={`card-stat ${s.cls}`}
                onClick={() => s.nav && onNavigate(s.nav)}
                style={{ cursor: s.nav ? "pointer" : "default", minHeight: 160 }}
              >
                {/* Label top */}
                <div style={{ fontSize: "var(--text-xs)", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6 }}>
                  {s.label}
                </div>
                {/* Value + emoji right */}
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "auto" }}>
                  <div style={{ fontSize: "clamp(2.5rem,4vw,3.75rem)", fontWeight: 900, letterSpacing: "-0.05em", lineHeight: 1 }}>
                    {val}
                  </div>
                  <div style={{ fontSize: "2.25rem", lineHeight: 1, flexShrink: 0 }}>{s.emoji}</div>
                </div>
              </div>
            );
          })}

          {/* Next pickup tile */}
          <div style={{
            background: "var(--black)", borderRadius: "var(--radius-md)", padding: "1.75rem",
            display: "flex", flexDirection: "column", gap: "0.5rem", minHeight: 160,
            cursor: "pointer", transition: "transform 0.14s",
          }}
            onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-3px)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "")}
          >
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>
              Next Pickup
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "auto" }}>
              <div>
                <div style={{ fontSize: "1.5rem", fontWeight: 900, letterSpacing: "-0.04em", color: "var(--yellow)", lineHeight: 1 }}>
                  {NEXT_PICKUP.date}
                </div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "rgba(255,255,255,0.7)", marginTop: "0.25rem" }}>
                  {NEXT_PICKUP.time}
                </div>
                <div style={{ fontSize: "var(--text-xs)", color: "rgba(255,255,255,0.4)", marginTop: "0.375rem", fontWeight: 600 }}>
                  📍 {NEXT_PICKUP.location}
                </div>
              </div>
              <div style={{ fontSize: "2rem", opacity: 0.3 }}>📅</div>
            </div>
          </div>
        </div>
      </div>

      {/* ══ ROW 2: revenue + quick actions ══ */}
      <div style={{ display: "grid", gridTemplateColumns: metrics.revenue > 0 ? "1fr 2fr" : "1fr", gap: "1rem" }}>

        {/* Revenue */}
        {metrics.revenue > 0 && (
          <div style={{
            background: "var(--black)", borderRadius: "var(--radius-md)", padding: "2rem",
            display: "flex", flexDirection: "column", justifyContent: "space-between",
          }}>
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>
              Total Revenue
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <div style={{ fontSize: "clamp(2.5rem,5vw,4rem)", fontWeight: 900, letterSpacing: "-0.05em", color: "var(--yellow)", lineHeight: 1 }}>
                ${metrics.revenue.toLocaleString()}
              </div>
              <div style={{ fontSize: "3rem", opacity: 0.15 }}>💰</div>
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div>
          <H2>quick actions.</H2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.75rem" }}>
            {QUICK_ACTIONS.map(a => (
              <div key={a.tab} className="card"
                style={{ cursor: "pointer", transition: "transform 0.14s, box-shadow 0.14s" }}
                onClick={() => onNavigate(a.tab)}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 10px 30px rgba(0,0,0,0.1)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
              >
                <div className="card-body" style={{ padding: "1.25rem", textAlign: "center" }}>
                  <div style={{ fontSize: "1.875rem", marginBottom: "0.5rem" }}>{a.emoji}</div>
                  <div style={{ fontWeight: 900, fontSize: "var(--text-sm)", letterSpacing: "-0.02em", textTransform: "lowercase" }}>{a.label}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--muted)", marginTop: "0.2rem" }}>{a.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ ROW 3: recent items ══ */}
      {recent.length > 0 && (
        <div>
          <H2>recent items.</H2>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Item</th><th>Category</th><th>Condition</th><th>Price</th><th>Status</th><th>Added</th>
              </tr></thead>
              <tbody>
                {recent.map(item => {
                  const s = item.listed_on?.length
                    ? { label: "Listed",      cls: "chip-green"  }
                    : item.listing_price
                      ? { label: "In Progress", cls: "chip-blue"  }
                      : { label: "Needs Review",cls: "chip-yellow"};
                  return (
                    <tr key={item.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          {item.image_url
                            ? <img src={item.image_url} alt={item.title} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
                            : <div style={{ width: 44, height: 44, borderRadius: 8, background: "var(--gray)", flexShrink: 0 }} />
                          }
                          <span style={{ fontWeight: 700 }}>{item.title}</span>
                        </div>
                      </td>
                      <td><span className="chip">{item.category}</span></td>
                      <td><span className="chip chip-pink">{item.condition}</span></td>
                      <td style={{ fontWeight: 800 }}>{item.listing_price ? `$${item.listing_price}` : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                      <td><span className={`chip ${s.cls}`}>{s.label}</span></td>
                      <td style={{ color: "var(--muted)", fontSize: "var(--text-xs)" }}>{new Date(item.created_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

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

const NEXT_PICKUP = { date: "Sat 28 Jun", time: "2:00 PM", location: "Williamsburg, Brooklyn" };

const STAT_TILES = [
  { key: "total",       label: "Total Items",   sub: "All uploaded",        emoji: "📦", cls: "card-stat-black",  nav: "" },
  { key: "needsReview", label: "Needs Review",  sub: "Awaiting pricing",    emoji: "👀", cls: "card-stat-yellow", nav: "price-info" },
  { key: "inProgress",  label: "In Progress",   sub: "Ready to publish",    emoji: "🔄", cls: "card-stat-blue",   nav: "listing-builder" },
  { key: "listed",      label: "Live Listings", sub: "On marketplace",      emoji: "✅", cls: "card-stat-green",  nav: "active-listings" },
  { key: "sold",        label: "Sold",          sub: "Deals closed",        emoji: "🎉", cls: "card-stat-pink",   nav: "active-listings" },
];

const QUICK_ACTIONS = [
  { label: "Upload",    emoji: "📷", tab: "upload",          desc: "Drop photos to analyse" },
  { label: "Pricing",   emoji: "🔍", tab: "price-info",      desc: "Live market comps" },
  { label: "Listing",   emoji: "🎬", tab: "listing-builder", desc: "Build & publish" },
  { label: "Active",    emoji: "📦", tab: "active-listings", desc: "Live on marketplace" },
  { label: "Messenger", emoji: "💬", tab: "messenger",       desc: "Reply to buyers" },
];

/* Section header matching the nav "Overview" style */
const SectionHead = ({ accent, title, subtitle }: { accent: string; title: string; subtitle: string }) => (
  <div className="db-section-header" style={{ marginBottom: "1.25rem" }}>
    <div className="db-section-title-group">
      <div className={`db-section-accent ${accent}`} />
      <div>
        <div className="db-section-title">{title}</div>
        <div className="db-section-subtitle">{subtitle}</div>
      </div>
    </div>
  </div>
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

      {/* ══ Stats: 2 rows × 3 cols ══ */}
      <div>
        <SectionHead accent="accent-overview" title="At a Glance" subtitle="Your reselling in numbers" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>

          {/* 5 metric tiles */}
          {STAT_TILES.map(s => {
            const val = metrics[s.key as keyof Metrics] as number;
            return (
              <div key={s.key} className={`card-stat ${s.cls}`}
                onClick={() => s.nav && onNavigate(s.nav)}
                style={{ cursor: s.nav ? "pointer" : "default", minHeight: 150 }}
              >
                <div style={{ fontSize: "var(--text-xs)", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.55 }}>
                  {s.label}
                </div>
                <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, opacity: 0.4, marginTop: "0.125rem" }}>{s.sub}</div>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "auto", paddingTop: "1rem" }}>
                  <div style={{ fontSize: "clamp(3rem,5vw,4.5rem)", fontWeight: 900, letterSpacing: "-0.06em", lineHeight: 1 }}>
                    {val}
                  </div>
                  <div style={{ fontSize: "2.5rem", lineHeight: 1, flexShrink: 0 }}>{s.emoji}</div>
                </div>
              </div>
            );
          })}

          {/* Next Pickup tile — 6th cell */}
          <div style={{
            background: "var(--black)", borderRadius: "var(--radius-md)", padding: "1.75rem",
            display: "flex", flexDirection: "column", minHeight: 150,
            cursor: "pointer", transition: "transform 0.14s",
          }}
            onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-3px)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "")}
          >
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)" }}>
              Next Pickup
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "auto", paddingTop: "1rem" }}>
              <div>
                <div style={{ fontSize: "clamp(1.375rem,2.5vw,1.75rem)", fontWeight: 900, letterSpacing: "-0.04em", color: "var(--yellow)", lineHeight: 1 }}>
                  {NEXT_PICKUP.date}
                </div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "rgba(255,255,255,0.7)", marginTop: "0.25rem" }}>
                  {NEXT_PICKUP.time}
                </div>
                <div style={{ fontSize: "var(--text-xs)", color: "rgba(255,255,255,0.38)", marginTop: "0.375rem", fontWeight: 600 }}>
                  📍 {NEXT_PICKUP.location}
                </div>
              </div>
              <div style={{ fontSize: "2rem", opacity: 0.2 }}>📅</div>
            </div>
          </div>
        </div>
      </div>

      {/* ══ Revenue ══ */}
      {metrics.revenue > 0 && (
        <div style={{
          background: "var(--black)", borderRadius: "var(--radius-md)", padding: "2rem",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: "0.5rem" }}>
              Total Revenue
            </div>
            <div style={{ fontSize: "clamp(2.5rem,5vw,4rem)", fontWeight: 900, letterSpacing: "-0.05em", color: "var(--yellow)", lineHeight: 1 }}>
              ${metrics.revenue.toLocaleString()}
            </div>
          </div>
          <div style={{ fontSize: "3.5rem", opacity: 0.15 }}>💰</div>
        </div>
      )}

      {/* ══ Quick Actions ══ */}
      <div>
        <SectionHead accent="accent-upload" title="Quick Actions" subtitle="Jump to any step" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.875rem" }}>
          {QUICK_ACTIONS.map(a => (
            <div key={a.tab} className="card"
              style={{ cursor: "pointer", transition: "transform 0.14s, box-shadow 0.14s" }}
              onClick={() => onNavigate(a.tab)}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 10px 30px rgba(0,0,0,0.08)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
            >
              <div className="card-body" style={{ padding: "1.25rem", textAlign: "center" }}>
                <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>{a.emoji}</div>
                <div style={{ fontWeight: 900, fontSize: "var(--text-sm)", letterSpacing: "-0.02em", textTransform: "lowercase" }}>{a.label}</div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--muted)", marginTop: "0.2rem" }}>{a.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ Recent Items ══ */}
      {recent.length > 0 && (
        <div>
          <SectionHead accent="accent-pricing" title="Recent Items" subtitle="Latest uploads" />
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

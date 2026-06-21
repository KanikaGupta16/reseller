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

const STAT_TILES = [
  { key: "total",       label: "Total Items",  emoji: "📦", cls: "card-stat-black",  nav: "" },
  { key: "needsReview", label: "Needs Review", emoji: "👀", cls: "card-stat-yellow", nav: "price-info" },
  { key: "inProgress",  label: "In Progress",  emoji: "🔄", cls: "card-stat-blue",   nav: "listing-builder" },
  { key: "listed",      label: "Live Listings",emoji: "✅", cls: "card-stat-green",  nav: "active-listings" },
  { key: "sold",        label: "Sold",         emoji: "🎉", cls: "card-stat-pink",   nav: "active-listings" },
];

const QUICK_ACTIONS = [
  { label: "Upload Item",     emoji: "📷", tab: "upload",          desc: "Drop photos to analyse" },
  { label: "Check Pricing",   emoji: "🔍", tab: "price-info",      desc: "Scout live market comps" },
  { label: "Build Listing",   emoji: "🎬", tab: "listing-builder", desc: "Edit & publish" },
  { label: "View Active",     emoji: "📦", tab: "active-listings", desc: "Live on marketplace" },
  { label: "Open Messenger",  emoji: "💬", tab: "messenger",       desc: "Reply to buyers" },
];

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
      <span style={{ fontWeight: 700, fontSize: "1.125rem" }}>No items yet</span>
      <span>Upload your first item to get started</span>
      <button className="btn btn-primary" onClick={() => onNavigate("upload")}>Upload Item 📷</button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

      {/* ── Stat tiles ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "1rem" }}>
        {STAT_TILES.map(s => {
          const val = metrics[s.key as keyof Metrics] as number;
          return (
            <div key={s.key} className={`card-stat ${s.cls}`}
              onClick={() => s.nav && onNavigate(s.nav)}
              style={{ cursor: s.nav ? "pointer" : "default" }}
            >
              <div className="card-stat-icon">{s.emoji}</div>
              <div className="card-stat-val">{val}</div>
              <div className="card-stat-label">{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* ── Revenue banner ── */}
      {metrics.revenue > 0 && (
        <div style={{
          background: "var(--black)", borderRadius: "var(--radius-lg)",
          padding: "2rem 2.5rem", display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <div>
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: "0.5rem" }}>
              Total Revenue
            </div>
            <div style={{ fontSize: "clamp(2.5rem,5vw,4rem)", fontWeight: 900, letterSpacing: "-0.05em", color: "var(--yellow)", lineHeight: 1 }}>
              ${metrics.revenue.toLocaleString()}
            </div>
          </div>
          <div style={{ fontSize: "4rem", opacity: 0.2 }}>💰</div>
        </div>
      )}

      {/* ── Quick actions ── */}
      <div>
        <div style={{ fontWeight: 900, fontSize: "1.25rem", letterSpacing: "-0.03em", marginBottom: "1rem" }}>Quick Actions</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.875rem" }}>
          {QUICK_ACTIONS.map(a => (
            <div key={a.tab} className="card"
              style={{ cursor: "pointer", transition: "transform 0.14s, box-shadow 0.14s" }}
              onClick={() => onNavigate(a.tab)}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 10px 30px rgba(0,0,0,0.1)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
            >
              <div className="card-body" style={{ padding: "1.25rem", textAlign: "center" }}>
                <div style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>{a.emoji}</div>
                <div style={{ fontWeight: 800, fontSize: "var(--text-sm)", letterSpacing: "-0.01em", marginBottom: "0.25rem" }}>{a.label}</div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--muted)" }}>{a.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recent items ── */}
      {recent.length > 0 && (
        <div>
          <div style={{ fontWeight: 900, fontSize: "1.25rem", letterSpacing: "-0.03em", marginBottom: "1rem" }}>Recent Items</div>
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Item</th><th>Category</th><th>Condition</th><th>Price</th><th>Status</th><th>Added</th>
              </tr></thead>
              <tbody>
                {recent.map(item => {
                  const statusLabel = item.listed_on?.length
                    ? { label: "Listed",     cls: "chip-green"  }
                    : item.listing_price
                      ? { label: "In Progress",cls: "chip-blue"  }
                      : { label: "Needs Review",cls: "chip-yellow"};
                  return (
                    <tr key={item.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          {item.image_url
                            ? <img src={item.image_url} alt={item.title} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
                            : <div style={{ width: 44, height: 44, borderRadius: 8, background: "var(--gray)", flexShrink: 0 }} />
                          }
                          <span style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{item.title}</span>
                        </div>
                      </td>
                      <td><span className="chip">{item.category}</span></td>
                      <td><span className="chip chip-pink">{item.condition}</span></td>
                      <td style={{ fontWeight: 800 }}>{item.listing_price ? `$${item.listing_price}` : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                      <td><span className={`chip ${statusLabel.cls}`}>{statusLabel.label}</span></td>
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

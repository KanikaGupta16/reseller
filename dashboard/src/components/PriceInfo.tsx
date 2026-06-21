import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface Item {
  id: string;
  image_url: string | null;
  title: string | null;
  brand: string | null;
  model: string | null;
  category: string | null;
  condition: string | null;
  research_suggested_price: number | null;
  research_range: { low: number; high: number } | null;
  research_confidence: string | null;
  research_reasoning: string | null;
  created_at: string;
}

interface ResearchJob {
  id: string;
  item_id: string;
  status: string;
  step: string | null;
  progress: number;
  sources_status: Record<string, string> | null;
  comps: Comp[] | null;
  result: any;
  error: string | null;
}

interface Comp {
  source: string;
  title: string;
  price: number;
  condition: string;
  url: string;
}

export default function PriceInfo() {
  const [items, setItems] = useState<Item[]>([]);
  const [jobs, setJobs] = useState<Record<string, ResearchJob>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadData = async () => {
    const { data: itemsData } = await supabase
      .from("items")
      .select("*")
      .order("created_at", { ascending: false });

    setItems(itemsData || []);

    if (itemsData && itemsData.length > 0) {
      const { data: jobsData } = await supabase
        .from("research_jobs")
        .select("*")
        .in("item_id", itemsData.map((i: Item) => i.id))
        .order("created_at", { ascending: false });

      const jobMap: Record<string, ResearchJob> = {};
      for (const job of jobsData || []) {
        if (!jobMap[job.item_id]) jobMap[job.item_id] = job;
      }
      setJobs(jobMap);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const startResearch = async (itemId: string) => {
    try {
      if (!import.meta.env.VITE_API_URL) { alert("Backend not connected — run the server locally to start research."); return; }
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      if (res.ok) loadData();
    } catch (err) {
      console.error("Failed to start research:", err);
    }
  };

  if (loading) return <p style={{ color: "#888" }}>Loading price data...</p>;
  if (items.length === 0) return <p style={{ color: "#888" }}>No items yet. Upload products first.</p>;

  return (
    <div>

      {items.map((item) => {
        const job = jobs[item.id];
        const isExpanded = expanded === item.id;
        const isRunning = job && (job.status === "running" || job.status === "queued");
        const hasPrice = item.research_suggested_price != null;

        return (
          <div key={item.id} className="card" style={{ marginBottom: "1rem" }}>
            <div
              style={{ display: "flex", gap: 0, cursor: "pointer" }}
              onClick={() => setExpanded(isExpanded ? null : item.id)}
            >
              {item.image_url && (
                <img
                  src={item.image_url}
                  alt=""
                  style={{ width: 160, height: 160, objectFit: "cover", borderRadius: "14px 0 0 14px", flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0, padding: "1.5rem 1.75rem" }}>
                <div style={{ fontWeight: 900, fontSize: "1.125rem", letterSpacing: "-0.02em", marginBottom: "0.5rem", lineHeight: 1.2 }}>
                  {item.title || "Untitled"}
                </div>
                <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginBottom: "0.875rem" }}>
                  {item.brand    && <span className="chip">{item.brand}</span>}
                  {item.category && <span className="chip">{item.category}</span>}
                  {item.condition && <span className="chip chip-pink">{item.condition}</span>}
                </div>

                {isRunning && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                    <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                    <span style={{ color: "var(--muted)", fontSize: "var(--text-sm)", fontWeight: 600 }}>
                      {job.step || "starting"}… {job.progress}%
                    </span>
                  </div>
                )}

                {hasPrice && (
                  <div style={{ display: "flex", gap: "1.25rem", alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ color: "var(--pink-2)", fontSize: "2rem", fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1 }}>
                      ${item.research_suggested_price}
                    </span>
                    {item.research_range && (
                      <span style={{ color: "var(--muted)", fontSize: "var(--text-sm)", fontWeight: 600 }}>
                        Range: ${item.research_range.low} – ${item.research_range.high}
                      </span>
                    )}
                    {item.research_confidence && (
                      <span className={`chip ${item.research_confidence === "high" ? "chip-green" : item.research_confidence === "medium" ? "chip-yellow" : ""}`}
                        style={{ fontWeight: 700 }}>
                        {item.research_confidence} confidence
                      </span>
                    )}
                  </div>
                )}

                {!hasPrice && !isRunning && (
                  <button onClick={(e) => { e.stopPropagation(); startResearch(item.id); }} className="btn btn-primary btn-sm">
                    Start Research
                  </button>
                )}

                {job?.status === "failed" && (
                  <div style={{ color: "#ef4444", fontSize: 13, marginTop: 4 }}>
                    Failed: {job.error || "Unknown error"}
                    <button onClick={(e) => { e.stopPropagation(); startResearch(item.id); }} className="btn btn-primary" style={{ fontSize: 11, padding: "2px 10px", marginLeft: 8 }}>
                      Retry
                    </button>
                  </div>
                )}
              </div>
              <div style={{ flexShrink: 0, alignSelf: "center", color: "#bbb", fontSize: 18 }}>
                {isExpanded ? "▲" : "▼"}
              </div>
            </div>

            {isExpanded && job && (
              <div style={{ marginTop: 16, borderTop: "1.5px solid rgba(0,0,0,0.08)", paddingTop: 16 }}>
                {item.research_reasoning && (
                  <p style={{ color: "#555", fontSize: 14, margin: "0 0 16px", lineHeight: 1.5 }}>
                    {item.research_reasoning}
                  </p>
                )}

                {job.sources_status && (
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#888" }}>Sources</h4>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {Object.entries(job.sources_status).map(([site, status]) => (
                        <span key={site} style={{
                          fontSize: 12,
                          padding: "4px 10px",
                          borderRadius: 8,
                          background: "#F8F8F8",
                          color: status.includes("found") ? "#16a34a" : "#888",
                          fontWeight: 600,
                        }}>
                          {site}: {status}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {job.comps && job.comps.length > 0 && (
                  <div style={{ borderRadius: 10, border: "1.5px solid rgba(0,0,0,0.08)", overflow: "hidden" }}>
                    <h4 style={{ margin: 0, padding: "0.75rem 0.875rem", fontSize: 13, color: "#888", background: "#F8F8F8" }}>
                      Comparable Listings ({job.comps.length})
                    </h4>
                    <table style={{ fontSize: 13 }}>
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Price</th>
                          <th>Source</th>
                          <th>Condition</th>
                        </tr>
                      </thead>
                      <tbody>
                        {job.comps.map((comp, i) => (
                          <tr key={i}>
                            <td>
                              {comp.url && comp.url !== "#" ? (
                                <a href={comp.url} target="_blank" rel="noreferrer" style={{ color: "#E875BB", textDecoration: "none" }}>
                                  {comp.title}
                                </a>
                              ) : comp.title}
                            </td>
                            <td style={{ color: "#080808", fontWeight: 700 }}>${comp.price}</td>
                            <td>{comp.source}</td>
                            <td>{comp.condition}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

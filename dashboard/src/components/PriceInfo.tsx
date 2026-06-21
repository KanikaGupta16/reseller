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
      const res = await fetch("http://localhost:3001/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      if (res.ok) loadData();
    } catch (err) {
      console.error("Failed to start research:", err);
    }
  };

  if (loading) return <p style={{ color: "#aaa" }}>Loading price data...</p>;
  if (items.length === 0) return <p style={{ color: "#666" }}>No items yet. Upload products first.</p>;

  return (
    <div>
      <h2 style={{ fontSize: 20, marginBottom: 16 }}>Price Research</h2>

      {items.map((item) => {
        const job = jobs[item.id];
        const isExpanded = expanded === item.id;
        const isRunning = job && (job.status === "running" || job.status === "queued");
        const hasPrice = item.research_suggested_price != null;

        return (
          <div key={item.id} className="card" style={{ marginBottom: 16 }}>
            <div
              style={{ display: "flex", gap: 16, cursor: "pointer" }}
              onClick={() => setExpanded(isExpanded ? null : item.id)}
            >
              {item.image_url && (
                <img
                  src={item.image_url}
                  alt=""
                  style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>{item.title || "Untitled"}</h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                  {item.brand && <span className="tag">{item.brand}</span>}
                  {item.category && <span className="tag">{item.category}</span>}
                  {item.condition && <span className="tag">{item.condition}</span>}
                </div>

                {isRunning && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    <span style={{ color: "#aaa", fontSize: 13 }}>
                      {job.step || "starting"}... {job.progress}%
                    </span>
                  </div>
                )}

                {hasPrice && (
                  <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    <span style={{ color: "#4ecdc4", fontSize: 22, fontWeight: 600 }}>
                      ${item.research_suggested_price}
                    </span>
                    {item.research_range && (
                      <span style={{ color: "#888", fontSize: 13 }}>
                        Range: ${item.research_range.low} - ${item.research_range.high}
                      </span>
                    )}
                    {item.research_confidence && (
                      <span style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 10,
                        background: item.research_confidence === "high" ? "#1a3a2a" : item.research_confidence === "medium" ? "#3a3a1a" : "#3a1a1a",
                        color: item.research_confidence === "high" ? "#4ecdc4" : item.research_confidence === "medium" ? "#e0c040" : "#ff6b6b",
                      }}>
                        {item.research_confidence} confidence
                      </span>
                    )}
                  </div>
                )}

                {!hasPrice && !isRunning && (
                  <button onClick={(e) => { e.stopPropagation(); startResearch(item.id); }} className="btn btn-primary" style={{ fontSize: 12, padding: "4px 12px" }}>
                    Start Research
                  </button>
                )}

                {job?.status === "failed" && (
                  <div style={{ color: "#ff6b6b", fontSize: 13, marginTop: 4 }}>
                    Failed: {job.error || "Unknown error"}
                    <button onClick={(e) => { e.stopPropagation(); startResearch(item.id); }} className="btn btn-primary" style={{ fontSize: 11, padding: "2px 10px", marginLeft: 8 }}>
                      Retry
                    </button>
                  </div>
                )}
              </div>
              <div style={{ flexShrink: 0, alignSelf: "center", color: "#555", fontSize: 18 }}>
                {isExpanded ? "▲" : "▼"}
              </div>
            </div>

            {isExpanded && job && (
              <div style={{ marginTop: 16, borderTop: "1px solid #2a2a3a", paddingTop: 16 }}>
                {item.research_reasoning && (
                  <p style={{ color: "#ccc", fontSize: 14, margin: "0 0 16px", lineHeight: 1.5 }}>
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
                          background: "#1a1a24",
                          color: status.includes("found") ? "#4ecdc4" : "#888",
                        }}>
                          {site}: {status}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {job.comps && job.comps.length > 0 && (
                  <div>
                    <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "#888" }}>
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
                                <a href={comp.url} target="_blank" rel="noreferrer" style={{ color: "#8888cc", textDecoration: "none" }}>
                                  {comp.title}
                                </a>
                              ) : comp.title}
                            </td>
                            <td style={{ color: "#4ecdc4" }}>${comp.price}</td>
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

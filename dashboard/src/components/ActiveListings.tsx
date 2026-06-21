import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface Item {
  id: string;
  image_url: string | null;
  title: string | null;
  brand: string | null;
  category: string | null;
  condition: string | null;
  description: string | null;
  location: string | null;
  listing_price: number | null;
  research_suggested_price: number | null;
  meetup_preferences: { door_pickup: boolean; door_dropoff: boolean; public_meetup: boolean } | null;
  media_urls: string[] | null;
  listed_on: string[] | null;
  status: string | null;
  pending_buyer: string | null;
  created_at: string;
}

export default function ActiveListings() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("items")
      .select("*")
      .not("listed_on", "is", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setItems((data || []).filter((i: Item) => i.listed_on && i.listed_on.length > 0));
        setLoading(false);
      });
  }, []);

  if (loading) return <p style={{ color: "#888" }}>Loading active listings...</p>;
  if (items.length === 0) return <p style={{ color: "#888" }}>No active listings yet. Publish items from the Listing Builder tab.</p>;

  return (
    <div>

      {items.map((item) => (
        <div key={item.id} className="card" style={{ display: "flex", gap: "1.25rem", padding: "1.25rem", marginBottom: "1rem" }}>
          {item.image_url && (
            <img src={item.image_url} alt="" style={{ width: 100, height: 100, objectFit: "cover", borderRadius: "var(--radius-md)", flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem" }}>
              <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 800, letterSpacing: "-0.02em" }}>{item.title || "Untitled"}</h3>
              <span style={{
                fontSize: "var(--text-xs)",
                padding: "0.15rem 0.5rem",
                borderRadius: "var(--radius-sm)",
                fontWeight: 700,
                background: item.status === "pending" ? "rgba(251,191,36,0.15)" : "rgba(34,197,94,0.15)",
                color: item.status === "pending" ? "#facc15" : "#4ade80",
              }}>
                {item.status === "pending" ? `Pending${item.pending_buyer ? ` — ${item.pending_buyer}` : ""}` : "Available"}
              </span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
              {item.brand && <span className="tag">{item.brand}</span>}
              {item.category && <span className="tag">{item.category}</span>}
              {item.condition && <span className="tag">{item.condition}</span>}
            </div>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ color: "#E875BB", fontSize: "1.25rem", fontWeight: 900 }}>
                ${item.listing_price ?? item.research_suggested_price ?? "—"}
              </span>
              {item.location && <span style={{ color: "var(--muted)", fontSize: "var(--text-sm)" }}>{item.location}</span>}
            </div>
            {item.description && (
              <p style={{ margin: "0 0 0.5rem", color: "var(--muted)", fontSize: "var(--text-sm)", lineHeight: 1.5 }}>
                {item.description.length > 150 ? item.description.slice(0, 150) + "..." : item.description}
              </p>
            )}
            {item.meetup_preferences && (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {item.meetup_preferences.door_pickup && <span className="chip">Door Pickup</span>}
                {item.meetup_preferences.door_dropoff && <span className="chip">Door Dropoff</span>}
                {item.meetup_preferences.public_meetup && <span className="chip">Public Meetup</span>}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

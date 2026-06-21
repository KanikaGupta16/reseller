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
      <h2 style={{ fontSize: 20, marginBottom: 16 }}>Active Listings</h2>

      {items.map((item) => (
        <div key={item.id} className="card" style={{ display: "flex", gap: 16, marginBottom: 12 }}>
          {item.image_url && (
            <img src={item.image_url} alt="" style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>{item.title || "Untitled"}</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              {item.brand && <span className="tag">{item.brand}</span>}
              {item.category && <span className="tag">{item.category}</span>}
              {item.condition && <span className="tag">{item.condition}</span>}
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 6 }}>
              <span style={{ color: "#E875BB", fontSize: 20, fontWeight: 900 }}>
                ${item.listing_price ?? item.research_suggested_price ?? "—"}
              </span>
              {item.location && <span style={{ color: "#888", fontSize: 13 }}>{item.location}</span>}
            </div>
            {item.description && (
              <p style={{ margin: "0 0 6px", color: "#555", fontSize: 13, lineHeight: 1.4 }}>
                {item.description.length > 150 ? item.description.slice(0, 150) + "..." : item.description}
              </p>
            )}
            {item.meetup_preferences && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                {item.meetup_preferences.door_pickup && <span className="chip">Door Pickup</span>}
                {item.meetup_preferences.door_dropoff && <span className="chip">Door Dropoff</span>}
                {item.meetup_preferences.public_meetup && <span className="chip">Public Meetup</span>}
              </div>
            )}
          </div>
          <div style={{ flexShrink: 0, alignSelf: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {item.listed_on?.map((platform) => (
                <span key={platform} style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: platform === "facebook" ? "#1877f2" : "#080808",
                  color: "#fff",
                  textAlign: "center",
                  fontWeight: 600,
                }}>
                  {platform === "facebook" ? "Facebook" : platform}
                </span>
              ))}
            </div>
            {item.media_urls && item.media_urls.length > 0 && (
              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                {item.media_urls.map((url, i) => (
                  <img key={i} src={url} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 4 }} />
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

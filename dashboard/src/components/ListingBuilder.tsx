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
  description: string | null;
  location: string | null;
  listing_price: number | null;
  research_suggested_price: number | null;
  meetup_preferences: { door_pickup: boolean; door_dropoff: boolean; public_meetup: boolean } | null;
  media_urls: string[] | null;
  media_video_url: string | null;
}

interface ListingOutput {
  title: string;
  price: number;
  category: string;
  condition: string;
  location: string;
  description: string;
  meetup_preferences: { door_pickup: boolean; door_dropoff: boolean; public_meetup: boolean };
}

const CATEGORIES = [
  "Electronics", "Video Games & Consoles", "Clothing", "Shoes", "Accessories",
  "Home & Garden", "Sports & Outdoors", "Toys & Games", "Books", "Auto Parts",
  "Collectibles", "Jewelry", "Musical Instruments", "Other",
];

const CONDITIONS = ["New", "Like New", "Good", "Fair", "Poor"];

export default function ListingBuilder() {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ListingOutput>({
    title: "", price: 0, category: "", condition: "",
    location: "", description: "",
    meetup_preferences: { door_pickup: false, door_dropoff: false, public_meetup: false },
  });
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [mediaGenerating, setMediaGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [showJson, setShowJson] = useState(false);

  const loadItems = async () => {
    const { data } = await supabase
      .from("items")
      .select("*")
      .order("created_at", { ascending: false });
    setItems(data || []);
  };

  useEffect(() => {
    loadItems();
  }, []);

  // Poll for media generation status
  useEffect(() => {
    if (!selectedId || !mediaGenerating) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:3001/api/media/status/${selectedId}`);
        const data = await res.json();
        if (data.status === "done" && data.count > 0) {
          setMediaUrls(data.media_urls);
          setVideoUrl(data.video_url);
          setMediaGenerating(false);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedId, mediaGenerating]);

  const selectItem = (item: Item) => {
    setSelectedId(item.id);
    setForm({
      title: item.title || "",
      price: item.listing_price ?? item.research_suggested_price ?? 0,
      category: item.category || "",
      condition: item.condition || "",
      location: item.location || "San Francisco, CA",
      description: item.description || "",
      meetup_preferences: item.meetup_preferences || { door_pickup: false, door_dropoff: false, public_meetup: false },
    });
    setMediaUrls(item.media_urls || []);
    setVideoUrl(item.media_video_url || null);
    setOriginalImageUrl(item.image_url);
    setMediaGenerating(false);
    setShowJson(false);
    setSaveStatus("idle");
  };

  const updateField = (key: string, value: unknown) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaveStatus("idle");
  };

  const toggleMeetup = (key: keyof ListingOutput["meetup_preferences"]) => {
    setForm((f) => ({
      ...f,
      meetup_preferences: { ...f.meetup_preferences, [key]: !f.meetup_preferences[key] },
    }));
    setSaveStatus("idle");
  };

  const triggerMediaGeneration = async () => {
    if (!selectedId) return;
    setMediaGenerating(true);
    setMediaUrls([]);
    try {
      await fetch("http://localhost:3001/api/media/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: selectedId }),
      });
    } catch (err) {
      console.error("Failed to trigger media generation:", err);
      setMediaGenerating(false);
    }
  };

  const saveListing = async () => {
    if (!selectedId) return;
    setSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch("http://localhost:3001/api/listing/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: selectedId,
          title: form.title,
          price: Number(form.price),
          category: form.category,
          condition: form.condition,
          location: form.location,
          description: form.description,
          meetup_preferences: form.meetup_preferences,
        }),
      });
      if (res.ok) {
        setSaveStatus("saved");
        loadItems();
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    }
    setSaving(false);
  };

  const finalOutput = {
    title: form.title,
    price: Number(form.price),
    category: form.category,
    condition: form.condition,
    location: form.location,
    description: form.description,
    meetup_preferences: form.meetup_preferences,
    media: {
      original: originalImageUrl,
      generated_images: mediaUrls,
      video: videoUrl,
    },
  };

  if (!selectedId) {
    return (
      <div>
        <h2 style={{ fontSize: 20, marginBottom: 16 }}>Listing Builder</h2>
        <p style={{ color: "#888", marginBottom: 16 }}>Select an item to build its listing</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {items.map((item) => (
            <div
              key={item.id}
              className="card"
              onClick={() => selectItem(item)}
              style={{ cursor: "pointer", transition: "border-color 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#4f46e5")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2a2a3a")}
            >
              {item.image_url && (
                <img src={item.image_url} alt="" style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />
              )}
              <h4 style={{ margin: "0 0 4px", fontSize: 14 }}>{item.title || "Untitled"}</h4>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {item.category && <span className="tag">{item.category}</span>}
                {(item.media_urls && item.media_urls.length > 0) && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "#1a3a2a", color: "#4ecdc4" }}>
                    {item.media_urls.length} photos
                  </span>
                )}
                {item.listing_price && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "#1e1e30", color: "#8888cc" }}>
                    ${item.listing_price}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        {items.length === 0 && <p style={{ color: "#666" }}>No items yet. Upload products first.</p>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => { setSelectedId(null); loadItems(); }} className="btn" style={{ background: "#222", color: "#aaa" }}>
          ← Back
        </button>
        <h2 style={{ fontSize: 20, margin: 0 }}>Build Listing</h2>
        {saveStatus === "saved" && <span style={{ color: "#4ecdc4", fontSize: 14 }}>Saved</span>}
        {saveStatus === "error" && <span style={{ color: "#ff6b6b", fontSize: 14 }}>Save failed</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Left column: Form */}
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>Listing Details</h3>

            <label style={labelStyle}>Title</label>
            <input style={inputStyle} value={form.title} onChange={(e) => updateField("title", e.target.value)} />

            <label style={labelStyle}>Price ($)</label>
            <input style={inputStyle} type="number" step="0.01" value={form.price} onChange={(e) => updateField("price", parseFloat(e.target.value) || 0)} />

            <label style={labelStyle}>Category</label>
            <select style={inputStyle} value={form.category} onChange={(e) => updateField("category", e.target.value)}>
              <option value="">Select...</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <label style={labelStyle}>Condition</label>
            <select style={inputStyle} value={form.condition} onChange={(e) => updateField("condition", e.target.value)}>
              <option value="">Select...</option>
              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <label style={labelStyle}>Location</label>
            <input style={inputStyle} value={form.location} onChange={(e) => updateField("location", e.target.value)} placeholder="e.g. San Francisco, CA" />

            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: 100, resize: "vertical" }} value={form.description} onChange={(e) => updateField("description", e.target.value)} />

            <label style={labelStyle}>Meetup Preferences</label>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {(["door_pickup", "door_dropoff", "public_meetup"] as const).map((key) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: "#ccc", fontSize: 13 }}>
                  <input type="checkbox" checked={form.meetup_preferences[key]} onChange={() => toggleMeetup(key)} />
                  {key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </label>
              ))}
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button onClick={saveListing} disabled={saving} className="btn btn-primary">
                {saving ? "Saving..." : "Save Listing"}
              </button>
              <button onClick={() => setShowJson(!showJson)} className="btn" style={{ background: "#222", color: "#aaa" }}>
                {showJson ? "Hide" : "View"} JSON
              </button>
            </div>
          </div>

          {showJson && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 14, color: "#888" }}>Final Listing Output</h3>
              <pre style={{ margin: 0, fontSize: 12, color: "#4ecdc4", whiteSpace: "pre-wrap", overflowX: "auto" }}>
                {JSON.stringify(finalOutput, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Right column: Media */}
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>Product Media</h3>

            {/* Original photo */}
            {originalImageUrl && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ ...labelStyle, marginBottom: 8 }}>Original Photo</label>
                <img src={originalImageUrl} alt="Original" style={{ width: "100%", maxHeight: 250, objectFit: "contain", borderRadius: 8, background: "#0d0d14" }} />
              </div>
            )}

            {/* Generated images */}
            <label style={{ ...labelStyle, marginBottom: 8 }}>
              AI-Generated Lifestyle Photo {mediaUrls.length > 0 ? "" : "(0)"}
            </label>

            {mediaGenerating && (
              <div style={{ textAlign: "center", padding: 24, background: "#0d0d14", borderRadius: 8, marginBottom: 12 }}>
                <div className="spinner" />
                <p style={{ color: "#aaa", fontSize: 13, marginTop: 12 }}>
                  Generating lifestyle photo...
                </p>
                <p style={{ color: "#555", fontSize: 11, marginTop: 4 }}>
                  ~15-30 seconds
                </p>
              </div>
            )}

            {mediaUrls.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {mediaUrls.map((url, i) => (
                  <img key={i} src={url} alt="Lifestyle" style={{ width: "100%", borderRadius: 8, marginBottom: 8 }} />
                ))}
              </div>
            )}

            {!mediaGenerating && mediaUrls.length === 0 && (
              <p style={{ color: "#555", fontSize: 13, marginBottom: 12 }}>
                No generated photos yet — they auto-generate on upload, or click below.
              </p>
            )}

            {/* Generate / Regenerate button */}
            {!mediaGenerating && (
              <button onClick={triggerMediaGeneration} className="btn btn-primary" style={{ width: "100%" }}>
                {mediaUrls.length > 0 ? "Regenerate Photo" : "Generate Lifestyle Photo"}
              </button>
            )}

            {mediaUrls.length > 0 && (
              <p style={{ color: "#4ecdc4", fontSize: 11, marginTop: 8, textAlign: "center" }}>
                Images saved to Supabase Storage — available across sessions
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#888",
  marginBottom: 4,
  marginTop: 12,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  background: "#0d0d14",
  border: "1px solid #2a2a3a",
  borderRadius: 6,
  color: "#e0e0e0",
  fontSize: 14,
  marginBottom: 4,
  outline: "none",
};

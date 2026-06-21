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
  min_negotiation_price: number | null;
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

const CONDITIONS = ["New", "Like New", "Good", "Fair"];

export default function ListingBuilder() {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ListingOutput>({
    title: "", price: 0, min_negotiation_price: null, category: "", condition: "",
    location: "", description: "",
    meetup_preferences: { door_pickup: false, door_dropoff: false, public_meetup: false },
  });
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  const [publishing, setPublishing] = useState(false);
  const [publishStep, setPublishStep] = useState("");
  const [publishResult, setPublishResult] = useState<{ success: boolean; message: string } | null>(null);

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

  const selectItem = (item: Item) => {
    setSelectedId(item.id);
    setForm({
      title: item.title || "",
      price: item.listing_price ?? item.research_suggested_price ?? 0,
      min_negotiation_price: null,
      category: item.category || "",
      condition: item.condition || "",
      location: item.location || "San Francisco, CA",
      description: item.description || "",
      meetup_preferences: item.meetup_preferences || { door_pickup: true, door_dropoff: false, public_meetup: false },
    });
    setMediaUrls(item.media_urls || []);
    setOriginalImageUrl(item.image_url);
    setSaveStatus("idle");
    setPublishing(false);
    setPublishStep("");
    setPublishResult(null);
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
          min_negotiation_price: form.min_negotiation_price ?? Math.round(form.price * 0.8),
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

  const publishToFacebook = async () => {
    if (!selectedId) return;
    await saveListing();
    setPublishing(true);
    setPublishStep("starting");
    setPublishResult(null);

    try {
      await fetch("http://localhost:3001/api/publish/facebook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: selectedId }),
      });

      const poll = setInterval(async () => {
        try {
          const res = await fetch(`http://localhost:3001/api/publish/facebook/${selectedId}`);
          const data = await res.json();
          setPublishStep(data.step || "");
          if (data.status === "done" || data.status === "failed") {
            clearInterval(poll);
            setPublishing(false);
            setPublishResult(data.result);
          }
        } catch {}
      }, 3000);
    } catch {
      setPublishing(false);
      setPublishResult({ success: false, message: "Failed to start publish" });
    }
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
              style={{ cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#E875BB"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)"; }}
            >
              {item.image_url && (
                <img src={item.image_url} alt="" style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />
              )}
              <h4 style={{ margin: "0 0 4px", fontSize: 14 }}>{item.title || "Untitled"}</h4>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {item.category && <span className="tag">{item.category}</span>}
                {(item.media_urls && item.media_urls.length > 0) && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 100, background: "#f0fdf4", color: "#16a34a", fontWeight: 600 }}>
                    {item.media_urls.length} photos
                  </span>
                )}
                {item.listing_price && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 100, background: "#FFF0F7", color: "#E875BB", fontWeight: 700 }}>
                    ${item.listing_price}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        {items.length === 0 && <p style={{ color: "#888" }}>No items yet. Upload products first.</p>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => { setSelectedId(null); loadItems(); }} className="btn btn-secondary">
          ← Back
        </button>
        <h2 style={{ fontSize: 20, margin: 0 }}>Build Listing</h2>
        {saveStatus === "saved" && <span style={{ color: "#16a34a", fontSize: 14, fontWeight: 700 }}>Saved</span>}
        {saveStatus === "error" && <span style={{ color: "#ef4444", fontSize: 14, fontWeight: 700 }}>Save failed</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>Listing Details</h3>

            <label style={labelStyle}>Title</label>
            <input style={inputStyle} value={form.title} onChange={(e) => updateField("title", e.target.value)} />

            <label style={labelStyle}>Price ($)</label>
            <input style={inputStyle} type="number" step="0.01" value={form.price} onChange={(e) => updateField("price", parseFloat(e.target.value) || 0)} />

            <label style={labelStyle}>Min Negotiation Price ($)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                style={{ ...inputStyle, marginBottom: 0 }}
                type="number"
                step="0.01"
                value={form.min_negotiation_price ?? Math.round(form.price * 0.8)}
                onChange={(e) => updateField("min_negotiation_price", parseFloat(e.target.value) || 0)}
              />
              {form.min_negotiation_price !== null && (
                <button onClick={() => updateField("min_negotiation_price", null)} className="btn btn-secondary" style={{ fontSize: 11, padding: "6px 10px", whiteSpace: "nowrap" }}>
                  Reset
                </button>
              )}
            </div>
            <span style={{ fontSize: 11, color: "#888", marginTop: 2, display: "block" }}>
              {form.min_negotiation_price === null ? "Auto: 80% of listing price" : "Custom override"}
            </span>

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
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: "#333", fontSize: 13 }}>
                  <input type="checkbox" checked={form.meetup_preferences[key]} onChange={() => toggleMeetup(key)} />
                  {key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </label>
              ))}
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={saveListing} disabled={saving} className="btn btn-primary">
                {saving ? "Saving..." : "Save Listing"}
              </button>
              <button
                onClick={publishToFacebook}
                disabled={publishing || saving}
                className="btn btn-fb"
              >
                {publishing ? "Publishing..." : "Publish to Facebook Marketplace"}
              </button>
            </div>

            {publishing && (
              <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, padding: 10, background: "#F8F8F8", borderRadius: 8, border: "1px solid rgba(0,0,0,0.08)" }}>
                <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                <span style={{ color: "#555", fontSize: 13 }}>
                  {publishStep === "downloading_photos" && "Downloading photos..."}
                  {publishStep === "starting_browser" && "Starting browser session..."}
                  {publishStep === "navigating" && "Opening Facebook Marketplace..."}
                  {publishStep === "uploading_photos" && "Uploading photos to listing..."}
                  {publishStep === "filling_form" && "Filling listing form..."}
                  {publishStep === "publishing" && "Publishing listing..."}
                  {publishStep === "verifying" && "Verifying listing is live..."}
                  {!["downloading_photos", "starting_browser", "navigating", "uploading_photos", "filling_form", "publishing", "verifying"].includes(publishStep) && `${publishStep || "Starting"}...`}
                </span>
              </div>
            )}

            {publishResult && (
              <div style={{
                marginTop: 12, padding: 12, borderRadius: 8,
                background: publishResult.success ? "#f0fdf4" : "#fef2f2",
                color: publishResult.success ? "#16a34a" : "#ef4444",
                fontSize: 13, fontWeight: 600,
              }}>
                {publishResult.success ? "Listed on Facebook Marketplace" : "Publish failed"}: {publishResult.message}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>Product Photos</h3>

            <div style={{ display: "grid", gridTemplateColumns: originalImageUrl && mediaUrls.length > 0 ? "1fr 1fr" : "1fr", gap: 12 }}>
              {originalImageUrl && (
                <div>
                  <label style={{ ...labelStyle, marginBottom: 8 }}>Original</label>
                  <img src={originalImageUrl} alt="Original" style={{ width: "100%", height: 220, objectFit: "cover", borderRadius: 8, background: "#F8F8F8" }} />
                </div>
              )}

              {mediaUrls.length > 0 && (
                <div>
                  <label style={{ ...labelStyle, marginBottom: 8 }}>AI Lifestyle</label>
                  <img src={mediaUrls[0]} alt="Lifestyle" style={{ width: "100%", height: 220, objectFit: "cover", borderRadius: 8, background: "#F8F8F8" }} />
                </div>
              )}
            </div>

            {mediaUrls.length === 0 && (
              <p style={{ color: "#888", fontSize: 12, marginTop: 12, textAlign: "center" }}>
                Lifestyle photo auto-generates when item is uploaded
              </p>
            )}

            {(originalImageUrl || mediaUrls.length > 0) && (
              <p style={{ color: "#888", fontSize: 11, marginTop: 10, textAlign: "center" }}>
                Both photos will be uploaded when publishing
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
  fontSize: 11,
  color: "#888",
  marginBottom: 4,
  marginTop: 12,
  textTransform: "uppercase",
  letterSpacing: 0.8,
  fontWeight: 800,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  background: "#FFFFFF",
  border: "1.5px solid rgba(0,0,0,0.08)",
  borderRadius: 8,
  color: "#080808",
  fontSize: 14,
  marginBottom: 4,
  outline: "none",
  fontFamily: "inherit",
};

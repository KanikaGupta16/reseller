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

  const [videoUrl, setVideoUrl]         = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoIsPika, setVideoIsPika]   = useState(false);

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
    setVideoUrl(item.media_video_url || null);
    setVideoIsPika(!!(item.media_video_url?.includes("pika")));
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

  const generateVideoClip = async () => {
    if (!selectedId) return;
    setVideoLoading(true);
    try {
      await fetch("http://localhost:3001/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: selectedId }),
      });
      // Poll until done
      const poll = setInterval(async () => {
        try {
          const r = await fetch(`http://localhost:3001/api/video/status/${selectedId}`);
          const d = await r.json();
          if (d.status === "done") {
            clearInterval(poll);
            setVideoUrl(d.videoUrl);
            setVideoIsPika(d.isPika);
            setVideoLoading(false);
          }
        } catch { clearInterval(poll); setVideoLoading(false); }
      }, 4000);
    } catch { setVideoLoading(false); }
  };

  if (!selectedId) {
    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.25rem" }}>
          {items.map((item) => (
            <div
              key={item.id}
              className="card"
              onClick={() => selectItem(item)}
              style={{ cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s, border-color 0.15s" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#E875BB";
                e.currentTarget.style.transform = "translateY(-3px)";
                e.currentTarget.style.boxShadow = "0 12px 40px rgba(232,117,187,0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(0,0,0,0.08)";
                e.currentTarget.style.transform = "";
                e.currentTarget.style.boxShadow = "";
              }}
            >
              {item.image_url && (
                <img src={item.image_url} alt={item.title || ""}
                  style={{ width: "100%", height: 220, objectFit: "cover", display: "block" }} />
              )}
              <div style={{ padding: "1.25rem" }}>
                <div style={{ fontWeight: 900, fontSize: "1.0625rem", letterSpacing: "-0.02em", marginBottom: "0.625rem", lineHeight: 1.2 }}>
                  {item.title || "Untitled"}
                </div>
                <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", alignItems: "center" }}>
                  {item.category && <span className="chip">{item.category}</span>}
                  {item.media_urls && item.media_urls.length > 0 && (
                    <span className="chip chip-green">{item.media_urls.length} photos</span>
                  )}
                  {item.listing_price && (
                    <span className="chip chip-pink">${item.listing_price}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        {items.length === 0 && (
          <div className="empty">
            <span className="empty-icon">🎬</span>
            <span>No items yet — upload products first.</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "1.75rem" }}>
        <button onClick={() => { setSelectedId(null); loadItems(); }} className="btn btn-ghost btn-sm">
          ← Back
        </button>
        <div>
          <h2 style={{ fontWeight: 900, fontSize: "1.5rem", letterSpacing: "-0.03em", textTransform: "lowercase", margin: 0 }}>listing builder.</h2>
        </div>
        {saveStatus === "saved" && <span className="chip chip-green" style={{ marginLeft: "auto" }}>Saved ✓</span>}
        {saveStatus === "error" && <span style={{ color: "#ef4444", fontSize: "var(--text-sm)", fontWeight: 700, marginLeft: "auto" }}>Save failed</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", alignItems: "start" }}>

        {/* ── LEFT: Form ── */}
        <div className="card">
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "1.125rem" }}>
            <div style={{ fontWeight: 800, fontSize: "0.9375rem", letterSpacing: "-0.01em", paddingBottom: "0.875rem", borderBottom: "1.5px solid var(--border)" }}>
              Listing Details
            </div>

            <div className="field">
              <label>Title</label>
              <input className="input" value={form.title} onChange={(e) => updateField("title", e.target.value)} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
              <div className="field">
                <label>Price ($)</label>
                <input className="input" type="number" step="0.01" value={form.price} onChange={(e) => updateField("price", parseFloat(e.target.value) || 0)} />
              </div>
              <div className="field">
                <label>Min Price ($)</label>
                <div style={{ display: "flex", gap: "0.375rem" }}>
                  <input
                    className="input"
                    type="number" step="0.01"
                    value={form.min_negotiation_price ?? Math.round(form.price * 0.8)}
                    onChange={(e) => updateField("min_negotiation_price", parseFloat(e.target.value) || 0)}
                    style={{ flex: 1 }}
                  />
                  {form.min_negotiation_price !== null && (
                    <button onClick={() => updateField("min_negotiation_price", null)} className="btn btn-ghost btn-sm">Auto</button>
                  )}
                </div>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--muted)" }}>
                  {form.min_negotiation_price === null ? "Auto: 80% of listing price" : "Custom"}
                </span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem" }}>
              <div className="field">
                <label>Category</label>
                <select className="input" value={form.category} onChange={(e) => updateField("category", e.target.value)}>
                  <option value="">Select...</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Condition</label>
                <select className="input" value={form.condition} onChange={(e) => updateField("condition", e.target.value)}>
                  <option value="">Select...</option>
                  {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="field">
              <label>Location</label>
              <input className="input" value={form.location} onChange={(e) => updateField("location", e.target.value)} placeholder="e.g. San Francisco, CA" />
            </div>

            <div className="field">
              <label>Description</label>
              <textarea className="input textarea" value={form.description} onChange={(e) => updateField("description", e.target.value)} style={{ minHeight: 100 }} />
            </div>

            <div className="field">
              <label>Meetup Preferences</label>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
                {(["door_pickup", "door_dropoff", "public_meetup"] as const).map((key) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", fontSize: "var(--text-sm)", fontWeight: 600 }}>
                    <input type="checkbox" checked={form.meetup_preferences[key]} onChange={() => toggleMeetup(key)} />
                    {key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", paddingTop: "0.5rem", borderTop: "1.5px solid var(--border)" }}>
              <button onClick={saveListing} disabled={saving} className="btn btn-primary">
                {saving ? "Saving…" : "Save Listing"}
              </button>
              <button onClick={publishToFacebook} disabled={publishing || saving} className="btn btn-fb">
                {publishing ? "Publishing…" : "Publish to Facebook"}
              </button>
            </div>

            {publishing && (
              <div className="agent-row agent-row--working">
                <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                <span style={{ color: "var(--muted)", fontSize: "var(--text-sm)", fontWeight: 600 }}>
                  {publishStep || "Starting"}…
                </span>
              </div>
            )}
            {publishResult && (
              <div className={publishResult.success ? "result-ok" : "result-err"}>
                {publishResult.success ? "Listed on Facebook Marketplace" : "Publish failed"}: {publishResult.message}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Photos + Video ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

          {/* Photos card */}
          <div className="card">
            <div style={{ fontWeight: 800, fontSize: "0.9375rem", letterSpacing: "-0.01em", padding: "1.25rem 1.5rem", borderBottom: "1.5px solid var(--border)" }}>
              Product Photos
            </div>
            <div style={{ display: "grid", gridTemplateColumns: originalImageUrl && mediaUrls.length > 0 ? "1fr 1fr" : "1fr" }}>
              {originalImageUrl && (
                <div>
                  <div style={{ padding: "0.75rem 1.25rem 0.5rem", fontSize: "var(--text-xs)", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)" }}>Original</div>
                  <img src={originalImageUrl} alt="Original" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                </div>
              )}
              {mediaUrls.length > 0 && (
                <div style={{ borderLeft: originalImageUrl ? "1.5px solid var(--border)" : "none" }}>
                  <div style={{ padding: "0.75rem 1.25rem 0.5rem", fontSize: "var(--text-xs)", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)" }}>AI Lifestyle</div>
                  <img src={mediaUrls[0]} alt="Lifestyle" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                </div>
              )}
            </div>
            {!originalImageUrl && mediaUrls.length === 0 && (
              <div className="empty" style={{ padding: "2rem" }}>
                <span className="empty-icon" style={{ fontSize: "2rem" }}>🖼️</span>
                <span>Lifestyle photo auto-generates when item is uploaded</span>
              </div>
            )}
            {(originalImageUrl || mediaUrls.length > 0) && (
              <div style={{ padding: "0.75rem 1.25rem", borderTop: "1.5px solid var(--border)", fontSize: "var(--text-xs)", color: "var(--muted)", textAlign: "center", fontWeight: 600 }}>
                Both photos will be uploaded when publishing
              </div>
            )}

          </div>{/* /photos card */}

          {/* Video card — commented out for now
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.125rem 1.5rem", borderBottom: "1.5px solid var(--border)" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: "0.9375rem", letterSpacing: "-0.01em" }}>Product Video</div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--muted)", marginTop: "0.125rem" }}>
                  {videoIsPika ? "Generated by Pika ✨" : "Powered by Pika"}
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={generateVideoClip} disabled={videoLoading}>
                {videoLoading ? "Generating…" : videoUrl ? "Regenerate 🎬" : "Generate Video 🎬"}
              </button>
            </div>

            {videoLoading && (
              <div className="agent-row" style={{ margin: "1rem 1.25rem", borderRadius: "var(--radius-sm)" }}>
                <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                <span style={{ fontSize: "var(--text-sm)", color: "var(--muted)", fontWeight: 600 }}>
                  {videoIsPika ? "Pika is generating your video…" : "Creating video preview…"}
                </span>
              </div>
            )}

            {videoUrl && !videoLoading ? (
              <div style={{ position: "relative", overflow: "hidden", borderRadius: "0 0 var(--radius-md) var(--radius-md)" }}>
                {videoUrl.endsWith(".mp4") || videoUrl.includes("pika") ? (
                  <video src={videoUrl} autoPlay loop muted playsInline controls style={{ width: "100%", display: "block", maxHeight: 280, objectFit: "cover" }} />
                ) : (
                  <img src={videoUrl} alt="Video preview" style={{ width: "100%", display: "block", maxHeight: 280, objectFit: "cover" }} />
                )}
                {!videoIsPika && (
                  <div style={{ position: "absolute", bottom: 10, left: 10, background: "rgba(0,0,0,0.72)", color: "white", fontSize: "var(--text-xs)", fontWeight: 700, padding: "4px 10px", borderRadius: 100, letterSpacing: "0.06em" }}>
                    PREVIEW — Connect Pika for full video
                  </div>
                )}
              </div>
            ) : !videoLoading && (
              <div className="empty" style={{ padding: "2rem" }}>
                <span style={{ fontSize: "2rem" }}>🎬</span>
                <span style={{ fontWeight: 600 }}>Click Generate Video to create a product clip</span>
              </div>
            )}
          </div>
          */}

        </div>{/* /right column */}
      </div>
    </div>
  );
}


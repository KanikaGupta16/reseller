import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { analyzeImage, type ProductInfo } from "../lib/vision";
import { supabase } from "../lib/supabase";

const API = import.meta.env.VITE_API_URL || "http://localhost:3001";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface Props { onItemSaved: () => void; }

export default function PhotoUploader({ onItemSaved }: Props) {
  const [previews,  setPreviews]  = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [results,   setResults]   = useState<(ProductInfo & { imageUrl: string })[]>([]);
  const [saving,    setSaving]    = useState<Record<number, boolean>>({});
  const [saved,     setSaved]     = useState<Record<number, boolean>>({});
  const [error,     setError]     = useState<string | null>(null);

  const onDrop = useCallback(async (files: File[]) => {
    setError(null); setResults([]); setSaved({});
    setPreviews(files.map((f) => URL.createObjectURL(f)));
    setAnalyzing(true);
    try {
      const analyzed: (ProductInfo & { imageUrl: string })[] = [];
      for (const file of files) {
        const base64 = await fileToBase64(file);
        const ext  = file.name.split(".").pop() || "jpg";
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
        const info = await analyzeImage(base64);
        analyzed.push({ ...info, imageUrl: urlData.publicUrl });
      }
      setResults(analyzed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const saveItem = async (index: number) => {
    const item = results[index];
    setSaving((s) => ({ ...s, [index]: true }));
    const { data: inserted, error: err } = await supabase.from("items").insert({
      image_url: item.imageUrl, title: item.title, brand: item.brand,
      model: item.model, category: item.category, condition: item.condition,
      description: item.description, tags: item.tags,
    }).select().single();
    setSaving((s) => ({ ...s, [index]: false }));
    if (err) {
      setError(`Save failed: ${err.message}`);
    } else {
      setSaved((s) => ({ ...s, [index]: true }));
      onItemSaved();
      if (inserted?.id) {
        fetch(`${API}/api/research`,      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: inserted.id }) }).catch(() => {});
        fetch(`${API}/api/media/generate`,{ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: inserted.id }) }).catch(() => {});
      }
    }
  };

  const saveAll = async () => { for (let i = 0; i < results.length; i++) { if (!saved[i]) await saveItem(i); } };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".avif"] },
    multiple: true,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* Drop zone */}
      <div {...getRootProps()} className={`dropzone${isDragActive ? " dropzone--over" : ""}`}>
        <input {...getInputProps()} />
        <span className="dropzone-icon">📷</span>
        <span className="dropzone-label">
          {isDragActive ? "Drop here..." : "Drop product photos or click to browse"}
        </span>
        <span className="dropzone-hint">JPG · PNG · WebP · AVIF — multiple files supported</span>
      </div>

      {/* Error */}
      {error && <div className="result-err">{error}</div>}

      {/* Analysing state */}
      {analyzing && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.875rem", padding: "2rem" }}>
          <div className="spinner" />
          <p style={{ color: "var(--muted)", fontSize: "var(--text-sm)", fontWeight: 600 }}>
            Analysing {previews.length} photo{previews.length !== 1 ? "s" : ""} with GPT-4o Vision…
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {previews.map((url, i) => (
              <img key={i} src={url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, opacity: 0.5 }} />
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div style={{ fontWeight: 900, fontSize: "1rem", letterSpacing: "-0.02em" }}>
              {results.length} Item{results.length !== 1 ? "s" : ""} Analysed
            </div>
            {results.length > 1 && (
              <button onClick={saveAll} className="btn btn-primary btn-sm">Save All</button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            {results.map((item, i) => (
              <div key={i} className="card card-row">
                <img src={item.imageUrl} alt={item.title}
                  style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 10, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: "0.9375rem", letterSpacing: "-0.01em", marginBottom: "0.375rem" }}>{item.title}</div>
                  <div className="chip-row" style={{ marginBottom: "0.5rem" }}>
                    {item.brand && <span className="chip">{item.brand}</span>}
                    <span className="chip">{item.category}</span>
                    <span className="chip chip-pink">{item.condition}</span>
                  </div>
                  {item.model && <div style={{ fontSize: "var(--text-xs)", color: "var(--muted)", marginBottom: "0.25rem" }}>Model: {item.model}</div>}
                  <p style={{ fontSize: "var(--text-sm)", color: "#555", margin: "0 0 0.625rem", lineHeight: 1.5 }}>{item.description}</p>
                  <div className="chip-row">
                    {item.tags.map((t) => <span key={t} className="chip">{t}</span>)}
                  </div>
                </div>
                <div style={{ flexShrink: 0, alignSelf: "center" }}>
                  {saved[i]
                    ? <span style={{ color: "#22c55e", fontWeight: 800, fontSize: "var(--text-sm)" }}>✓ Saved</span>
                    : <button onClick={() => saveItem(i)} disabled={saving[i]} className="btn btn-primary btn-sm">
                        {saving[i] ? "Saving…" : "Save"}
                      </button>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

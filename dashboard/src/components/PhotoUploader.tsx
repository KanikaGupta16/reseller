import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { analyzeImage, type ProductInfo } from "../lib/vision";
import { supabase } from "../lib/supabase";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface Props {
  onItemSaved: () => void;
}

export default function PhotoUploader({ onItemSaved }: Props) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<(ProductInfo & { imageUrl: string })[]>([]);
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [saved, setSaved] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(async (files: File[]) => {
    setError(null);
    setResults([]);
    setSaved({});

    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    setAnalyzing(true);

    try {
      const analyzed: (ProductInfo & { imageUrl: string })[] = [];

      for (const file of files) {
        const base64 = await fileToBase64(file);

        const ext = file.name.split(".").pop() || "jpg";
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("product-images")
          .upload(path, file, { contentType: file.type });

        if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

        const { data: urlData } = supabase.storage
          .from("product-images")
          .getPublicUrl(path);

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
      image_url: item.imageUrl,
      title: item.title,
      brand: item.brand,
      model: item.model,
      category: item.category,
      condition: item.condition,
      description: item.description,
      tags: item.tags,
    }).select().single();

    setSaving((s) => ({ ...s, [index]: false }));

    if (err) {
      setError(`Save failed: ${err.message}`);
    } else {
      setSaved((s) => ({ ...s, [index]: true }));
      onItemSaved();

      if (inserted?.id) {
        fetch("http://localhost:3001/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: inserted.id }),
        }).catch(() => {});
        fetch("http://localhost:3001/api/media/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: inserted.id }),
        }).catch(() => {});
      }
    }
  };

  const saveAll = async () => {
    for (let i = 0; i < results.length; i++) {
      if (!saved[i]) await saveItem(i);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".avif"] },
    multiple: true,
  });

  return (
    <div>
      <div
        {...getRootProps()}
        style={{
          border: "2.5px dashed rgba(0,0,0,0.14)",
          borderRadius: 18,
          padding: "2.5rem 2rem",
          textAlign: "center",
          cursor: "pointer",
          background: isDragActive ? "#FFF0F7" : "#F8F8F8",
          borderColor: isDragActive ? "#E875BB" : undefined,
          transition: "background 0.2s, border-color 0.2s",
        }}
      >
        <input {...getInputProps()} />
        <p style={{ fontSize: 18, margin: 0, color: "#333" }}>
          {isDragActive
            ? "Drop photos here..."
            : "Drag & drop product photos, or click to browse"}
        </p>
        <p style={{ fontSize: 13, color: "#888", marginTop: 8 }}>
          JPG, PNG, WebP — multiple files supported
        </p>
      </div>

      {error && (
        <div style={{ color: "#ef4444", marginTop: 16, padding: 12, background: "#fef2f2", borderRadius: 8, fontSize: 14 }}>
          {error}
        </div>
      )}

      {analyzing && (
        <div style={{ textAlign: "center", marginTop: 32 }}>
          <div className="spinner" />
          <p style={{ color: "#888", marginTop: 12 }}>Analyzing {previews.length} photo(s) with GPT-4o Vision...</p>
        </div>
      )}

      {previews.length > 0 && analyzing && (
        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          {previews.map((url, i) => (
            <img key={i} src={url} alt="" style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 8, opacity: 0.6 }} />
          ))}
        </div>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Analysis Results</h3>
            {results.length > 1 && (
              <button onClick={saveAll} className="btn btn-primary">
                Save All to Inventory
              </button>
            )}
          </div>

          {results.map((item, i) => (
            <div key={i} className="card" style={{ display: "flex", gap: 20, marginBottom: 16 }}>
              <img
                src={item.imageUrl}
                alt={item.title}
                style={{ width: 160, height: 160, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4 style={{ margin: "0 0 4px" }}>{item.title}</h4>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  {item.brand && <span className="tag">{item.brand}</span>}
                  <span className="tag">{item.category}</span>
                  <span className="tag">{item.condition}</span>
                </div>
                {item.model && <p style={{ margin: "0 0 4px", color: "#888", fontSize: 13 }}>Model: {item.model}</p>}
                <p style={{ margin: "0 0 8px", color: "#555", fontSize: 14 }}>{item.description}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {item.tags.map((t) => (
                    <span key={t} className="chip">{t}</span>
                  ))}
                </div>
              </div>
              <div style={{ flexShrink: 0, alignSelf: "center" }}>
                {saved[i] ? (
                  <span style={{ color: "#22c55e", fontWeight: 700 }}>Saved</span>
                ) : (
                  <button onClick={() => saveItem(i)} disabled={saving[i]} className="btn btn-primary">
                    {saving[i] ? "Saving..." : "Save"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

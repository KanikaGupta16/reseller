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
  tags: string[] | null;
  created_at: string;
}

interface Props {
  refreshKey: number;
}

export default function ItemsTable({ refreshKey }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase
      .from("items")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setItems(data || []);
        setLoading(false);
      });
  }, [refreshKey]);

  if (loading) return <p style={{ color: "#888" }}>Loading inventory...</p>;
  if (items.length === 0) return <p style={{ color: "#888" }}>No items yet. Upload a product photo to get started.</p>;

  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: "1.5px solid rgba(0,0,0,0.08)" }}>
      <table>
        <thead>
          <tr>
            <th style={{ width: 60 }}></th>
            <th>Title</th>
            <th>Brand</th>
            <th>Category</th>
            <th>Condition</th>
            <th>Tags</th>
            <th>Added</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt=""
                    style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }}
                  />
                )}
              </td>
              <td>
                <strong>{item.title || "—"}</strong>
                {item.model && <span style={{ color: "#888", fontSize: 12, display: "block" }}>{item.model}</span>}
              </td>
              <td>{item.brand || "—"}</td>
              <td>{item.category || "—"}</td>
              <td>{item.condition || "—"}</td>
              <td>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {item.tags?.slice(0, 3).map((t) => (
                    <span key={t} className="chip">{t}</span>
                  ))}
                </div>
              </td>
              <td style={{ color: "#888", fontSize: 12 }}>
                {new Date(item.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

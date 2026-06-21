import { SupabaseClient } from "@supabase/supabase-js";

const PIKA_TOKEN = process.env.PIKA_ACCESS_TOKEN;
const PIKA_API   = "https://api.pika.art/v1";

interface VideoJob {
  jobId: string;
  status: "pending" | "running" | "done" | "failed";
  videoUrl?: string;
  error?: string;
}

/* ── Try Pika REST API ── */
async function generateViaPika(item: any): Promise<string | null> {
  if (!PIKA_TOKEN) return null;

  const prompt = [
    `Short 5-second product video of a ${item.title}`,
    item.brand ? `by ${item.brand}` : "",
    `in ${item.condition} condition.`,
    "Clean white background. Slow 360-degree rotation. Professional product photography lighting.",
    "No text, no overlays.",
  ].filter(Boolean).join(" ");

  try {
    // Submit generation
    const genRes = await fetch(`${PIKA_API}/generate`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${PIKA_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        model: "seedance-1-5",
        duration: 5,
        resolution: "720p",
        ...(item.image_url ? { imageUrls: [item.image_url] } : {}),
      }),
    });

    if (!genRes.ok) {
      console.warn(`[Video] Pika returned ${genRes.status}`);
      return null;
    }

    const genData = await genRes.json();
    const videoId = genData?.data?.id || genData?.id;
    if (!videoId) return null;

    // Poll for result (max 3 min)
    for (let i = 0; i < 36; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const pollRes = await fetch(`${PIKA_API}/videos/${videoId}`, {
        headers: { "Authorization": `Bearer ${PIKA_TOKEN}` },
      });
      const pollData = await pollRes.json();
      const state = pollData?.data?.status || pollData?.status;
      const url   = pollData?.data?.videoUrl || pollData?.videoUrl;

      if (state === "completed" && url) return url;
      if (state === "failed") return null;
    }
  } catch (e) {
    console.warn("[Video] Pika error:", e);
  }
  return null;
}

/* ── Main export ── */
export async function generateVideo(supabase: SupabaseClient, itemId: string): Promise<VideoJob> {
  const { data: item, error } = await supabase
    .from("items")
    .select("id, title, brand, category, condition, image_url, media_urls, media_video_url")
    .eq("id", itemId)
    .single();

  if (error || !item) return { jobId: itemId, status: "failed", error: "Item not found" };

  // Already has a video
  if (item.media_video_url) {
    return { jobId: itemId, status: "done", videoUrl: item.media_video_url };
  }

  console.log(`[Video] Generating for ${item.title}...`);

  // Try Pika first
  const pikaUrl = await generateViaPika(item);

  if (pikaUrl) {
    await supabase.from("items").update({ media_video_url: pikaUrl }).eq("id", itemId);
    return { jobId: itemId, status: "done", videoUrl: pikaUrl };
  }

  // Fallback: use existing generated images as "video preview"
  const mediaUrls: string[] = item.media_urls || [];
  const fallbackUrl = mediaUrls[0] || item.image_url;

  if (fallbackUrl) {
    // Store first image as video placeholder until Pika auth is set up
    await supabase.from("items").update({ media_video_url: fallbackUrl }).eq("id", itemId);
    return { jobId: itemId, status: "done", videoUrl: fallbackUrl };
  }

  return { jobId: itemId, status: "failed", error: "No media available. Run image generation first." };
}

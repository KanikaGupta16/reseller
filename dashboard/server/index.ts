import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { runResearch } from "./research";
import { generateMedia, buildFinalListing } from "./media";

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// --- Research endpoints ---

app.post("/api/research", async (req, res) => {
  const { itemId } = req.body;
  if (!itemId) return res.status(400).json({ error: "itemId required" });

  const { data: item, error: fetchErr } = await supabase
    .from("items")
    .select("*")
    .eq("id", itemId)
    .single();

  if (fetchErr || !item) {
    return res.status(404).json({ error: "Item not found" });
  }

  const { data: job, error: jobErr } = await supabase
    .from("research_jobs")
    .insert({
      item_id: itemId,
      payload: {
        title: item.title,
        brand: item.brand,
        model: item.model,
        category: item.category,
        condition: item.condition,
        description: item.description,
      },
      status: "running",
      step: "scraping",
      progress: 0,
    })
    .select()
    .single();

  if (jobErr) {
    return res.status(500).json({ error: jobErr.message });
  }

  res.json({ jobId: job.id, status: "running" });

  runResearch(supabase, job.id, item).catch((err) => {
    console.error(`[Research] Fatal error for job ${job.id}:`, err);
    supabase
      .from("research_jobs")
      .update({ status: "failed", error: err.message })
      .eq("id", job.id)
      .then();
  });
});

app.get("/api/research/:jobId", async (req, res) => {
  const { data, error } = await supabase
    .from("research_jobs")
    .select("*")
    .eq("id", req.params.jobId)
    .single();

  if (error) return res.status(404).json({ error: "Job not found" });
  res.json(data);
});

app.get("/api/research/item/:itemId", async (req, res) => {
  const { data, error } = await supabase
    .from("research_jobs")
    .select("*")
    .eq("item_id", req.params.itemId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) return res.status(404).json({ error: "No research found" });
  res.json(data);
});

// --- Media endpoints ---

app.post("/api/media/generate", async (req, res) => {
  const { itemId } = req.body;
  if (!itemId) return res.status(400).json({ error: "itemId required" });

  res.json({ status: "generating", itemId });

  generateMedia(supabase, itemId).catch((err) => {
    console.error(`[Media] Fatal error for item ${itemId}:`, err);
  });
});

app.get("/api/media/status/:itemId", async (req, res) => {
  const { data, error } = await supabase
    .from("items")
    .select("media_urls, media_video_url")
    .eq("id", req.params.itemId)
    .single();

  if (error) return res.status(404).json({ error: "Item not found" });

  const urls = data.media_urls || [];
  res.json({
    status: urls.length > 0 ? "done" : "pending",
    count: urls.length,
    media_urls: urls,
    video_url: data.media_video_url,
  });
});

// --- Listing builder endpoint ---

app.post("/api/listing/build", async (req, res) => {
  try {
    const { itemId, ...overrides } = req.body;
    if (!itemId) return res.status(400).json({ error: "itemId required" });
    const listing = await buildFinalListing(supabase, itemId, overrides);
    res.json(listing);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/items/:itemId", async (req, res) => {
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("id", req.params.itemId)
    .single();

  if (error) return res.status(404).json({ error: "Item not found" });
  res.json(data);
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[Server] Research API running on http://localhost:${PORT}`);
});

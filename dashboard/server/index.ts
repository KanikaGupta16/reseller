import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { runResearch } from "./research";
import { generateMedia, buildFinalListing } from "./media";
import { publishToFacebook } from "./facebook";
import { messengerSession } from "./messenger";

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

// --- Facebook publish endpoint ---

const publishJobs = new Map<string, { status: string; step: string; result?: { success: boolean; message: string } }>();

app.post("/api/publish/facebook", async (req, res) => {
  const { itemId } = req.body;
  if (!itemId) return res.status(400).json({ error: "itemId required" });

  const { data: item, error: fetchErr } = await supabase
    .from("items")
    .select("*")
    .eq("id", itemId)
    .single();

  if (fetchErr || !item) return res.status(404).json({ error: "Item not found" });

  const listing = {
    title: item.title || "",
    price: item.listing_price ?? item.research_suggested_price ?? 0,
    category: item.category || "",
    condition: item.condition || "",
    location: item.location || "San Francisco, CA",
    description: item.description || "",
    meetup_preferences: item.meetup_preferences || { door_pickup: true, door_dropoff: false, public_meetup: false },
    image_url: item.image_url,
    media_urls: item.media_urls || [],
  };

  publishJobs.set(itemId, { status: "running", step: "starting" });
  res.json({ status: "running", itemId });

  publishToFacebook(supabase, itemId, listing, (status, step) => {
    publishJobs.set(itemId, { status, step });
  }).then(async (result) => {
    publishJobs.set(itemId, { status: result.success ? "done" : "failed", step: "complete", result });
    console.log(`[FB] Publish result for ${itemId}: ${result.message}`);
    if (result.success) {
      const { data: current } = await supabase.from("items").select("listed_on").eq("id", itemId).single();
      const platforms = new Set(current?.listed_on || []);
      platforms.add("facebook");
      await supabase.from("items").update({ listed_on: [...platforms] }).eq("id", itemId);
    }
  }).catch((err) => {
    publishJobs.set(itemId, { status: "failed", step: "error", result: { success: false, message: err.message } });
  });
});

app.get("/api/publish/facebook/:itemId", async (req, res) => {
  const job = publishJobs.get(req.params.itemId);
  if (!job) return res.status(404).json({ error: "No publish job found" });
  res.json(job);
});

// --- Messenger endpoints ---

app.post("/api/messenger/connect", async (_req, res) => {
  try {
    await messengerSession.connect();
    res.json({ status: "connected" });
  } catch (err: any) {
    res.status(500).json({ status: "error", error: err.message });
  }
});

app.get("/api/messenger/status", (_req, res) => {
  res.json({
    status: messengerSession.status,
    error: messengerSession.error,
  });
});

app.get("/api/messenger/conversations", async (_req, res) => {
  try {
    const conversations = await messengerSession.getConversations();
    res.json({ conversations });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/messenger/conversations/:id/messages", async (req, res) => {
  try {
    const result = await messengerSession.getMessages(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/messenger/conversations/:id/send", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });
  try {
    await messengerSession.sendMessage(req.params.id, text);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/messenger/disconnect", async (_req, res) => {
  try {
    await messengerSession.disconnect();
    res.json({ status: "disconnected" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[Server] Research API running on http://localhost:${PORT}`);
});

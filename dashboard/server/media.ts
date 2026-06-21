import { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface DbItem {
  id: string;
  image_url: string | null;
  title: string | null;
  brand: string | null;
  model: string | null;
  category: string | null;
  condition: string | null;
  description: string | null;
}

const ANGLE_PROMPTS = [
  (item: DbItem) =>
    `A single ${item.title}${item.brand ? ` by ${item.brand}` : ""} in a lifestyle setting on a clean modern wooden desk. Natural window light from the left. Shallow depth of field with blurred background. The product is the hero subject in sharp focus. Minimal, aspirational, magazine-quality editorial photo. No text overlays, no other products.`,
];

export async function generateMedia(
  supabase: SupabaseClient,
  itemId: string
): Promise<void> {
  console.log(`[Media] Starting generation for item ${itemId}`);

  const { data: item, error } = await supabase
    .from("items")
    .select("*")
    .eq("id", itemId)
    .single();

  if (error || !item) throw new Error("Item not found");

  const mediaUrls: string[] = [];

  for (let i = 0; i < ANGLE_PROMPTS.length; i++) {
    const prompt = ANGLE_PROMPTS[i](item);
    console.log(`[Media] Generating image ${i + 1}/3...`);

    try {
      const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "medium",
      });

      const b64 = response.data?.[0]?.b64_json;
      if (!b64) {
        console.error(`[Media] No image data returned for prompt ${i + 1}`);
        continue;
      }

      const buffer = Buffer.from(b64, "base64");
      const filename = `generated/${itemId}_angle_${i + 1}.png`;

      const { error: uploadErr } = await supabase.storage
        .from("product-images")
        .upload(filename, buffer, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadErr) {
        console.error(`[Media] Upload error: ${uploadErr.message}`);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(filename);

      mediaUrls.push(urlData.publicUrl);
      console.log(`[Media] Image ${i + 1} uploaded: ${urlData.publicUrl}`);
    } catch (err: any) {
      console.error(`[Media] Generation error for image ${i + 1}: ${err.message}`);
    }
  }

  await supabase
    .from("items")
    .update({ media_urls: mediaUrls })
    .eq("id", itemId);

  console.log(`[Media] Done — ${mediaUrls.length} images saved for item ${itemId}`);
}

export async function buildFinalListing(
  supabase: SupabaseClient,
  itemId: string,
  overrides: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { data: item, error } = await supabase
    .from("items")
    .select("*")
    .eq("id", itemId)
    .single();

  if (error || !item) throw new Error("Item not found");

  const listing = {
    title: overrides.title ?? item.title ?? "",
    price: overrides.price ?? item.listing_price ?? item.research_suggested_price ?? 0,
    category: overrides.category ?? item.category ?? "",
    condition: overrides.condition ?? item.condition ?? "",
    location: overrides.location ?? item.location ?? "",
    description: overrides.description ?? item.description ?? "",
    meetup_preferences: overrides.meetup_preferences ?? item.meetup_preferences ?? {
      door_pickup: false,
      door_dropoff: false,
      public_meetup: false,
    },
    image_url: item.image_url,
    media_urls: item.media_urls || [],
    media_video_url: item.media_video_url,
  };

  await supabase
    .from("items")
    .update({
      listing_price: listing.price,
      location: listing.location,
      meetup_preferences: listing.meetup_preferences,
      title: listing.title,
      description: listing.description,
      category: listing.category,
      condition: listing.condition,
    })
    .eq("id", itemId);

  return listing;
}

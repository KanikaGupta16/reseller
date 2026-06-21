import { createClient, SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { config } from "./config";
import { ScrapedListing } from "./types";

const supabase: SupabaseClient = createClient(
  config.supabase.url,
  config.supabase.serviceKey
);
const openai = new OpenAI({ apiKey: config.openai.apiKey });

const TABLE_NAME = "listings";

export async function ensureIndex(): Promise<void> {
  console.log("[Supabase] Checking listings table...");

  const { error } = await supabase.from(TABLE_NAME).select("id").limit(1);

  if (error) {
    console.log(
      "[Supabase] Table may not exist. Run the migration SQL below in your Supabase SQL editor:\n"
    );
    console.log(getMigrationSQL());
    console.log("");
    throw new Error(
      "Listings table not found. Run the migration SQL in Supabase first."
    );
  }

  console.log("[Supabase] Table ready");
}

async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

export async function storeListings(
  listings: ScrapedListing[]
): Promise<void> {
  console.log(
    `\n[Supabase] Storing ${listings.length} listings with embeddings...`
  );

  for (const listing of listings) {
    const embeddingText = `${listing.title} ${listing.condition} $${listing.price}`;
    const embedding = await getEmbedding(embeddingText);

    const { error } = await supabase.from(TABLE_NAME).insert({
      title: listing.title,
      source: listing.source,
      price: listing.price,
      condition: listing.condition,
      url: listing.url,
      embedding,
    });

    if (error) {
      console.error(`  [Supabase] Error storing "${listing.title}":`, error.message);
    }
  }

  console.log("[Supabase] All listings stored");
}

export async function findSimilarListings(
  queryText: string,
  topK: number = 20
): Promise<ScrapedListing[]> {
  const queryEmbedding = await getEmbedding(queryText);

  const { data, error } = await supabase.rpc("match_listings", {
    query_embedding: queryEmbedding,
    match_threshold: 0.5,
    match_count: topK,
  });

  if (error) {
    console.error("[Supabase] Vector search error:", error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    source: row.source,
    title: row.title,
    price: row.price,
    condition: row.condition,
    url: row.url,
  }));
}

export async function disconnectRedis(): Promise<void> {
  // no-op — Supabase client doesn't need explicit disconnect
}

function getMigrationSQL(): string {
  return `-- Enable pgvector extension
create extension if not exists vector;

-- Create listings table
create table if not exists listings (
  id bigint primary key generated always as identity,
  title text not null,
  source text not null,
  price numeric not null,
  condition text,
  url text,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- Create similarity search function
create or replace function match_listings (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  title text,
  source text,
  price numeric,
  condition text,
  url text,
  similarity float
)
language sql stable
as $$
  select
    id,
    title,
    source,
    price,
    condition,
    url,
    1 - (listings.embedding <=> query_embedding) as similarity
  from listings
  where 1 - (listings.embedding <=> query_embedding) > match_threshold
  order by listings.embedding <=> query_embedding
  limit match_count;
$$;

-- Create index for fast similarity search
create index if not exists listings_embedding_idx
  on listings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);`;
}

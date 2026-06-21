-- Enable pgvector extension
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
  with (lists = 100);

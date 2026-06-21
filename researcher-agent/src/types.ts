export interface ItemListing {
  title: string;
  price: number;
  category: string;
  condition: string;
  location: string;
  description: string;
  meetup_preferences?: {
    door_pickup: boolean;
    door_dropoff: boolean;
    public_meetup: boolean;
  };
}

export interface ScrapedListing {
  source: string;
  title: string;
  price: number;
  condition: string;
  url: string;
  date?: string;
}

export interface PriceResearchResult {
  item: ItemListing;
  comparables: ScrapedListing[];
  suggestedPrice: number;
  priceRange: { low: number; high: number };
  reasoning: string;
  confidence: "low" | "medium" | "high";
}

export interface SearchQuery {
  query: string;
  site: string;
  url: string;
}

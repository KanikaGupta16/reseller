import dotenv from "dotenv";
dotenv.config();

export const config = {
  browserbase: {
    apiKey: process.env.BROWSERBASE_API_KEY || "",
    projectId: process.env.BROWSERBASE_PROJECT_ID || "",
    contextId: process.env.BROWSERBASE_CONTEXT_ID || "",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
  },
  supabase: {
    url: process.env.SUPABASE_URL || "",
    serviceKey: process.env.SUPABASE_SERVICE_KEY || "",
  },
};

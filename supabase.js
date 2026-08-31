import { createClient } from "@supabase/supabase-js";
import { logError } from "./lib/logger";

// These come from your Supabase project settings > API.
// Set them in .env.local (never commit real keys):
//   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxx
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // A missing env var here would otherwise surface as a confusing
  // "supabaseUrl is required" throw deep inside createClient with no
  // indication of which env var is the actual cause — log it explicitly.
  logError(
    "supabase.js",
    new Error("Missing Supabase env vars"),
    {
      hasUrl: Boolean(supabaseUrl),
      hasAnonKey: Boolean(supabaseAnonKey),
      hint: "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
    }
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.invalid",
  supabaseAnonKey || "placeholder-key"
);

import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY. Do not import this file from any component or page that
// runs in the browser — it uses the service role key, which bypasses RLS
// entirely. It must only ever be imported inside pages/api/*.js routes.
//
// Set SUPABASE_SERVICE_ROLE_KEY in Vercel (and .env.local) WITHOUT the
// NEXT_PUBLIC_ prefix — that prefix is what tells Next.js to ship a
// variable to the browser bundle, which we specifically do not want here.
// Find the key in Supabase dashboard → Settings → API → service_role.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

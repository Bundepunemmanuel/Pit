import { supabaseAdmin } from "../supabase-admin";
import { logError, logWarn } from "./logger";

// SERVER-ONLY (imports supabase-admin, which is itself server-only).
//
// Two layers, both required:
//   1. A valid, logged-in Supabase session (proves "this is a real
//      account with a correct password").
//   2. That session's email is on the ADMIN_EMAILS allowlist (proves
//      "this specific account is allowed to touch admin data" — a valid
//      Supabase login alone is NOT enough, anyone could sign up).
//
// Set ADMIN_EMAILS in the environment as a comma-separated list, e.g.
//   ADMIN_EMAILS=you@example.com,teammate@example.com
// Falls back to the three addresses below only if the env var is unset,
// so local dev / a fresh deploy without config isn't silently wide open
// to nobody — but in production, ALWAYS set ADMIN_EMAILS explicitly.
const DEFAULT_ADMIN_EMAILS = [
  "e8318276@gmail.com",
  "bundepunemmanuel@gmail.com",
  "emmybund@gmail.com",
];

function getAdminAllowlist() {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw || !raw.trim()) return DEFAULT_ADMIN_EMAILS;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// Reads the Supabase access token from the request's Authorization
// header ("Bearer <token>"), validates it against Supabase, and checks
// the resulting user's email against the allowlist. Returns
// { authorized: true, email } on success, or { authorized: false,
// status, error } on any failure — callers should return that status/
// error directly rather than throwing, since an admin route is still a
// normal API route that should fail predictably.
export async function requireAdmin(req) {
  try {
    const authHeader = req.headers?.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return { authorized: false, status: 401, error: "Not signed in" };
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user?.email) {
      if (error) {
        logWarn("lib/requireAdmin", "Token validation failed", {
          error: error.message,
        });
      }
      return { authorized: false, status: 401, error: "Invalid or expired session" };
    }

    const email = data.user.email.toLowerCase();
    const allowlist = getAdminAllowlist();

    if (!allowlist.includes(email)) {
      logWarn("lib/requireAdmin", "Rejected non-admin email", { email });
      return { authorized: false, status: 403, error: "Not authorized" };
    }

    return { authorized: true, email };
  } catch (err) {
    logError("lib/requireAdmin", err);
    return { authorized: false, status: 500, error: "Authorization check failed" };
  }
}

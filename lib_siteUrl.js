// Crawlers (WhatsApp, X, iMessage, Slack link unfurling, etc.) fetch
// og:image/twitter:image as an ABSOLUTE url — a relative path like
// "/api/og/some-slug" either fails outright or resolves inconsistently
// depending on the crawler, which is why link previews were showing no
// image at all (title/description are plain text and don't have this
// problem, which is why those still worked).
//
// Prefers NEXT_PUBLIC_SITE_URL if set (recommended in production, so
// this is never guessing). Falls back to the request's own host header,
// which correctly handles preview deployments and custom domains without
// needing per-environment config. Falls back to the known production
// domain only if neither is available (e.g. this got called somewhere
// without access to req, which shouldn't normally happen for page
// getServerSideProps).
const FALLBACK_SITE_URL = "https://zoloop.vercel.app";

export function getSiteUrl(req) {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");

  if (req?.headers) {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const proto =
      req.headers["x-forwarded-proto"] ||
      (host && host.startsWith("localhost") ? "http" : "https");
    if (host) return `${proto}://${host}`;
  }

  return FALLBACK_SITE_URL;
}

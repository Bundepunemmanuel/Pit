import sharp from "sharp";
import { supabaseAdmin } from "../../supabase-admin";
import { logError, logWarn } from "../../lib/logger";

// Uses the service-role client — writes never go through the anon key, so
// RLS can stay locked down for everyone else.
//
// This file does double duty:
//   GET  ?q=text          -> fuzzy/typo-tolerant product search (the two
//                             search boxes in the "Challenge a competitor"
//                             flow), via the search_products() Postgres
//                             function (see supabase-schema.sql)
//   GET  ?category=id     -> top-rated products in a category, used as
//                             "🔥 Recommended opponents"
//   POST                  -> create a new product (the inline "+ Add" mini
//                             form). Logo and description are OPTIONAL —
//                             if omitted, the server tries to auto-fetch
//                             them from the website's Open Graph tags.
//                             Manual values, when provided, always win.
//
// This route auto-publishes new products (status: "active"). The original
// architecture doc recommended a "pending" review queue instead,
// specifically to stop junk submissions — worth knowing that protection
// is off. If spam becomes a real problem, flipping the default status
// back to "pending" here is a one-line change.

const MAX_LOGO_BYTES = 2_000_000; // 2MB, matches the Supabase "logos" bucket limit
const ALLOWED_LOGO_MIME = "image/png"; // matches the bucket's PNG-only restriction
const METADATA_FETCH_TIMEOUT_MS = 6000;

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function normalizeUrl(input) {
  const trimmed = input.trim();
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function extractMetaContent(html, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

// Best-effort scrape of a page's Open Graph tags (or plain <title>/
// <meta name="description"> as a fallback), plus a guess at a logo image
// (og:image, falling back to /favicon.ico on the same origin). This is
// intentionally a lightweight regex parser rather than a full HTML
// parser dependency — good enough for OG tags, which are simple
// self-closing meta tags in practice.
//
// NOTE: this fetch runs at request time on the server (Vercel), not in
// any sandboxed environment — sites that block bot user agents, have no
// OG tags, or time out will make this return nulls, which callers must
// handle gracefully (never treat auto-fetch failure as a hard error).
async function fetchMetadata(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), METADATA_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Some sites refuse requests with no/bot-like user agent.
        "User-Agent":
          "Mozilla/5.0 (compatible; ZoloopBot/1.0; +https://zoloop.vercel.app)",
      },
    });
    if (!res.ok) {
      logWarn("api/submit-product.fetchMetadata", "Non-OK response", {
        url,
        status: res.status,
      });
      return { title: null, description: null, imageUrl: null };
    }

    const html = await res.text();

    const title = extractMetaContent(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
      /<title[^>]*>([^<]+)<\/title>/i,
    ]);

    const description = extractMetaContent(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
    ]);

    let imageUrl = extractMetaContent(html, [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    ]);

    if (imageUrl) {
      try {
        imageUrl = new URL(imageUrl, url).toString();
      } catch (err) {
        logWarn("api/submit-product.fetchMetadata", "Invalid og:image URL", {
          url,
          imageUrl,
        });
        imageUrl = null;
      }
    }

    if (!imageUrl) {
      // No og:image — look for a real <link rel="icon"> / apple-touch-icon
      // in the page instead of blindly guessing a path.
      const iconHref = extractMetaContent(html, [
        /<link[^>]+rel=["'](?:apple-touch-icon|icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i,
        /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:apple-touch-icon|icon|shortcut icon)["']/i,
      ]);
      if (iconHref) {
        try {
          imageUrl = new URL(iconHref, url).toString();
        } catch {
          imageUrl = null;
        }
      }
    }

    if (!imageUrl) {
      // Last resort: the conventional default path, even though most
      // modern sites declare an explicit <link rel="icon"> instead.
      try {
        imageUrl = new URL("/favicon.ico", url).toString();
      } catch {
        imageUrl = null;
      }
    }

    return { title, description, imageUrl };
  } catch (err) {
    logWarn("api/submit-product.fetchMetadata", "Fetch failed", {
      url,
      error: err?.message,
    });
    return { title: null, description: null, imageUrl: null };
  } finally {
    clearTimeout(timeout);
  }
}

// Downloads an image from anywhere and converts it to a PNG under the
// bucket's size limit, using sharp. Returns null (never throws) on any
// failure — callers treat that as "auto-fetch didn't work" and fall back
// to no logo, not a hard error.
async function fetchAndConvertLogo(imageUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), METADATA_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(imageUrl, {
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;

    const arrayBuffer = await res.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // Resize down if huge, always re-encode as PNG regardless of source
    // format (favicons are often .ico, OG images are often .jpg/.webp).
    const pngBuffer = await sharp(inputBuffer)
      .resize(512, 512, { fit: "cover" })
      .png({ compressionLevel: 9 })
      .toBuffer();

    if (pngBuffer.byteLength > MAX_LOGO_BYTES) return null;
    return pngBuffer;
  } catch (err) {
    logWarn("api/submit-product.fetchAndConvertLogo", "Failed", {
      imageUrl,
      error: err?.message,
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Honest, low-tech category guessing: naive keyword matching against the
// site's title + description, NOT an LLM or any ML model. Scores each
// category by how many of its associated keywords appear in the text and
// returns the highest-scoring one, or null if nothing matched at all.
// This is a starting suggestion the person can freely override — it will
// sometimes be wrong or miss entirely for niche products.
const CATEGORY_KEYWORDS = {
  ai: ["ai", "artificial intelligence", "llm", "gpt", "machine learning", "chatbot", "assistant"],
  productivity: ["productivity", "tasks", "todo", "to-do", "organize", "workflow"],
  "developer-tools": ["developer", "code", "api", "sdk", "ide", "programming", "github", "deploy"],
  design: ["design", "figma", "ui", "ux", "prototype", "mockup", "wireframe"],
  "note-taking": ["notes", "note-taking", "notebook", "wiki", "knowledge base"],
  collaboration: ["collaboration", "team", "together", "realtime", "meeting"],
  saas: ["saas", "software as a service", "cloud platform", "subscription"],
  marketing: ["marketing", "campaign", "seo", "ads", "advertising", "growth"],
  finance: ["finance", "banking", "accounting", "invoice", "payments", "budget"],
  business: ["business", "crm", "sales", "enterprise", "operations"],
  "e-commerce": ["ecommerce", "e-commerce", "shop", "store", "shopify", "cart", "retail"],
  "photo-video": ["photo", "video editing", "camera", "image editing"],
  music: ["music", "audio", "song", "playlist", "streaming music"],
  entertainment: ["entertainment", "movies", "tv show", "streaming"],
  games: ["game", "gaming", "play"],
  "health-fitness": ["health", "fitness", "workout", "wellness", "exercise"],
  education: ["education", "learning", "course", "school", "tutor"],
  travel: ["travel", "trip", "flight", "hotel", "booking"],
  shopping: ["shopping", "marketplace", "deals"],
  social: ["social network", "community", "friends", "share with"],
  utilities: ["utility", "converter", "calculator"],
  news: ["news", "articles", "journalism", "headlines"],
};

function guessCategorySlug(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  let bestSlug = null;
  let bestScore = 0;
  for (const [slug, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.reduce(
      (count, kw) => count + (lower.includes(kw) ? 1 : 0),
      0
    );
    if (score > bestScore) {
      bestScore = score;
      bestSlug = slug;
    }
  }
  return bestSlug;
}

async function handleGuessCategory(req, res) {
  const { url } = req.query;
  if (!url || !String(url).trim()) {
    return res.status(400).json({ error: "url query param is required" });
  }
  try {
    const normalizedUrl = normalizeUrl(String(url));
    const metadata = await fetchMetadata(normalizedUrl);
    const text = [metadata.title, metadata.description].filter(Boolean).join(" ");
    const guessedSlug = guessCategorySlug(text);

    if (!guessedSlug) {
      return res.status(200).json({ categorySlug: null });
    }

    const { data: category, error } = await supabaseAdmin
      .from("categories")
      .select("id, slug, name, icon")
      .eq("slug", guessedSlug)
      .maybeSingle();

    if (error) {
      logError("api/submit-product.guessCategory", error, { guessedSlug });
      return res.status(200).json({ categorySlug: null });
    }

    return res.status(200).json({ category: category ?? null });
  } catch (err) {
    logError("api/submit-product.guessCategory", err, { url });
    // Failure here should never block the form — just no suggestion.
    return res.status(200).json({ category: null });
  }
}

async function handleSearch(req, res) {
  const { q, category, exclude } = req.query;

  try {
    if (q && String(q).trim()) {
      const term = String(q).trim();
      const { data, error } = await supabaseAdmin.rpc("search_products", {
        search_term: term,
        result_limit: 8,
      });

      if (error) {
        logError("api/submit-product.search", error, { term });
        return res.status(500).json({ error: "Search failed" });
      }

      const products = (data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        rating: r.rating,
        category_id: r.category_id,
        logo_url: r.logo_url,
        category: r.category_name
          ? { name: r.category_name, icon: r.category_icon }
          : null,
      }));

      return res.status(200).json({ products });
    }

    if (category) {
      let query = supabaseAdmin
        .from("products")
        .select(
          "id, name, slug, rating, category_id, logo_url, category:category_id(name, icon)"
        )
        .eq("status", "active")
        .eq("category_id", category)
        .order("rating", { ascending: false })
        .limit(6);

      if (exclude) query = query.neq("id", exclude);

      const { data, error } = await query;
      if (error) {
        logError("api/submit-product.recommend", error, { category, exclude });
        return res.status(500).json({ error: "Could not load recommendations" });
      }
      return res.status(200).json({ products: data ?? [] });
    }

    logWarn("api/submit-product.search", "Missing q or category query param");
    return res.status(400).json({ error: "q or category query param is required" });
  } catch (err) {
    logError("api/submit-product.search", err, { q, category, exclude });
    return res.status(500).json({ error: "Search failed" });
  }
}

async function handleCreate(req, res) {
  try {
    const { name, websiteUrl, categoryId, description, logoDataUrl } =
      req.body || {};

    // Name, website, and category stay required — everything else
    // (logo, description) is optional and auto-filled from the website
    // when left blank, per the "create first" flow. A manually-provided
    // logo or description always takes precedence over auto-fetch.
    const missing = [];
    if (!name || !name.trim()) missing.push("product name");
    if (!websiteUrl || !websiteUrl.trim()) missing.push("website URL");
    if (!categoryId) missing.push("category");

    if (missing.length > 0) {
      logWarn("api/submit-product.create", "Missing required fields", { missing });
      return res.status(400).json({
        error: `Missing required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
      });
    }

    const cleanName = name.trim();
    const cleanWebsiteUrl = normalizeUrl(websiteUrl);
    const slug = slugify(cleanName) || `product-${Date.now()}`;

    // Auto-fetch metadata once, up front, so both the description and
    // logo fallbacks can use the same page fetch instead of two.
    let metadata = { title: null, description: null, imageUrl: null };
    const needsAutoDescription = !description || !description.trim();
    const needsAutoLogo = !logoDataUrl;
    if (needsAutoDescription || needsAutoLogo) {
      metadata = await fetchMetadata(cleanWebsiteUrl);
    }

    let finalDescription = description?.trim() || metadata.description || null;
    if (!finalDescription) {
      // Auto-fetch found nothing usable either — this is the one place
      // we still ask the person for something, since a product with zero
      // description anywhere makes for a genuinely unhelpful battle page.
      logWarn("api/submit-product.create", "No description available (manual or auto)", {
        slug,
      });
      return res.status(400).json({
        error:
          "Couldn't find a description on that site automatically — please add a short one.",
      });
    }
    if (finalDescription.length > 280) {
      finalDescription = finalDescription.slice(0, 280);
    }

    // Logo: use the manually-uploaded PNG if provided (validated exactly
    // as before). Otherwise, try auto-fetching one from the site — if
    // that also fails, the product just has no logo (falls back to a
    // letter avatar in the UI), which is NOT a hard error per the
    // "don't block creation on a logo" requirement.
    let logoUrl = null;
    let pngBuffer = null;

    if (logoDataUrl) {
      const match = /^data:(image\/\w+);base64,(.+)$/.exec(logoDataUrl);
      if (!match) {
        logWarn("api/submit-product.create", "Malformed logo data URL", { slug });
        return res.status(400).json({ error: "Logo must be a valid image file" });
      }
      const [, mimeType, base64Payload] = match;
      if (mimeType !== ALLOWED_LOGO_MIME) {
        logWarn("api/submit-product.create", "Rejected non-PNG logo", {
          slug,
          mimeType,
        });
        return res.status(400).json({ error: "Logo must be a PNG image" });
      }
      try {
        pngBuffer = Buffer.from(base64Payload, "base64");
      } catch (err) {
        logError("api/submit-product.decodeLogo", err, { slug });
        return res.status(400).json({ error: "Logo could not be decoded" });
      }
      if (pngBuffer.byteLength > MAX_LOGO_BYTES) {
        return res.status(400).json({ error: "Logo must be smaller than 2MB" });
      }
    } else if (metadata.imageUrl) {
      pngBuffer = await fetchAndConvertLogo(metadata.imageUrl);
      if (!pngBuffer) {
        logWarn("api/submit-product.create", "Auto-fetch logo failed, continuing without one", {
          slug,
          imageUrl: metadata.imageUrl,
        });
      }
    }

    if (pngBuffer) {
      const logoPath = `${slug}-${Date.now()}.png`;

      // Requires a public storage bucket named "logos", PNG-only, 2MB
      // limit — create it once in the Supabase dashboard (Storage → New
      // bucket → public, then restrict file types/size in the bucket
      // settings). See README for the exact steps.
      const { error: uploadError } = await supabaseAdmin.storage
        .from("logos")
        .upload(logoPath, pngBuffer, { contentType: ALLOWED_LOGO_MIME });

      if (uploadError) {
        const bucketMissing = /bucket not found/i.test(uploadError.message || "");
        logError("api/submit-product.uploadLogo", uploadError, {
          slug,
          logoPath,
          hint: bucketMissing
            ? "The 'logos' storage bucket doesn't exist yet — create it in Supabase dashboard → Storage → New bucket (public, PNG only, 2MB limit). See README."
            : undefined,
        });
        // Logo upload failing is NOT fatal to product creation — log it
        // clearly and continue without a logo rather than blocking.
      } else {
        const { data: publicUrlData, error: publicUrlError } =
          supabaseAdmin.storage.from("logos").getPublicUrl(logoPath);
        if (publicUrlError) {
          logError("api/submit-product.getPublicUrl", publicUrlError, { logoPath });
        }
        logoUrl = publicUrlData?.publicUrl ?? null;
      }
    }

    const { data: product, error: insertError } = await supabaseAdmin
      .from("products")
      .insert({
        name: cleanName,
        slug,
        description: finalDescription,
        logo_url: logoUrl,
        website_url: cleanWebsiteUrl,
        category_id: categoryId,
        status: "active", // auto-published, no review queue
      })
      .select("id, name, slug, rating, category_id, logo_url, website_url, description")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        logWarn("api/submit-product.create", "Duplicate product name rejected", {
          slug,
        });
        return res
          .status(409)
          .json({ error: "A product with that name already exists" });
      }
      logError("api/submit-product.insert", insertError, {
        slug,
        name: cleanName,
      });
      return res.status(500).json({ error: "Could not submit product" });
    }

    return res.status(200).json({ product });
  } catch (err) {
    logError("api/submit-product.create", err, { body: req.body });
    return res
      .status(500)
      .json({ error: "Something went wrong submitting your product" });
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      if (req.query.action === "guess-category") {
        return handleGuessCategory(req, res);
      }
      return handleSearch(req, res);
    }
    if (req.method === "POST") {
      return handleCreate(req, res);
    }
    res.setHeader("Allow", ["GET", "POST"]);
    logWarn("api/submit-product", "Rejected unsupported method", {
      method: req.method,
    });
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    logError("api/submit-product", err, { method: req.method });
    return res.status(500).json({ error: "Something went wrong" });
  }
}

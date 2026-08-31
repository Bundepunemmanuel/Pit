import { supabaseAdmin } from "../../supabase-admin";
import { logError, logWarn } from "../../lib/logger";

// Uses the service-role client — writes never go through the anon key, so
// RLS can stay locked down for everyone else.
//
// This file does double duty:
//   GET  ?q=text          -> live product search (the two search boxes in
//                             the "Start a Battle" flow)
//   GET  ?category=id     -> top-rated products in a category, used as
//                             "🔥 Recommended opponents"
//   POST                  -> create a new product (the "+ Add your
//                             product" mini form)
//
// This route auto-publishes new products (status: "active"). The original
// architecture doc recommended a "pending" review queue instead,
// specifically to stop junk submissions — worth knowing that protection
// is off. If spam becomes a real problem, flipping the default status
// back to "pending" here is a one-line change.

const MAX_DESCRIPTION_LENGTH = 280;
const MAX_LOGO_BYTES = 2_000_000; // 2MB, matches the Supabase "logos" bucket limit
const ALLOWED_LOGO_MIME = "image/png"; // matches the bucket's PNG-only restriction

const SEARCH_SELECT =
  "id, name, slug, rating, category_id, logo_url, category:category_id(name)";

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

async function handleSearch(req, res) {
  const { q, category, exclude } = req.query;

  try {
    if (q && String(q).trim()) {
      const term = String(q).trim();
      const { data, error } = await supabaseAdmin
        .from("products")
        .select(SEARCH_SELECT)
        .eq("status", "active")
        .ilike("name", `%${term}%`)
        .order("rating", { ascending: false })
        .limit(8);

      if (error) {
        logError("api/submit-product.search", error, { term });
        return res.status(500).json({ error: "Search failed" });
      }
      return res.status(200).json({ products: data ?? [] });
    }

    if (category) {
      let query = supabaseAdmin
        .from("products")
        .select(SEARCH_SELECT)
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

    // All five are required per product policy — no partial listings.
    const missing = [];
    if (!name || !name.trim()) missing.push("product name");
    if (!websiteUrl || !websiteUrl.trim()) missing.push("website URL");
    if (!categoryId) missing.push("category");
    if (!description || !description.trim()) missing.push("description");
    if (!logoDataUrl) missing.push("logo");

    if (missing.length > 0) {
      logWarn("api/submit-product.create", "Missing required fields", { missing });
      return res.status(400).json({
        error: `Missing required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`,
      });
    }

    if (description.trim().length > MAX_DESCRIPTION_LENGTH) {
      return res.status(400).json({
        error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`,
      });
    }

    const cleanName = name.trim();
    const cleanWebsiteUrl = /^https?:\/\//.test(websiteUrl.trim())
      ? websiteUrl.trim()
      : `https://${websiteUrl.trim()}`;
    const slug = slugify(cleanName) || `product-${Date.now()}`;

    // Logo: required, must be a PNG data URL, must be under the bucket's
    // 2MB limit. Checked here even though the form also checks client-side
    // — never trust client-side validation alone.
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

    let buffer;
    try {
      buffer = Buffer.from(base64Payload, "base64");
    } catch (err) {
      logError("api/submit-product.decodeLogo", err, { slug });
      return res.status(400).json({ error: "Logo could not be decoded" });
    }

    if (buffer.byteLength > MAX_LOGO_BYTES) {
      return res.status(400).json({ error: "Logo must be smaller than 2MB" });
    }

    const logoPath = `${slug}-${Date.now()}.png`;

    // Requires a public storage bucket named "logos", PNG-only, 2MB limit —
    // create it once in the Supabase dashboard (Storage → New bucket →
    // public, then restrict file types/size in the bucket settings). See
    // README for the exact steps.
    const { error: uploadError } = await supabaseAdmin.storage
      .from("logos")
      .upload(logoPath, buffer, { contentType: ALLOWED_LOGO_MIME });

    if (uploadError) {
      const bucketMissing = /bucket not found/i.test(uploadError.message || "");
      logError("api/submit-product.uploadLogo", uploadError, {
        slug,
        logoPath,
        hint: bucketMissing
          ? "The 'logos' storage bucket doesn't exist yet — create it in Supabase dashboard → Storage → New bucket (public, PNG only, 2MB limit). See README."
          : undefined,
      });
      return res.status(500).json({
        error: bucketMissing
          ? "Logo storage isn't set up yet. Please try again shortly."
          : "Could not upload logo",
      });
    }

    const { data: publicUrlData, error: publicUrlError } =
      supabaseAdmin.storage.from("logos").getPublicUrl(logoPath);

    if (publicUrlError) {
      logError("api/submit-product.getPublicUrl", publicUrlError, { logoPath });
    }
    const logoUrl = publicUrlData?.publicUrl ?? null;

    const { data: product, error: insertError } = await supabaseAdmin
      .from("products")
      .insert({
        name: cleanName,
        slug,
        description: description.trim(),
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

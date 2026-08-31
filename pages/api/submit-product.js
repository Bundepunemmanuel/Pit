import { supabaseAdmin } from "../../supabase-admin";
import { logError, logWarn } from "../../lib/logger";

// Uses the service-role client — same reasoning as vote.js: writes never
// go through the anon key, so RLS can stay locked down for everyone else.
//
// This route auto-publishes (status: "active"). The original architecture
// doc recommended a "pending" review queue instead, specifically to stop
// junk submissions — worth knowing that protection is off. If spam
// becomes a real problem, flipping the default status back to "pending"
// here is a one-line change.

const MAX_DESCRIPTION_LENGTH = 280;
const MAX_LOGO_BYTES = 1_000_000; // ~1MB, before base64 overhead

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      logWarn("api/submit-product", "Rejected non-POST request", {
        method: req.method,
      });
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { name, identifier, categoryId, description, logoDataUrl } =
      req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Product name is required" });
    }
    if (!identifier || !identifier.trim()) {
      return res
        .status(400)
        .json({ error: "A product URL or @handle is required" });
    }

    // Re-check the description limit server-side even though the form also
    // enforces it — never trust client-side validation alone.
    if (description && description.length > MAX_DESCRIPTION_LENGTH) {
      return res.status(400).json({
        error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`,
      });
    }

    const cleanName = name.trim();
    const cleanIdentifier = identifier.trim();
    const isUrl =
      /^https?:\/\//.test(cleanIdentifier) || cleanIdentifier.includes(".");
    const slug = slugify(cleanName) || `product-${Date.now()}`;

    // Optional logo upload. Expects a data URL, e.g. "data:image/png;base64,...."
    let logoUrl = null;
    if (logoDataUrl) {
      const match = /^data:(image\/\w+);base64,(.+)$/.exec(logoDataUrl);
      if (!match) {
        logWarn("api/submit-product", "Rejected malformed logo data URL", {
          slug,
        });
        return res.status(400).json({ error: "Logo must be a valid image file" });
      }
      const [, mimeType, base64Payload] = match;

      let buffer;
      try {
        buffer = Buffer.from(base64Payload, "base64");
      } catch (err) {
        logError("api/submit-product.decodeLogo", err, { slug });
        return res.status(400).json({ error: "Logo could not be decoded" });
      }

      if (buffer.byteLength > MAX_LOGO_BYTES) {
        return res.status(400).json({ error: "Logo must be smaller than 1MB" });
      }

      const ext = mimeType.split("/")[1] || "png";
      const path = `${slug}-${Date.now()}.${ext}`;

      // Requires a public storage bucket named "logos" — create it once in
      // the Supabase dashboard (Storage → New bucket → public). See README.
      const { error: uploadError } = await supabaseAdmin.storage
        .from("logos")
        .upload(path, buffer, { contentType: mimeType });

      if (uploadError) {
        logError("api/submit-product.uploadLogo", uploadError, {
          slug,
          path,
          mimeType,
        });
        return res.status(500).json({ error: "Could not upload logo" });
      }

      const { data: publicUrlData, error: publicUrlError } =
        supabaseAdmin.storage.from("logos").getPublicUrl(path);

      if (publicUrlError) {
        logError("api/submit-product.getPublicUrl", publicUrlError, { path });
      }

      logoUrl = publicUrlData?.publicUrl ?? null;
    }

    const { error: insertError } = await supabaseAdmin.from("products").insert({
      name: cleanName,
      slug,
      description: description?.trim() || null,
      logo_url: logoUrl,
      website_url: isUrl
        ? cleanIdentifier.replace(/^(?!https?:\/\/)/, "https://")
        : null,
      twitter_handle: !isUrl ? cleanIdentifier.replace(/^@/, "") : null,
      category_id: categoryId || null,
      status: "active", // auto-published, no review queue
    });

    if (insertError) {
      if (insertError.code === "23505") {
        logWarn("api/submit-product", "Duplicate product name rejected", {
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

    return res.status(200).json({ ok: true, slug });
  } catch (err) {
    logError("api/submit-product", err, { body: req.body });
    return res
      .status(500)
      .json({ error: "Something went wrong submitting your product" });
  }
}

import { supabaseAdmin as supabase } from "../../supabase-admin";
import { logError, logWarn } from "../../lib/logger";

// GET /api/click?battleId=...&productId=...
//
// Every "Visit" button on a battle/product page routes through here
// first, rather than linking straight to the product's website_url. This
// is what lets battles.clicks be a real number instead of permanently 0
// (the column existed for a while with nothing writing to it).
//
// Looks up the product's website_url server-side rather than trusting a
// client-supplied redirect target — accepting an arbitrary `?url=`
// param and redirecting to it would be an open-redirect vector. Only
// known product URLs, fetched from the database, are ever redirected to.
export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", ["GET"]);
      logWarn("api/click", "Rejected non-GET request", { method: req.method });
      return res.status(405).end();
    }

    const { battleId, productId } = req.query;
    if (!productId) {
      logWarn("api/click", "Missing productId");
      return res.redirect(302, "/");
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, website_url, clicks")
      .eq("id", productId)
      .single();

    if (productError || !product?.website_url) {
      if (productError) {
        logError("api/click.fetchProduct", productError, { productId });
      } else {
        logWarn("api/click", "Product has no website_url", { productId });
      }
      return res.redirect(302, "/");
    }

    const { error: productClicksError } = await supabase
      .from("products")
      .update({ clicks: (product.clicks ?? 0) + 1 })
      .eq("id", productId);
    if (productClicksError) {
      logError("api/click.incrementProductClicks", productClicksError, { productId });
    }

    if (battleId) {
      // Best-effort — a failed click-count increment shouldn't block the
      // redirect, the person is still trying to get to the site.
      const { data: battle, error: fetchError } = await supabase
        .from("battles")
        .select("clicks")
        .eq("id", battleId)
        .single();

      if (fetchError) {
        logError("api/click.fetchBattle", fetchError, { battleId });
      } else {
        const { error: updateError } = await supabase
          .from("battles")
          .update({ clicks: (battle.clicks ?? 0) + 1 })
          .eq("id", battleId);
        if (updateError) {
          logError("api/click.incrementClicks", updateError, { battleId });
        }
      }
    }

    return res.redirect(302, product.website_url);
  } catch (err) {
    logError("api/click", err, { query: req.query });
    return res.redirect(302, "/");
  }
}

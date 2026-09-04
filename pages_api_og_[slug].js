import { ImageResponse } from "@vercel/og";
import { supabaseAdmin as supabase } from "../../../supabase-admin";
import { logError } from "../../../lib/logger";

// GET /api/og/[slug] -> a 1200x630 PNG summarizing the battle's result,
// e.g. "Claude defeated ChatGPT 54%-46% · 23,767 votes · AI · 1,240 views".
// This is what the Share button and any social link preview (Twitter/OG
// card meta tags) point at.
//
// Runs on the edge runtime, which @vercel/og is built for. Falls back to
// a plain-text/minimal image on any error rather than a broken image —
// social platforms handle a missing/broken OG image poorly.
export const config = {
  runtime: "edge",
};

const WIDTH = 1200;
const HEIGHT = 630;

function errorImage(message) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F2EEE4",
          fontSize: 32,
          color: "#0B0C10",
        }}
      >
        {message}
      </div>
    ),
    { width: WIDTH, height: HEIGHT }
  );
}

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    const slug = url.pathname.split("/").pop();

    if (!slug) {
      return errorImage("Zoloop");
    }

    const { data: battle, error } = await supabase
      .from("battles")
      .select(
        "slug, votes_a, votes_b, votes_a_boost, votes_b_boost, views, question, product_a:product_a_id(name, logo_url, category:category_id(name)), product_b:product_b_id(name, logo_url)"
      )
      .eq("slug", slug)
      .single();

    if (error || !battle) {
      if (error) {
        logError("api/og/[slug]", error, { slug });
      }
      return errorImage("Battle not found");
    }

    const votesA = battle.votes_a + (battle.votes_a_boost ?? 0);
    const votesB = battle.votes_b + (battle.votes_b_boost ?? 0);
    const total = votesA + votesB;
    const pctA = total > 0 ? Math.round((votesA / total) * 100) : 50;
    const pctB = 100 - pctA;
    const leaderName = pctA >= pctB ? battle.product_a.name : battle.product_b.name;
    const otherName = pctA >= pctB ? battle.product_b.name : battle.product_a.name;
    const leaderPct = Math.max(pctA, pctB);
    const otherPct = Math.min(pctA, pctB);

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "64px",
            background: "#F2EEE4",
            fontFamily: "sans-serif",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "#0B0C10",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#F2EEE4",
                fontSize: 22,
                fontWeight: 700,
              }}
            >
              Z
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#0B0C10" }}>ZOLOOP</div>
          </div>

          <div style={{ display: "flex", fontSize: 56, fontWeight: 700, color: "#0B0C10" }}>
            {leaderName} defeated {otherName}
          </div>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: "#FE4C12", marginTop: 12 }}>
            {leaderPct}% – {otherPct}%
          </div>

          <div style={{ display: "flex", gap: 24, marginTop: 40, fontSize: 24, color: "#82838C" }}>
            <div style={{ display: "flex" }}>{total.toLocaleString()} votes</div>
            {battle.product_a.category?.name && (
              <div style={{ display: "flex" }}>· {battle.product_a.category.name}</div>
            )}
            <div style={{ display: "flex" }}>· {(battle.views ?? 0).toLocaleString()} views</div>
          </div>
        </div>
      ),
      { width: WIDTH, height: HEIGHT }
    );
  } catch (err) {
    logError("api/og/[slug]", err);
    return errorImage("Zoloop");
  }
}

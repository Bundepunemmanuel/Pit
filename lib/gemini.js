import { GoogleGenerativeAI } from "@google/generative-ai";
import { logError, logWarn } from "./logger";

// Model name as requested. Google renames/deprecates Gemini model
// strings from time to time — if this starts failing with a
// "model not found"-style error, check
// https://ai.google.dev/gemini-api/docs/models for the current name and
// update this one constant.
const MODEL_NAME = "gemini-3.5-flash-lite";
const GEMINI_TIMEOUT_MS = 8000;

let client = null;
function getClient() {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logWarn("lib/gemini", "GEMINI_API_KEY is not set — AI features disabled", {
      hint: "Set GEMINI_API_KEY in Vercel's environment variables",
    });
    return null;
  }
  client = new GoogleGenerativeAI(apiKey);
  return client;
}

async function generateWithTimeout(prompt) {
  const genAI = getClient();
  if (!genAI) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    const result = await model.generateContent(prompt, { signal: controller.signal });
    return result.response.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Suggests 3-5 real competitors for a product, each with a best-guess
 * website domain. Returns [] on any failure — callers must treat that as
 * "no suggestions available" and never block on it, since this is
 * explicitly an opt-in, button-triggered feature, not something in the
 * critical path of adding a product.
 */
export async function suggestCompetitors({ name, description, categoryName }) {
  try {
    const prompt = `You are helping identify real, well-known competitors for a software product.

Product: ${name}
Category: ${categoryName || "unknown"}
Description: ${description || "not provided"}

List 3 to 5 REAL, currently-operating competitor products (not the same product, not a made-up product). For each, give its name and its actual primary website domain (e.g. "notion.so", not "https://notion.so/" and not a made-up guess if you are not confident).

Respond with ONLY a JSON array, no markdown formatting, no explanation. Example format:
[{"name": "Competitor Name", "domain": "example.com"}]`;

    const text = await generateWithTimeout(prompt);
    if (!text) return [];

    // Gemini sometimes wraps JSON in a markdown code fence despite being
    // asked not to — strip that before parsing.
    const cleaned = text.replace(/```json\s*|```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      logWarn("lib/gemini.suggestCompetitors", "Response was not a JSON array", {
        name,
        rawText: text.slice(0, 200),
      });
      return [];
    }

    return parsed
      .filter((item) => item && typeof item.name === "string" && typeof item.domain === "string")
      .slice(0, 5)
      .map((item) => ({ name: item.name.trim(), domain: item.domain.trim() }));
  } catch (err) {
    // Deliberately not re-thrown — a failed suggestion should degrade to
    // "no suggestions", never break the page or the add-product flow.
    logError("lib/gemini.suggestCompetitors", err, { name });
    return [];
  }
}

/**
 * Generates a specific, non-generic battle question grounded in what the
 * two products actually do — e.g. "Which handles large codebases
 * better?" instead of "Which is better?". Returns null on any failure;
 * callers fall back to the generic template.
 */
export async function generateBattleQuestion({
  productAName,
  productADescription,
  productBName,
  productBDescription,
  categoryName,
}) {
  try {
    const prompt = `Two products are about to be compared in a head-to-head public vote.

Product A: ${productAName} — ${productADescription || "no description available"}
Product B: ${productBName} — ${productBDescription || "no description available"}
Category: ${categoryName || "unknown"}

Write ONE short, specific question for people to vote on. It must NOT be a generic question like "Which is better?" or "Which do you prefer?" — and it should NOT just be a neutral feature comparison either (avoid "Which handles X better?" phrasing).

Instead, ground the question in a real debate or divided opinion people already have about these two products — the kind of argument that actually happens among their users (e.g. speed vs. polish, hype vs. substance, price vs. power, "everyone's switching" vs. "loyalists swear by the original"). Phrase it so answering feels like picking a side, not filling out a spec sheet — natural, slightly provocative language is good (referencing what fans of each say, a common hot take, or "which is overrated"). If you don't know of a specific real debate, invent a plausible, specific one grounded in what each product is known for rather than falling back to a generic comparison.

Respond with ONLY the question text, nothing else — no quotes, no markdown, no explanation. Keep it under 80 characters.`;

    const text = await generateWithTimeout(prompt);
    if (!text) return null;

    const question = text.trim().replace(/^["']|["']$/g, "");
    if (!question || question.length > 140) {
      logWarn("lib/gemini.generateBattleQuestion", "Unusable response", {
        productAName,
        productBName,
        rawText: text.slice(0, 200),
      });
      return null;
    }
    return question;
  } catch (err) {
    logError("lib/gemini.generateBattleQuestion", err, { productAName, productBName });
    return null;
  }
}

/**
 * Fallback description generator, used ONLY when a site has genuinely no
 * og:description/meta description/twitter:description at all — the one
 * gap the HTML-scraping auto-fetch structurally can't fill on its own.
 * Returns null on any failure; caller falls back to requiring a manual
 * description, same as before this existed.
 */
export async function generateDescription({ title, textSnippet }) {
  try {
    const prompt = `Based on this webpage's title and visible text, write a single, factual 1-2 sentence product description (under 200 characters). Do not invent features you're not confident about from the text given.

Title: ${title || "unknown"}
Page text: ${(textSnippet || "").slice(0, 1500)}

Respond with ONLY the description text, nothing else.`;

    const text = await generateWithTimeout(prompt);
    if (!text) return null;

    const description = text.trim().replace(/^["']|["']$/g, "");
    if (!description || description.length > 280) return null;
    return description;
  } catch (err) {
    logError("lib/gemini.generateDescription", err, { title });
    return null;
  }
}

// Shared structured logger.
//
// Goal: every error caught anywhere in the app (server or browser) prints
// one single-line JSON blob to the console with a timestamp, WHERE it
// happened, and WHY. That means:
//   - On Vercel/Node, this shows up in the function logs, searchable by
//     `context`.
//   - In the browser, it shows up in devtools console, same shape.
//
// Usage:
//   import { logError, logInfo } from "../lib/logger";
//   try { ... } catch (err) { logError("api/vote", err, { battleId }); }

function isServer() {
  return typeof window === "undefined";
}

function serializeError(err) {
  if (!err) return { message: "Unknown error (no error object thrown)" };
  if (err instanceof Error) {
    return {
      message: err.message,
      name: err.name,
      stack: err.stack,
    };
  }
  // Supabase/PostgREST errors are plain objects — {message, code,
  // details, hint} — NOT instances of the JS Error class. Without this
  // branch they fell through to String(err), which for a plain object
  // just produces the useless literal string "[object Object]",
  // silently discarding the actual cause. Pull out every field that
  // might exist rather than assuming the shape.
  if (typeof err === "object") {
    const { message, code, details, hint, name } = err;
    if (message || code || details || hint) {
      return {
        message: message || "Error object with no message field",
        code,
        details,
        hint,
        name,
      };
    }
  }
  // Something else non-Error was thrown (string, number, etc.).
  try {
    return { message: String(err) };
  } catch {
    return { message: "Unserializable error value" };
  }
}

function emit(level, context, payload) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    env: isServer() ? "server" : "client",
    context,
    ...payload,
  };

  const line = JSON.stringify(entry);

  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line);
  } else if (level === "warn") {
    // eslint-disable-next-line no-console
    console.warn(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }

  return entry;
}

/**
 * Log an error with full context so the cause is traceable.
 * @param {string} context - where this happened, e.g. "api/vote" or "BattleCard.castVote"
 * @param {unknown} err - the caught error/value
 * @param {object} [extra] - any additional structured detail (ids, inputs, etc.)
 */
export function logError(context, err, extra = {}) {
  return emit("error", context, { error: serializeError(err), ...extra });
}

/**
 * Log a non-fatal warning (e.g. a request rejected by validation).
 */
export function logWarn(context, message, extra = {}) {
  return emit("warn", context, { message, ...extra });
}

/**
 * Log routine info, useful for tracing what happened without an error.
 */
export function logInfo(context, message, extra = {}) {
  return emit("info", context, { message, ...extra });
}

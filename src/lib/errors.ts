import { Toast, showToast } from "@raycast/api";
import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  RateLimitError,
  SessionExpiredError,
} from "spoo.me";

const FRIENDLY_MESSAGES: Record<string, string> = {
  validation_error: "Check the input and try again.",
  authentication_error: "You need to sign in again.",
  not_found: "Couldn't find that.",
  conflict: "That alias is already taken.",
  forbidden: "You don't have access to this.",
  gone: "This link has expired.",
  blocked: "This URL was flagged as malicious.",
  rate_limit_exceeded: "Slow down — you've hit the rate limit.",
  password_required: "This link is password-protected.",
  invalid_password: "That password is incorrect.",
  feature_disabled: "Your account doesn't have access to this feature.",
  EMAIL_NOT_VERIFIED: "Verify your email address first.",
  payload_too_large: "That's too large for the server to accept.",
  http_502: "spoo.me is having a moment. Try again shortly.",
  http_503: "spoo.me is having a moment. Try again shortly.",
  http_504: "spoo.me is having a moment. Try again shortly.",
};

const EMOJI: Record<string, string> = {
  gone: "🪦",
  blocked: "⚠️",
  rate_limit_exceeded: "🐌",
  not_found: "🔍",
  conflict: "🔒",
};

export function friendlyMessage(err: unknown): string {
  if (err instanceof SessionExpiredError) {
    return "Session expired. Please sign in again.";
  }
  if (err instanceof APITimeoutError) {
    return "spoo.me took too long to respond. Try again.";
  }
  if (err instanceof APIConnectionError) {
    return "Couldn't reach spoo.me. Check your connection.";
  }
  if (err instanceof APIError) {
    const base = FRIENDLY_MESSAGES[err.code];
    // http_* codes are synthesized from non-JSON responses (proxy or edge
    // error pages); never surface their body text in a toast.
    if (/^http_\d+$/.test(err.code)) {
      return (
        base ??
        `The server returned an unexpected response (HTTP ${err.status}).`
      );
    }
    const detail = err.body.error;
    return base ? `${base} ${detail}`.trim() : detail;
  }
  return err instanceof Error ? err.message : String(err);
}

export async function reportError(err: unknown): Promise<void> {
  if (err instanceof APIError) {
    const emoji = EMOJI[err.code] ?? "";
    const retryAfter =
      err instanceof RateLimitError ? err.rateLimit.retryAfter : undefined;
    await showToast({
      style: Toast.Style.Failure,
      title: `${emoji} ${friendlyMessage(err)}`.trim(),
      message: retryAfter
        ? `Retry in ${retryAfter}s`
        : err.field
          ? `Field: ${err.field}`
          : undefined,
    });
    return;
  }
  if (err instanceof SessionExpiredError || err instanceof APIConnectionError) {
    await showToast({
      style: Toast.Style.Failure,
      title: friendlyMessage(err),
    });
    return;
  }
  await showToast({
    style: Toast.Style.Failure,
    title: "Something went wrong",
    message: err instanceof Error ? err.message : String(err),
  });
}

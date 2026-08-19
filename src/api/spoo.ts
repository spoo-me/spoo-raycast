import {
  clearSession,
  getTokenCredential,
  invalidateCredential,
} from "@/api/auth";
import { CLIENT_TAG, getApiBaseUrl } from "@/constants";
import { ensureCacheScope } from "@/lib/cache";
import { AuthenticationError, SessionExpiredError, Spoo } from "spoo.me";

let cached: { baseUrl: string; client: Spoo } | undefined;

/**
 * The authenticated SDK client. The token is resolved lazily per request from
 * the stored OAuth session, so one client instance survives sign-in/sign-out.
 */
export function getSpooClient(): Spoo {
  const baseUrl = getApiBaseUrl();
  if (cached?.baseUrl === baseUrl) return cached.client;
  ensureCacheScope(baseUrl);
  const client = new Spoo({
    baseUrl,
    clientTag: CLIENT_TAG,
    // Raycast UIs block on these calls; never let a flaky request (or its
    // retries, timed per attempt) hang a view for the SDK's default 60s.
    timeout: 15_000,
    token: async () => {
      const credential = await getTokenCredential();
      if (!credential) throw new SessionExpiredError();
      return credential();
    },
  });
  cached = { baseUrl, client };
  return client;
}

/**
 * Run an SDK call with reactive 401 recovery: on AuthenticationError the
 * cached access token is invalidated (forcing a refresh) and the call is
 * retried exactly once. A rejected refresh (SessionExpiredError) clears the
 * stored session so the auth gate surfaces sign-in.
 */
export async function withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await run(fn);
  } catch (err) {
    if (!(err instanceof AuthenticationError)) throw err;
    invalidateCredential();
    return run(fn);
  }
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof SessionExpiredError) await clearSession();
    throw err;
  }
}

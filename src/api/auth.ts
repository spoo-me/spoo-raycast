import { CLIENT_TAG, getApiBaseUrl } from "@/constants";
import { buildAuthorizationRequest, oauthClient } from "@/lib/oauth";
import { type DeviceTokens, Spoo, type TokenProvider } from "spoo.me";

const FALLBACK_TTL_SECONDS = 15 * 60;

/**
 * Anonymous client for the OAuth protocol calls (code exchange, refresh).
 * These endpoints authenticate via the request body, never a bearer header,
 * so they must not ride the authenticated client.
 */
let anon: { baseUrl: string; client: Spoo } | undefined;

function anonClient(): Spoo {
  const baseUrl = getApiBaseUrl();
  if (anon?.baseUrl === baseUrl) return anon.client;
  anon = { baseUrl, client: new Spoo({ baseUrl, clientTag: CLIENT_TAG }) };
  return anon.client;
}

/**
 * The SDK's self-refreshing credential, seeded from Raycast's token storage.
 * Rebuilt whenever the stored access token changes underneath us (fresh
 * sign-in, another command refreshed) or the base URL preference changes.
 */
let credential:
  | { baseUrl: string; currentAccess: string; provider: TokenProvider }
  | undefined;

export async function getTokenCredential(): Promise<TokenProvider | null> {
  const tokens = await oauthClient.getTokens();
  if (!tokens?.accessToken || !tokens.refreshToken) return null;
  const baseUrl = getApiBaseUrl();
  if (
    credential &&
    credential.baseUrl === baseUrl &&
    credential.currentAccess === tokens.accessToken
  ) {
    return credential.provider;
  }

  const entry = {
    baseUrl,
    currentAccess: tokens.accessToken,
    provider: anonClient().oauth.tokenProvider({
      tokens: {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      },
      onRefresh: async (rotated) => {
        if (credential === entry) {
          entry.currentAccess = rotated.access_token;
        }
        await persistTokens(rotated.access_token, rotated.refresh_token);
      },
    }),
  };
  credential = entry;
  return entry.provider;
}

/** Force the next request to refresh the access token (retry-on-401). */
export function invalidateCredential(): void {
  credential?.provider.invalidate();
}

/** The refresh token was rejected — drop the session so sign-in resurfaces. */
export async function clearSession(): Promise<void> {
  credential = undefined;
  await oauthClient.removeTokens();
}

export async function signIn(): Promise<DeviceTokens> {
  const request = await buildAuthorizationRequest(getApiBaseUrl());
  const { authorizationCode } = await oauthClient.authorize(request);
  const tokens = await anonClient().oauth.exchangeCode({
    code: authorizationCode,
    codeVerifier: request.codeVerifier,
  });
  credential = undefined;
  await persistTokens(tokens.access_token, tokens.refresh_token);
  return tokens;
}

export async function signOut(): Promise<void> {
  await clearSession();
}

export async function getStoredTokens() {
  return oauthClient.getTokens();
}

async function persistTokens(accessToken: string, refreshToken: string) {
  await oauthClient.setTokens({
    accessToken,
    refreshToken,
    expiresIn: expiresInFromJwt(accessToken),
  });
}

/** Read the JWT `exp` claim; fall back to 15 minutes if unreadable. */
function expiresInFromJwt(accessToken: string): number {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return FALLBACK_TTL_SECONDS;
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    const exp = decoded?.exp;
    if (typeof exp !== "number") return FALLBACK_TTL_SECONDS;
    const seconds = Math.floor(exp - Date.now() / 1000);
    return seconds > 0 ? seconds : FALLBACK_TTL_SECONDS;
  } catch {
    return FALLBACK_TTL_SECONDS;
  }
}

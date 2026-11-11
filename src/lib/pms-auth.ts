import { apiError, isObject } from "./response";
import { fetchEmaText } from "./transport";

export interface PmsCredentials {
  EMA_PMS_ACCESS_TOKEN?: string;
  EMA_PMS_CLIENT_ID?: string;
  EMA_PMS_CLIENT_SECRET?: string;
  EMA_PMS_TOKEN_URL?: string;
  EMA_PMS_SCOPE?: string;
}

/** Credentials and token exchange stay in the host, never in the Code Mode isolate. */
export function createPmsAuth(env: PmsCredentials, fetcher: typeof fetch = fetch) {
  let cached: { token: string; expires: number } | undefined;
  let pending: Promise<string> | undefined;
  const validToken = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9._~+/-]+=*$/.test(value);
  async function exchange(): Promise<string> {
    const data = await exchangePmsToken(env, fetcher, validToken);
    const seconds = Number(data.expires_in);
    // Missing/invalid expiry: usable for this call only, never cached indefinitely.
    if (Number.isFinite(seconds) && seconds > 60) cached = { token: data.access_token, expires: Date.now() + (Math.min(seconds, 3600) - 60) * 1000 };
    return data.access_token;
  }
  return {
    async token() {
      if (env.EMA_PMS_ACCESS_TOKEN) {
        const token = env.EMA_PMS_ACCESS_TOKEN.trim();
        if (!validToken(token)) throw new Error("EMA_PMS_ACCESS_TOKEN must contain only the Bearer token, without its prefix");
        return token;
      }
      if (cached && cached.expires > Date.now()) return cached.token;
      if (!pending) pending = exchange().finally(() => { pending = undefined; });
      return pending;
    },
    invalidate() { cached = undefined; },
  };
}

async function exchangePmsToken(env: PmsCredentials, fetcher: typeof fetch, validToken: (value: unknown) => value is string) {
  if (!env.EMA_PMS_CLIENT_ID || !env.EMA_PMS_CLIENT_SECRET || !env.EMA_PMS_TOKEN_URL) {
    apiError("PMS public data requires EMA registration. Configure EMA_PMS_ACCESS_TOKEN, or EMA_PMS_CLIENT_ID, EMA_PMS_CLIENT_SECRET and EMA_PMS_TOKEN_URL from the registration details (plus EMA_PMS_SCOPE if required). Website feeds remain anonymous.", 401);
  }
  let url: URL;
  try { url = new URL(env.EMA_PMS_TOKEN_URL); } catch { throw new Error("Invalid EMA_PMS_TOKEN_URL configuration"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) throw new Error("EMA_PMS_TOKEN_URL must be the registered HTTPS token endpoint without query, fragment or userinfo");
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: env.EMA_PMS_CLIENT_ID, client_secret: env.EMA_PMS_CLIENT_SECRET });
  if (env.EMA_PMS_SCOPE) body.set("scope", env.EMA_PMS_SCOPE);
  // Never forward token endpoint bodies/errors, which may contain credentials or tokens.
  let response: Response;
  let text: string;
  try {
    ({ response, text } = await fetchEmaText(url.toString(), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: body.toString() }, 64000, 15000, fetcher));
  } catch { throw new Error("PMS token exchange failed; check registered endpoint and credentials in the Worker environment"); }
  if (response.status !== 200 || response.headers.has("content-range")) apiError(`PMS token exchange returned HTTP ${response.status}`, response.ok ? 502 : response.status, { retry_after: response.headers.get("retry-after") });
  let data: unknown;
  try { data = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { throw new Error("PMS token endpoint returned invalid JSON"); }
  if (!isObject(data) || !validToken(data.access_token) || (data.token_type !== undefined && String(data.token_type).toLowerCase() !== "bearer")) throw new Error("PMS token endpoint did not return a valid Bearer token");
  return { ...data, access_token: data.access_token, expires_in: data.expires_in };
}

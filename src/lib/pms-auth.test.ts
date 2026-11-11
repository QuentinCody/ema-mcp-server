import { afterEach, expect, it, vi } from "vitest";
import { createPmsAuth } from "./pms-auth";

afterEach(() => vi.useRealTimers());
const config = { EMA_PMS_CLIENT_ID: "fixture-id", EMA_PMS_CLIENT_SECRET: "fixture&secret", EMA_PMS_TOKEN_URL: "https://identity.example.test/token", EMA_PMS_SCOPE: "fixture-scope" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

it("fails unconfigured PMS without attempting anonymous data access", async () => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(createPmsAuth({}, fetcher).token()).rejects.toMatchObject({ status: 401 });
  expect(fetcher).not.toHaveBeenCalled();
});
it("injects a supplied token without exposing it or requesting a new token", async () => {
  const fetcher = vi.fn<typeof fetch>();
  expect(await createPmsAuth({ EMA_PMS_ACCESS_TOKEN: "fixture.jwt.token" }, fetcher).token()).toBe("fixture.jwt.token");
  expect(fetcher).not.toHaveBeenCalled();
  await expect(createPmsAuth({ EMA_PMS_ACCESS_TOKEN: "Bearer bad" }, fetcher).token()).rejects.toThrow(/without its prefix/);
});
it("uses the configured OAuth form, coalesces calls, and renews before expiry", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-28T00:00:00Z"));
  let exchanges = 0;
  const fetcher = vi.fn<typeof fetch>(async () => json({ access_token: `token-${++exchanges}`, expires_in: 3600, token_type: "Bearer" }));
  const auth = createPmsAuth(config, fetcher);
  expect(await Promise.all([auth.token(), auth.token()])).toEqual(["token-1", "token-1"]);
  const [url, init] = fetcher.mock.calls[0];
  expect(url).toBe(config.EMA_PMS_TOKEN_URL);
  const form = new URLSearchParams(String(init?.body));
  expect(Object.fromEntries(form)).toEqual({ grant_type: "client_credentials", client_id: "fixture-id", client_secret: "fixture&secret", scope: "fixture-scope" });
  expect(init).toMatchObject({ method: "POST", redirect: "manual", signal: expect.any(AbortSignal) });
  vi.setSystemTime(new Date("2026-09-28T00:58:59Z"));
  expect(await auth.token()).toBe("token-1");
  vi.setSystemTime(new Date("2026-09-28T00:59:00Z"));
  expect(await auth.token()).toBe("token-2");
  auth.invalidate(); expect(await auth.token()).toBe("token-3");
});
it("does not forward credential-bearing token errors or automatically retry them", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response("fixture&secret", { status: 401 }));
  let error: unknown;
  try { await createPmsAuth(config, fetcher).token(); } catch (caught) { error = caught; }
  expect(error).toMatchObject({ status: 401 });
  expect(String(error) + JSON.stringify(error)).not.toContain("fixture&secret");
  expect(fetcher).toHaveBeenCalledOnce();
});
it("rejects unsafe token endpoint configuration before sending secrets", async () => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(createPmsAuth({ ...config, EMA_PMS_TOKEN_URL: "http://identity.example.test/token" }, fetcher).token()).rejects.toThrow(/HTTPS/);
  expect(fetcher).not.toHaveBeenCalled();
});
it("does not cache tokens without a usable expiry or cache failed exchange promises", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ error: "invalid_client" }, 400)).mockImplementation(async () => json({ access_token: "fixture-token" }));
  const auth = createPmsAuth(config, fetcher);
  await expect(auth.token()).rejects.toThrow(/HTTP 400/);
  expect(await auth.token()).toBe("fixture-token");
  expect(await auth.token()).toBe("fixture-token");
  expect(fetcher).toHaveBeenCalledTimes(3);
});

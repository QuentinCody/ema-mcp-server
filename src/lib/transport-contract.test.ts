import { afterEach, expect, it, vi } from "vitest";
import { createEmaApiFetch } from "./api-adapter";
import { createPmsAuth } from "./pms-auth";
import { createPmsFetch } from "./pms";
import { boundedText } from "./response";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const token = "fixture-token";
const bundle = { resourceType: "Bundle", type: "searchset", total: 0, entry: [] };
const config = { EMA_PMS_CLIENT_ID: "fixture-id", EMA_PMS_CLIENT_SECRET: "fixture-secret", EMA_PMS_TOKEN_URL: "https://identity.example.test/token" };
const pmsRequest = { method: "GET", path: "/pms/MedicinalProductDefinition" };

it.each(["pms", "token"])("rejects partial %s responses without exposing credentials", async kind => {
  for (const [status, headers] of [[206, {}], [200, { "content-range": "bytes 0-20/50" }]] as const) {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(kind === "pms" ? bundle : { access_token: token }, { status, headers }));
    let error: unknown;
    try {
      if (kind === "pms") await createPmsFetch({ EMA_PMS_ACCESS_TOKEN: token }, fetcher)(pmsRequest);
      else await createPmsAuth(config, fetcher).token();
    } catch (caught) { error = caught; }
    expect(error).toMatchObject({ status: 502 });
    expect(String(error) + JSON.stringify(error)).not.toContain(token);
    expect(String(error) + JSON.stringify(error)).not.toContain(config.EMA_PMS_CLIENT_SECRET);
    expect(fetcher).toHaveBeenCalledOnce();
  }
});

it.each(["pms", "token"])("bounds stalled %s response bodies with the operation's deadline", async kind => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const fetcher = vi.fn<typeof fetch>(async () => new Response(new ReadableStream({ cancel })));
  const promise = kind === "pms" ? createPmsFetch({ EMA_PMS_ACCESS_TOKEN: token }, fetcher)(pmsRequest) : createPmsAuth(config, fetcher).token();
  const assertion = expect(promise).rejects.toThrow(kind === "pms" ? /retrieval failed/ : /token exchange failed/);
  await vi.advanceTimersByTimeAsync(kind === "pms" ? 30_001 : 15_001);
  await assertion;
  expect(cancel).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledOnce();
});

it("does not reset the request budget after headers arrive", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>(() => new Promise(resolve => setTimeout(() => resolve(new Response(new ReadableStream())), 20_000)));
  const assertion = expect(createPmsFetch({ EMA_PMS_ACCESS_TOKEN: token }, fetcher)(pmsRequest)).rejects.toThrow(/30-second/);
  await vi.advanceTimersByTimeAsync(30_001); await assertion;
});

it("does not wait indefinitely for cancellation acknowledgement", async () => {
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(2)); }, cancel: () => new Promise(() => {}) });
  await expect(boundedText(new Response(stream), 1)).rejects.toThrow(/exceeds 1/);
});

it("preserves decoded-body bytes and native timestamps separately from retrieval", async () => {
  const native = { meta: { timestamp: "2026-10-03T18:10:38Z", total_records: 1 }, data: [{ code: "0001", text: " Ω🧬\t " }] };
  const text = "\uFEFF" + JSON.stringify(native, null, 2).replaceAll("\n", "\r\n");
  const bytes = new TextEncoder().encode(text);
  const response = await createEmaApiFetch({}, async () => new Response(bytes, { headers: { "content-length": String(bytes.length), etag: '"native"', "last-modified": "Sat, 03 Oct 2026 18:10:38 GMT" } }))({ method: "GET", path: "/medicines" });
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
  expect(response.data).toMatchObject({ ...native, _ema: { response_bytes: bytes.length, response_sha256: hash, hash_scope: "decoded_response_bytes", etag: '"native"' } });
});

it.each(["1e309", "9007199254740993"])("rejects a JSON number that cannot be retained as a finite safe value: %s", async number => {
  const text = `{"meta":{"timestamp":"native","total_records":1},"data":[{"future":${number}}]}`;
  await expect(createEmaApiFetch({}, async () => new Response(text))({ method: "GET", path: "/medicines" })).rejects.toMatchObject({ status: 502, data: { body: text } });
});

it.each([206, 302, 429, 503])("preserves public error bodies and retry guidance at HTTP %s", async status => {
  const body = "Native public error Ω🧬";
  await expect(createEmaApiFetch({}, async () => new Response(body, { status, headers: { "retry-after": "60" } }))({ method: "GET", path: "/medicines" })).rejects.toMatchObject({ status: status === 206 ? 502 : status, data: { body, upstream_status: status, retry_after: "60", response_bytes: new TextEncoder().encode(body).length } });
});

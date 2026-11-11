import { afterEach, expect, it, vi } from "vitest";
import { createEmaApiFetch } from "./api-adapter";
import { boundedText } from "./response";

const feed = { meta: { total_records: 2, timestamp: "2026-10-03T18:10:38Z", future: { source: "native" } }, data: [
  { ema_product_number: "EMEA/H/C/000001", name_of_medicine: "Same", generic: "Yes", future: [null, "  Ω🧬  "] },
  { ema_product_number: "EMEA/H/C/000001", name_of_medicine: "Same", generic_or_hybrid: "Yes", future: { value: 0 } },
], other_root: { note: "retained" } };
const request = { method: "GET", path: "/medicines" };
const reply = (data: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(data), { status, headers });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each(["/medicines", "/orphan-designations", "/paediatric", "/dhpcs", "/shortages", "/psusa", "/epars", "/post-authorisation", "/referrals", "/all-documents"])("preserves the whole %s feed with explicit transport and count checks", async path => {
  const result = await createEmaApiFetch({}, async () => reply(feed))({ ...request, path });
  expect(result.data).toMatchObject({ ...feed, _ema: { transport_complete: true, reported_rows: 2, observed_rows: 2, record_count_matches: true } });
  expect((result.data as any).data).toEqual(feed.data);
});

it.each([
  ["partial status", feed, 206, {}], ["range response", feed, 200, { "content-range": "bytes 0-200/1000" }],
  ["count exceeds rows", { ...feed, meta: { ...feed.meta, total_records: 3 } }, 200, {}],
  ["count below rows", { ...feed, meta: { ...feed.meta, total_records: 1 } }, 200, {}],
  ...[undefined, null, "2", -1, 2.1].map(total_records => ["invalid count", { ...feed, meta: { ...feed.meta, total_records } }, 200, {}]),
  ...[undefined, null, "", "  ", 123].map(timestamp => ["invalid timestamp", { ...feed, meta: { ...feed.meta, timestamp } }, 200, {}]),
  ...[null, [], "row", 4].map(row => ["invalid row", { ...feed, data: [feed.data[0], row] }, 200, {}]),
  ["metadata collision", { ...feed, _ema: { native: true } }, 200, {}],
] as Array<[string, unknown, number, HeadersInit]>)("rejects %s without silently filtering or overwriting it", async (_label, data, status, headers) => {
  await expect(createEmaApiFetch({}, async () => reply(data, status as number, headers as HeadersInit))(request)).rejects.toThrow(/EMA/);
});

it("accepts a validated empty feed", async () => {
  expect((await createEmaApiFetch({}, async () => reply({ meta: { total_records: 0, timestamp: feed.meta.timestamp }, data: [] }))(request)).data).toMatchObject({ data: [], _ema: { observed_rows: 0, record_count_matches: true } });
});

it("preserves a BOM across split UTF-8 chunks with the Workers-compatible decoder", async () => {
  const nativeDecoder = TextDecoder;
  vi.stubGlobal("TextDecoder", class extends nativeDecoder {
    constructor(label?: string, options?: TextDecoderOptions) {
      if (options?.ignoreBOM === true) throw new Error("Workerd does not support ignoreBOM=true");
      super(label, options);
    }
  });
  const text = "\uFEFF" + JSON.stringify(feed);
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  expect(await boundedText(new Response(stream), 64000000)).toBe(text);
});

it.each(["headers", "body"])("enforces the complete request deadline while waiting for %s", async phase => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const fetcher = vi.fn<typeof fetch>(() => phase === "headers" ? new Promise(() => {}) : Promise.resolve(new Response(new ReadableStream({ cancel }))));
  let settled = false;
  const pending = createEmaApiFetch({}, fetcher)(request).then(() => { settled = true; }, () => { settled = true; });
  await vi.advanceTimersByTimeAsync(30_001);
  expect(settled).toBe(true);
  await pending;
  if (phase === "body") expect(cancel).toHaveBeenCalledOnce();
});

it.each(["999999999", "garbage", "1"])("rejects invalid or inconsistent Content-Length %s", async length => {
  await expect(createEmaApiFetch({}, async () => reply(feed, 200, { "content-length": length }))(request)).rejects.toThrow(/EMA/);
});

it("rejects malformed UTF-8 rather than changing source identifiers", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(feed)); bytes[80] = 255;
  await expect(createEmaApiFetch({}, async () => new Response(bytes))(request)).rejects.toThrow();
});

import { expect, it, vi } from "vitest";
import { createPmsFetch } from "./pms";
import { PMS_BASE, PMS_SEARCH } from "./pms-request";
import { createEmaApiFetch } from "./api-adapter";

const env = { EMA_PMS_ACCESS_TOKEN: "fixture.jwt.token" };
const request = { method: "GET", path: "/pms/MedicinalProductDefinition" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/fhir+json", "retry-after": "60" } });
// Synthetic Bundle follows the primary OpenAPI examples; not an authenticated response.
export const bundle = { resourceType: "Bundle", type: "searchset", id: "fixture", meta: { lastUpdated: "2026-09-01T01:02:03Z" }, total: 1, entry: [
  { fullUrl: "MedicinalProductDefinition/0006001", resource: { resourceType: "MedicinalProductDefinition", id: "0006001", meta: { versionId: "3" }, identifier: [{ system: "https://spor.ema.europa.eu/example", value: "PRD0001" }], name: [{ productName: "Synthetic" }] } },
] };

it("keeps product identity, version, beta/R5 context and full references through detail", async () => {
  const full = { ...bundle, entry: [...bundle.entry, { fullUrl: "Ingredient/42", resource: { resourceType: "Ingredient", id: "42", for: [{ reference: "MedicinalProductDefinition/0006001" }], substance: { strength: [{ concentrationRatio: { numerator: { value: 0.1, unit: "mg" }, denominator: { value: 1, unit: "mL" } } }] } } }] };
  const fetcher = vi.fn<typeof fetch>(async () => json(full));
  const result = await createPmsFetch(env, fetcher)({ method: "GET", path: "/pms/MedicinalProductDefinition/0006001/$everything" });
  expect(result.data).toMatchObject({ bundle: full, fhir_version: "5.0.0", release_status: "beta", requested_product_id: "0006001", product_ids: ["0006001"], returned_entries: 2 });
  expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: { Authorization: "Bearer fixture.jwt.token", Accept: "application/fhir+json" }, redirect: "manual", signal: expect.any(AbortSignal) });
  expect(JSON.stringify(result)).not.toContain(env.EMA_PMS_ACCESS_TOKEN);
});
it("distinguishes a count-only result from an empty match set", async () => {
  const api = createPmsFetch(env, async () => json({ resourceType: "Bundle", type: "searchset", total: 500 }));
  expect((await api({ ...request, params: { _summary: "count" } })).data).toMatchObject({ bundle: { total: 500 }, returned_entries: 0, product_ids: [] });
});
it("exposes a validated next link without traversing it", async () => {
  const url = `${PMS_BASE}${PMS_SEARCH}?name=Synthetic&_ct=opaque`;
  const fetcher = vi.fn<typeof fetch>(async () => json({ ...bundle, total: 12, link: [{ relation: "next", url }] }));
  expect((await createPmsFetch(env, fetcher)(request)).data).toMatchObject({ next_url: url, has_next_page: true, bundle: { total: 12 } });
  expect(fetcher).toHaveBeenCalledOnce();
});
it("rejects a next link that repeats the requested page", async () => {
  const url = `${PMS_BASE}${PMS_SEARCH}?_ct=same`;
  await expect(createPmsFetch(env, async () => json({ ...bundle, link: [{ relation: "next", url }] }))({ method: "GET", path: "/pms/next", params: { url } })).rejects.toThrow(/repeats/);
});
it.each([200, 400, 401, 404, 429, 500])("preserves OperationOutcome as a failure at HTTP %s", async status => {
  const outcome = { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "invalid", diagnostics: "failure fixture.jwt.token" }] };
  const fetcher = vi.fn<typeof fetch>(async () => json(outcome, status));
  let error: unknown;
  try { await createPmsFetch(env, fetcher)(request); } catch (caught) { error = caught; }
  expect(error).toMatchObject({ status: status === 200 ? 502 : status, data: { outcome: { resourceType: "OperationOutcome" }, retry_after: "60" } });
  expect(JSON.stringify(error)).not.toContain(env.EMA_PMS_ACCESS_TOKEN);
  expect(fetcher).toHaveBeenCalledOnce();
});
it("does not return a wrong product or malformed Bundle as successful detail", async () => {
  await expect(createPmsFetch(env, async () => json(bundle))({ method: "GET", path: "/pms/MedicinalProductDefinition/9999/$everything" })).rejects.toThrow(/requested product/);
  await expect(createPmsFetch(env, async () => json({ error: "bad" }))(request)).rejects.toThrow(/Bundle/);
});
it("redacts echoed access tokens even when upstream JSON uses escaped characters", async () => {
  const text = '{"resourceType":"OperationOutcome","issue":[{"severity":"error","diagnostics":"fixture\\u002ejwt.token"}]}';
  let error: unknown;
  try { await createPmsFetch(env, async () => new Response(text, { status: 401 }))(request); } catch (caught) { error = caught; }
  expect(JSON.stringify(error)).toContain("[REDACTED]");
  expect(JSON.stringify(error)).not.toContain(env.EMA_PMS_ACCESS_TOKEN);
});
it("keeps website generic flags, EMA IDs and publisher metadata separate from PMS credentials", async () => {
  const feed = { meta: { total_records: 1, timestamp: "2026-09-24T18:06:03Z" }, data: [{ generic: "Yes", ema_product_number: "EMEA/H/C/000001", future_field: "unchanged", category: "Human" }] };
  const fetcher = vi.fn<typeof fetch>(async () => json(feed));
  const result = await createEmaApiFetch(env, fetcher)({ method: "GET", path: "/post-authorisation" });
  expect(result.data).toMatchObject({ ...feed, _ema: { format: "website_json_not_fhir" } });
  expect(fetcher.mock.calls[0][1]?.headers).not.toHaveProperty("Authorization");
  await expect(createEmaApiFetch({}, fetcher)({ method: "GET", path: "/medicines", params: { name: "ignored" } })).rejects.toThrow(/no server-side search/);
});
it("bounds streamed reads and cancels oversized PMS output", async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(1_000_001)); }, cancel });
  await expect(createPmsFetch(env, async () => new Response(stream))(request)).rejects.toThrow(/8MB/);
  expect(cancel).toHaveBeenCalledOnce();
});

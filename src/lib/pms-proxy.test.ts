import { expect, it } from "vitest";
import { createApiProxyTool } from "@bio-mcp/shared/tools/api-proxy";
import { createEmaApiFetch } from "./api-adapter";
import { emaCatalog } from "../spec/catalog";

const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
it("keeps website publication metadata and medicine-type fields in canonical staging", async () => {
  const raw = { meta: { timestamp: "2026-09-24T18:06:03Z", total_records: 1 }, data: [{ generic: "Yes", ema_product_number: "EMEA/H/C/000001", description: "α".repeat(17_000), future_field: "keep" }] };
  const stored: unknown[] = [];
  const ns = { idFromName: (name: string) => name, get: () => ({ fetch: async (request: Request) => {
    if (new URL(request.url).pathname === "/process") {
      stored.push((await request.json() as { data: unknown }).data);
      return json({ success: true, tables_created: ["data"], total_rows: 1, input_rows: 1, table_row_counts: { data: 1 } });
    }
    return json({ success: true, schema: { tables: { data: { columns: [{ name: "generic" }] } } } });
  } }) } as unknown as DurableObjectNamespace;
  const proxy = createApiProxyTool({ apiFetch: createEmaApiFetch({}, async () => json(raw)), catalog: emaCatalog, doNamespace: ns, stagingPrefix: "ema", maxInlineBytes: 30 * 1024 });
  expect(await proxy.handler({ method: "GET", path: "/post-authorisation" }, { sql: () => [] })).toMatchObject({ __staged: true });
  const canonical = JSON.parse(stored[0] as string);
  expect(canonical).toMatchObject({ ...raw, _ema: { format: "website_json_not_fhir" } });
  expect(stored[1]).toEqual(canonical);
});

it("stages every resource, relationship and source field through the real shared proxy", async () => {
  const raw = { resourceType: "Bundle", type: "searchset", entry: [{ fullUrl: "MedicinalProductDefinition/60001", resource: { resourceType: "MedicinalProductDefinition", id: "60001", indication: "α".repeat(17000), identifier: [{ system: "source", value: "PRD001" }] } }, { fullUrl: "Ingredient/0002", resource: { resourceType: "Ingredient", id: "0002", for: [{ reference: "MedicinalProductDefinition/60001" }], futureField: { units: "mg" } } }] };
  const stored: unknown[] = [];
  const ns = { idFromName: (name: string) => name, get: () => ({ fetch: async (request: Request) => {
    if (new URL(request.url).pathname === "/process") {
      stored.push((await request.json() as { data: unknown }).data);
      return json({ success: true, tables_created: ["entry"], total_rows: 2, input_rows: 2, table_row_counts: { entry: 2 } });
    }
    return json({ success: true, schema: { tables: { entry: { columns: [{ name: "fullUrl" }] } } } });
  } }) } as unknown as DurableObjectNamespace;
  const proxy = createApiProxyTool({ apiFetch: createEmaApiFetch({ EMA_PMS_ACCESS_TOKEN: "fixture-token" }, async () => json(raw)), catalog: emaCatalog, doNamespace: ns, stagingPrefix: "ema", maxInlineBytes: 30 * 1024 });
  const result = await proxy.handler({ method: "GET", path: "/pms/MedicinalProductDefinition/{id}/$everything", params: { id: "60001" } }, { sql: () => [] });
  expect(result).toMatchObject({ __staged: true, data_access_id: expect.any(String) });
  const canonical = JSON.parse(stored[0] as string);
  expect(canonical).toMatchObject({ bundle: raw, requested_product_id: "60001", fhir_version: "5.0.0", release_status: "beta" });
  expect(stored[1]).toEqual(canonical);
  expect(JSON.stringify(stored)).not.toContain("fixture-token");
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(30_000);
});
it("preserves repeated parameters through the Code Mode catalog and returns missing auth as a failure", async () => {
  const urls: string[] = [];
  const proxy = createApiProxyTool({ apiFetch: createEmaApiFetch({ EMA_PMS_ACCESS_TOKEN: "fixture-token" }, async url => { urls.push(String(url)); return json({ resourceType: "Bundle", type: "searchset", total: 0, entry: [] }); }), catalog: emaCatalog, stagingPrefix: "ema" });
  const result = await proxy.handler({ method: "GET", path: "/pms/MedicinalProductDefinition", params: { identifier: ["PRD001", "PRD002"], _count: 10 } }, { sql: () => [] });
  expect(result).toMatchObject({ bundle: { total: 0 } });
  expect(new URL(urls[0]).searchParams.getAll("identifier")).toEqual(["PRD001", "PRD002"]);
  const unconfigured = createApiProxyTool({ apiFetch: createEmaApiFetch({}), catalog: emaCatalog, stagingPrefix: "ema" });
  expect(await unconfigured.handler({ method: "GET", path: "/pms/MedicinalProductDefinition" }, { sql: () => [] })).toMatchObject({ __api_error: true, status: 401 });
});

it("the executable discovery recipe never chooses an ambiguous or incomplete search result", async () => {
  const recipe = emaCatalog.workflows!.find(recipe => recipe.title.startsWith("PMS search"))!;
  const run = new Function("api", `return (async () => { ${recipe.code} })()`);
  for (const search of [
    { __api_error: true, status: 401 }, { __staged: true, data_access_id: "ema_fixture" },
    { product_ids: ["60001", "60002"], has_next_page: false },
    { product_ids: ["60001"], has_next_page: true }, { product_ids: [], has_next_page: false },
    { product_ids: ["60001"], has_next_page: false, bundle: { total: 3 } },
    { product_ids: ["60001"], has_next_page: false },
  ]) {
    const calls: string[] = [];
    const result = await run({ get: async (path: string) => { calls.push(path); return search; } });
    expect(calls).toHaveLength(1);
    expect(result === search || result.search === search).toBe(true);
  }
  const paths: string[] = [];
  const search = { product_ids: ["00060001"], has_next_page: false, bundle: { total: 1 } };
  const detail = { __api_error: true, status: 404 };
  expect(await run({ get: async (path: string) => { paths.push(path); return paths.length === 1 ? search : detail; } })).toEqual({ search, detail });
  expect(paths[1]).toBe("/pms/MedicinalProductDefinition/00060001/$everything");
});

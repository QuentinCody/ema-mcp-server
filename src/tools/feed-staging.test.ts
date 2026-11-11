import { afterEach, expect, it, vi } from "vitest";
import { verifyCitationEnvelope } from "@bio-mcp/shared";
vi.mock("cloudflare:workers", () => ({ RpcTarget: class {}, DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
import { MyMCP } from "../index";
import { fixture, recover } from "./feed.test-support";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const native = { meta: { total_records: 60, timestamp: "2026-10-03T18:10:38Z", future: [null, "source"] }, data: Array.from({ length: 60 }, (_, index) => ({ ema_product_number: `EMEA/H/C/${String(index).padStart(6, "0")}`, name_of_medicine: "Shared name", category: "Human", medicine_status: index % 2 ? "Authorised" : "Withdrawn", generic: "Yes", future: { value: "Ω🧬".repeat(500), nested: [null, false, "0001"] } })) };

it("recovers complete feeds, errors, SQL and citations through both source aliases", async () => {
  const text = "\uFEFF" + JSON.stringify(native, null, 2).replaceAll("\n", "\r\n");
  let status = 200; let body = text;
  const fetcher = vi.fn(async () => new Response(body, { status, headers: { "retry-after": "60" } }));
  vi.stubGlobal("fetch", fetcher);
  const f = fixture();
  try {
    for (const prefix of ["", "mcp_"]) {
      const args = { code: "return await api.get('/medicines');" };
      const output = await f.tools[`${prefix}ema_execute`].handler(args, {});
      expect(output.isError, JSON.stringify(output)).not.toBe(true);
      expect(output.structuredContent._meta.staged).toBe(true);
      expect(new TextEncoder().encode(JSON.stringify(output)).byteLength).toBeLessThan(30720);
      const id = output.structuredContent.data.data_access_id;
      const recovered = await recover(f, id, prefix);
      expect(recovered).toMatchObject({ ...native, _ema: { transport_complete: true, record_count_matches: true, observed_rows: 60, reported_rows: 60 } });
      expect(recovered.data).toEqual(native.data);
      const verified = await verifyCitationEnvelope({ citation: output.structuredContent._meta.citation, structuredContent: output.structuredContent, toolArguments: args, materialized: { value: recovered } });
      expect(verified.verification).toMatchObject({ query: "verified", result: "verified" });
      const sample = "Ω🧬".repeat(8000);
      const query = { data_access_id: id, sql: `SELECT '${sample}' AS sample`, limit: 1 };
      const wide = await f.tools[`${prefix}ema_query_data`].handler(query, {});
      expect(new TextEncoder().encode(JSON.stringify(wide)).byteLength).toBeLessThan(30720);
      const complete = await recover(f, wide.structuredContent.data_access_id, prefix);
      expect(complete.structuredContent.data.rows[0].sample).toBe(sample);
      expect((await verifyCitationEnvelope({ citation: wide.structuredContent._meta.citation, structuredContent: wide.structuredContent, toolArguments: query, materialized: { value: complete } })).verification).toMatchObject({ query: "verified", result: "verified" });
      const schema = await f.tools[`${prefix}ema_get_schema`].handler({ data_access_id: id }, {});
      expect(schema).toMatchObject({ content: expect.any(Array), structuredContent: { _meta: { citation: expect.any(Object) } } });
    }
    status = 206;
    for (const prefix of ["", "mcp_"]) {
      const output = await f.tools[`${prefix}ema_execute`].handler({ code: "return await api.get('/medicines');" }, {});
      expect(output).toMatchObject({ isError: true, content: expect.any(Array), structuredContent: { success: false } });
      expect(new TextEncoder().encode(JSON.stringify(output)).byteLength).toBeLessThan(30720);
      const recovered = await recover(f, output.structuredContent.data.data.data_access_id, prefix);
      expect(recovered).toMatchObject({ body: text, upstream_status: 206, retry_after: "60" });
      body = "partial";
      const response = await MyMCP.serve("/mcp").fetch(new Request("http://fixture/mcp", {
        method: "POST", headers: { accept: "application/json, text/event-stream", "content-type": "application/json", "mcp-method": "tools/call", "mcp-name": `${prefix}ema_execute`, "mcp-protocol-version": "2026-07-28" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: `${prefix}ema_execute`, arguments: { code: "return await api.get('/medicines');" }, _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "feed-contract", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {},
        } } }),
      }), f.env as never, { waitUntil() {} } as never);
      expect(response.status).toBe(200); const wire = await response.text();
      expect(new TextEncoder().encode(wire).byteLength).toBeLessThan(30720);
      expect(JSON.parse(wire).result).toMatchObject({ isError: true, content: expect.any(Array), structuredContent: { success: false, _meta: { citation: expect.any(Object) } } });
      body = text;
    }
  } finally { f.close(); }
});

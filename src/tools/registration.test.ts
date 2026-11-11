import { expect, it } from "vitest";
import { McpServer } from "@bio-mcp/shared/mcp";
import { registerCodeMode } from "./code-mode";
import { registerQueryData } from "./query-data";
import { registerGetSchema } from "./get-schema";
import { emaCatalog } from "../spec/catalog";

it("registers both aliases, discovers PMS with auth/beta context, and retains error fields", async () => {
  const server = new McpServer({ name: "fixture", version: "1" });
  registerCodeMode(server, { CODE_MODE_LOADER: { get: () => ({}) } } as unknown as Parameters<typeof registerCodeMode>[1]);
  registerQueryData(server, {}); registerGetSchema(server, {});
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<unknown> }> })._registeredTools;
  for (const name of ["ema_search", "ema_execute", "ema_query_data", "ema_get_schema"]) {
    expect(tools[name]).toBeDefined(); expect(tools[`mcp_${name}`]).toBeDefined();
  }
  for (const name of ["ema_search", "mcp_ema_search"]) {
    const result = await tools[name].handler({ query: "PMS", category: "pms", max_results: 5 }, {});
    expect(result).toMatchObject({ content: expect.any(Array), structuredContent: { success: true } });
    expect(JSON.stringify(result)).toContain("/pms/MedicinalProductDefinition");
    expect(JSON.stringify(result)).toContain("beta");
  }
  expect(emaCatalog.endpointCount).toBe(emaCatalog.endpoints.length);
  expect(await tools.mcp_ema_query_data.handler({ data_access_id: "ema_fixture", sql: "SELECT 1" }, {})).toMatchObject({ isError: true, content: expect.any(Array), structuredContent: expect.any(Object) });
});

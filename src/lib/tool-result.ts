import { buildCitation } from "@bio-mcp/shared";
import type { RegistryToolResult } from "@bio-mcp/shared/registry";
import { shouldStage, stageToDoAndRespond } from "@bio-mcp/shared/staging/utils";

type DataEnv = { EMA_DATA_DO?: unknown };
const source = { id: "ema", name: "European Medicines Agency", url: "https://www.ema.europa.eu" };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const oversized = (value: unknown) => shouldStage(bytes(value) + 1024);
const failure = (message: string): RegistryToolResult => ({ isError: true, content: [{ type: "text", text: message }], structuredContent: { success: false, error: { code: "EMA_RESPONSE_ERROR", message } } });

async function cite(result: RegistryToolResult, tool: string, query: unknown): Promise<RegistryToolResult> {
  const { _meta, ...root } = result.structuredContent;
  const meta = record(_meta) ? _meta : {};
  if (record(meta.citation)) return result;
  const citation = await buildCitation({ source, server: "ema", tool, query, queryScope: "tool_arguments", result: root,
    resultScope: "structured_content:root_without_meta", retrievedAt: new Date().toISOString() });
  return { ...result, structuredContent: { ...root, _meta: { ...meta, citation } } };
}

/** Budget the complete MCP envelope, including text escaping and SQL/schema results. */
export async function emaResponse(work: () => Promise<unknown>, env: DataEnv, name: string, query: unknown, extra?: unknown): Promise<RegistryToolResult> {
  const tool = name.replace(/^mcp_/, "");
  try {
    const original = await work().catch(error => failure(error instanceof Error ? error.message : String(error)));
    if (!record(original) || !Array.isArray(original.content)) throw new Error("Invalid tool result");
    const structured = record(original.structuredContent) ? original.structuredContent : { success: original.isError !== true };
    const data = record(structured.data) ? structured.data : {};
    const failed = original.isError === true || structured.success === false || structured.program_error != null || data.__api_error === true;
    const result = await cite({ ...original, content: original.content, structuredContent: structured, ...(failed ? { isError: true } : {}) }, tool, query);
    if (!oversized(result)) return result;
    if (!env.EMA_DATA_DO) throw new Error("Missing staging storage");
    const staged = await stageToDoAndRespond(result, env.EMA_DATA_DO as Parameters<typeof stageToDoAndRespond>[1], "ema", undefined,
      { toolName: tool, serverName: "ema" }, "ema", extra as Parameters<typeof stageToDoAndRespond>[6]);
    const citation = await buildCitation({ source, server: "ema", tool, query, queryScope: "tool_arguments", result, resultScope: "staged:full_result",
      retrievedAt: new Date().toISOString(), dataAccessId: staged.dataAccessId });
    const response: RegistryToolResult = { content: [{ type: "text", text: "Complete response staged. Use ema_query_data; _staging.evidence_table retains the original result." }],
      structuredContent: { success: !failed, staged: true, data_access_id: staged.dataAccessId, _staging: staged._staging, _meta: { citation } }, ...(failed ? { isError: true } : {}) };
    if (bytes(response.structuredContent) > 100000 || oversized(response)) throw new Error("Staging metadata exceeds transport budget");
    return response;
  } catch { return cite(failure("The complete EMA response could not be returned."), tool, query); }
}

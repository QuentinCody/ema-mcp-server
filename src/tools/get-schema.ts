import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createGetSchemaHandler } from "@bio-mcp/shared/staging/utils";

/** Convert a typed env object to the Record<string, unknown> the handler expects. */
function envToRecord(env: Partial<Env>): Record<string, unknown> {
    const record: Record<string, unknown> = {};
    if (env.EMA_DATA_DO !== undefined) {
        record["EMA_DATA_DO"] = env.EMA_DATA_DO;
    }
    return record;
}

export function registerGetSchema(server: McpServer, env?: Partial<Env>) {
    const handler = createGetSchemaHandler("EMA_DATA_DO", "ema");

    server.registerTool(
        "ema_get_schema",
        {
            title: "Get Staged Data Schema",
            description:
                "Get schema information for staged EMA data. Shows table structures and row counts. " +
                "If called without a data_access_id, lists all staged datasets available in this session.",
            inputSchema: {
                data_access_id: z.string().min(1).optional().describe(
                    "Data access ID for the staged dataset. If omitted, lists all staged datasets in this session.",
                ),
            },
        },
        async (args, extra) => {
            const resolvedEnv = env ?? (extra as { env?: Partial<Env> })?.env ?? {};
            const argsRecord: Record<string, unknown> = {
                data_access_id: args.data_access_id,
            };
            const sessionId = (extra as { sessionId?: string })?.sessionId;
            return handler(argsRecord, envToRecord(resolvedEnv), sessionId);
        },
    );
}

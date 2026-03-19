import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createQueryDataHandler } from "@bio-mcp/shared/staging/utils";

/** Convert a typed env object to the Record<string, unknown> the handler expects. */
function envToRecord(env: Partial<Env>): Record<string, unknown> {
    const record: Record<string, unknown> = {};
    if (env.EMA_DATA_DO !== undefined) {
        record["EMA_DATA_DO"] = env.EMA_DATA_DO;
    }
    return record;
}

export function registerQueryData(server: McpServer, env?: Partial<Env>) {
    const handler = createQueryDataHandler("EMA_DATA_DO", "ema");

    server.registerTool(
        "ema_query_data",
        {
            title: "Query Staged EMA Data",
            description:
                "Query staged European Medicines Agency data using SQL. Use this when responses are too large and have been staged with a data_access_id.",
            inputSchema: {
                data_access_id: z.string().min(1).describe("Data access ID for the staged dataset"),
                sql: z.string().min(1).describe("SQL query to execute against the staged data"),
                limit: z.number().int().positive().max(10000).default(100).optional().describe("Maximum number of rows to return (default: 100)"),
            },
        },
        async (args, extra) => {
            const resolvedEnv = env ?? (extra as { env?: Partial<Env> })?.env ?? {};
            const argsRecord: Record<string, unknown> = {
                data_access_id: args.data_access_id,
                sql: args.sql,
                limit: args.limit,
            };
            return handler(argsRecord, envToRecord(resolvedEnv));
        },
    );
}

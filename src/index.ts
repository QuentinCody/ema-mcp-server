import { buildHealthResponse, configureCitationSigning } from "@bio-mcp/shared";
// EMA (European Medicines Agency) MCP Server — 2,641+ centrally authorized EU medicines
// Code Mode only: ema_search, ema_execute, query_data, get_schema
import { StatelessMcpWorker } from "@bio-mcp/shared/mcp";
import { McpServer } from "@bio-mcp/shared/mcp";
import { registerQueryData } from "./tools/query-data";
import { registerGetSchema } from "./tools/get-schema";
import { registerCodeMode } from "./tools/code-mode";
import { EmaDataDO } from "./do";

export { EmaDataDO };

export class MyMCP extends StatelessMcpWorker<Env> {
    server = new McpServer({
        name: "ema",
        version: "0.1.0",
    });

    async init() {

    	configureCitationSigning(this.env);
        registerQueryData(this.server, this.env);
        registerGetSchema(this.server, this.env);
        registerCodeMode(this.server, this.env);
    }
}

export default {
    fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);

        if (url.pathname === "/health") {
            return buildHealthResponse("ema");
        }

        if (url.pathname === "/readyz") {
            // Deep check: builds the MCP server the way a real request does, so a
            // factory that throws is a 503 here instead of a green /health over a
            // server that 500s every MCP call.
            return MyMCP.readiness(env, "ema");
        }

        if (url.pathname === "/mcp") {
            return MyMCP.serve("/mcp").fetch(request, env, ctx);
        }

        return new Response("Not found", { status: 404 });
    },
};

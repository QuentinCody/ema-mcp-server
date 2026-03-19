import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { emaCatalog } from "../spec/catalog";
import { createEmaApiFetch } from "../lib/api-adapter";

/** Interface matching what the shared lib's register() method expects. */
interface ToolRegistrar {
    tool: (...args: unknown[]) => void;
}

/** Wrap McpServer into the ToolRegistrar shape the shared lib expects. */
function asRegistrar(server: McpServer): ToolRegistrar {
    return {
        tool: (...args: unknown[]) => {
            (server.tool as (...a: unknown[]) => void)(...args);
        },
    };
}

export function registerCodeMode(
    server: McpServer,
    env: Pick<Env, "EMA_DATA_DO" | "CODE_MODE_LOADER">,
) {
    const apiFetch = createEmaApiFetch();
    const registrar = asRegistrar(server);

    const searchTool = createSearchTool({
        prefix: "ema",
        catalog: emaCatalog,
    });
    searchTool.register(registrar);

    const executeTool = createExecuteTool({
        prefix: "ema",
        catalog: emaCatalog,
        apiFetch,
        doNamespace: env.EMA_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(registrar);
}

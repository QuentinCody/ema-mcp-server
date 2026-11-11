import type { McpServer } from "@bio-mcp/shared/mcp";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { emaCatalog } from "../spec/catalog";
import { createEmaApiFetch } from "../lib/api-adapter";
import type { PmsCredentials } from "../lib/pms-auth";
import { emaResponse } from "../lib/tool-result";

/** Interface matching what the shared lib's register() method expects. */
interface ToolRegistrar {
    tool: (...args: unknown[]) => void;
}

/** Wrap McpServer into the ToolRegistrar shape the shared lib expects. */
function asRegistrar(server: McpServer, env: Pick<Env, "EMA_DATA_DO">): ToolRegistrar {
    return {
        tool: (...args: unknown[]) => {
            const [name, ...rest] = args;
            const register = server.tool.bind(server) as (...a: unknown[]) => void;
            const handler = rest.pop() as (input: unknown, extra: unknown) => Promise<unknown>;
            for (const alias of [String(name), `mcp_${String(name)}`]) register(alias, ...rest,
                (input: unknown, extra: unknown) => emaResponse(() => handler(input, extra), env, alias, input, extra));
        },
    };
}

export function registerCodeMode(
    server: McpServer,
    env: Pick<Env, "EMA_DATA_DO" | "CODE_MODE_LOADER"> & PmsCredentials,
): void {
    const apiFetch = createEmaApiFetch(env);
    const registrar = asRegistrar(server, env);

    const searchTool = createSearchTool({
        prefix: "ema",
        catalog: emaCatalog,
    });
    searchTool.register(registrar);

    const executeTool = createExecuteTool({
        prefix: "ema",
        // Verifiable provenance: ema_execute results carry a _meta.citation.
        source: { id: "ema", name: "European Medicines Agency", url: "https://www.ema.europa.eu" },
        catalog: emaCatalog,
        apiFetch,
        maxInlineBytes: 30 * 1024,
        stagingThreshold: 30 * 1024,
        preserveApiErrors: true,
        // Allow the bounded 15-second token exchange plus 30-second data read.
        timeout: 60_000,
        doNamespace: env.EMA_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(registrar);
}

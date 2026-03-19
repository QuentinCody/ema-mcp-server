import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { emaFetch } from "./http";

/**
 * Route map: Code Mode clean paths -> EMA API paths
 */
const ROUTE_MAP: Record<string, string> = {
    "/medicines": "/en/api/v1/medicines",
    "/orphan-designations": "/en/api/v1/orphan-designations",
    "/paediatric": "/en/api/v1/paediatric-investigation-plans",
    "/dhpcs": "/en/api/v1/dhpcs",
    "/shortages": "/en/api/v1/shortages",
    "/psusa": "/en/api/v1/psusa",
    "/epars": "/en/api/v1/epars",
};

export function createEmaApiFetch(): ApiFetchFn {
    return async (request) => {
        let path = request.path;

        // Map clean Code Mode paths to actual EMA API paths
        for (const [clean, actual] of Object.entries(ROUTE_MAP)) {
            if (path === clean || path.startsWith(`${clean}?`)) {
                path = actual + path.slice(clean.length);
                break;
            }
        }

        const response = await emaFetch(path, request.params);

        if (!response.ok) {
            let errorBody: string;
            try {
                errorBody = await response.text();
            } catch {
                errorBody = response.statusText;
            }
            const error = new Error(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`) as Error & {
                status: number;
                data: unknown;
            };
            error.status = response.status;
            error.data = errorBody;
            throw error;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("json")) {
            const text = await response.text();
            return { status: response.status, data: text };
        }

        const data = await response.json();
        return { status: response.status, data };
    };
}

import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import type { RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const EMA_BASE = "https://www.ema.europa.eu";

export interface EmaFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
    baseUrl?: string;
}

/**
 * Fetch from the European Medicines Agency API.
 */
export async function emaFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: EmaFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.baseUrl ?? EMA_BASE;
    const headers: Record<string, string> = {
        Accept: "application/json",
        ...(opts?.headers ?? {}),
    };

    return restFetch(baseUrl, path, params, {
        ...opts,
        headers,
        retryOn: [429, 500, 502, 503],
        retries: opts?.retries ?? 3,
        timeout: opts?.timeout ?? 30_000,
        userAgent: "ema-mcp-server/1.0 (bio-mcp)",
    });
}

import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { createPmsAuth, type PmsCredentials } from "./pms-auth";
import { pmsNextUrl, pmsRequest } from "./pms-request";
import { apiError, isObject, responseMetadata } from "./response";
import { fetchEmaText } from "./transport";

export function createPmsFetch(env: PmsCredentials, fetcher: typeof fetch = fetch): ApiFetchFn {
  const auth = createPmsAuth(env, fetcher);
  return async request => {
    const { url, operation, id } = pmsRequest(request);
    const token = await auth.token();
    const { entries, data, response, text } = await readPmsBundle(url, token, fetcher, auth);
    if (entries.some(entry => {
      const resource = (entry as { resource: Record<string, unknown> }).resource;
      return resource.resourceType === "OperationOutcome" && Array.isArray(resource.issue) && resource.issue.some(issue => isObject(issue) && ["error", "fatal"].includes(String(issue.severity)));
    })) apiError("PMS Bundle contains an error OperationOutcome", 502, { bundle: data });
    const products = entries.flatMap(entry => {
      const resource = (entry as { resource: Record<string, unknown> }).resource;
      return resource.resourceType === "MedicinalProductDefinition" && typeof resource.id === "string" ? [resource.id] : [];
    });
    if (operation === "detail" && !products.includes(id!)) throw new Error("PMS detail Bundle does not contain the requested product resource.id");
    if (data.link !== undefined && !Array.isArray(data.link)) throw new Error("Malformed PMS Bundle links");
    const next = (Array.isArray(data.link) ? data.link : []).filter(link => isObject(link) && link.relation === "next");
    if (next.length > 1 || (next.length && typeof next[0].url !== "string")) throw new Error("Ambiguous PMS next link");
    const nextUrl = next.length ? pmsNextUrl(next[0].url as string, url) : null;
    if (nextUrl === url) throw new Error("PMS next link repeats the current page");
    return { status: response.status, data: {
      ...(await responseMetadata(response, text, url)), api: "EMA PMS Public API", release_status: "beta", fhir_version: "5.0.0",
      data_scope: "Selected public, non-nullified human medicines; confidential fields excluded. Not a clinical FHIR R4 dataset.",
      operation, requested_product_id: id, product_ids: products, returned_entries: entries.length,
      next_url: nextUrl, has_next_page: nextUrl !== null,
      completeness_scope: "This retrieved Bundle only. Search IDs are not full product details; no bulk export or immutable snapshot is implied.",
      bundle: data,
    } };
  };
}

async function readPmsBundle(url: string, token: string, fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>, auth: { token(): Promise<string>; invalidate(): void; }) {
  let response: Response;
  let text: string;
  try {
    ({ response, text } = await fetchEmaText(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/fhir+json", "User-Agent": "ema-mcp-server/1.0" } }, 8000000, 30000, fetcher));
  } catch {
    throw new Error("PMS retrieval failed or exceeded the 8MB/30-second limit; narrow the query or retry later");
  }
  if (response.status === 401) auth.invalidate();
  let data: unknown;
  try {
    const parsed: unknown = JSON.parse(text.replace(/^\uFEFF/, ""));
    // Normalize JSON escapes first so an echoed token cannot evade redaction.
    data = JSON.parse(JSON.stringify(parsed).split(token).join("[REDACTED]"));
  } catch {
    apiError(`PMS returned ${response.status} with a non-JSON response`, response.ok ? 502 : response.status, { retry_after: response.headers.get("retry-after") });
  }
  if (response.status !== 200 || response.headers.has("content-range") || (isObject(data) && data.resourceType === "OperationOutcome")) apiError(`PMS request failed (HTTP ${response.status})`, response.ok ? 502 : response.status, { outcome: data, retry_after: response.headers.get("retry-after") });
  if (!isObject(data) || data.resourceType !== "Bundle" || data.type !== "searchset" || (data.entry !== undefined && !Array.isArray(data.entry))) throw new Error("Expected a PMS FHIR R5 searchset Bundle");
  const entries: unknown[] = Array.isArray(data.entry) ? data.entry : [];
  if (entries.some(entry => !isObject(entry) || !isObject(entry.resource) || typeof entry.resource.resourceType !== "string")) throw new Error("Malformed PMS Bundle entry");
  return { entries, data, response, text };
}

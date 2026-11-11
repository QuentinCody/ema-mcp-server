import { apiError, isObject, responseMetadata } from "./response";
import { fetchEmaText } from "./transport";

/** Validate a complete website feed before any local filtering or staging. */
export async function fetchWebsiteFeed(url: string, fetcher: typeof fetch) {
  const { response, text } = await fetchEmaText(url, { headers: { Accept: "application/json" } }, 64_000_000, 30_000, fetcher);
  const metadata = await responseMetadata(response, text, url);
  const fail = (reason: string, status = 502): never => apiError(`EMA website: ${reason}`, status, { body: text, ...metadata, upstream_status: response.status, retry_after: response.headers.get("retry-after") });
  if (response.status !== 200 || response.headers.has("content-range")) fail(`expected complete HTTP 200, received ${response.status}`, response.ok ? 502 : response.status);
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ""), (_key, value: unknown) => {
      if (typeof value === "number" && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw new Error("Unrepresentable JSON number");
      return value;
    });
  } catch { return fail("invalid or numerically unsafe JSON"); }
  if (!isObject(data) || !isObject(data.meta) || !Array.isArray(data.data)) return fail("expected native meta/data envelope");
  if (Object.prototype.hasOwnProperty.call(data, "_ema")) return fail("native field conflicts with reserved _ema metadata");
  const count = data.meta.total_records;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || count !== data.data.length) return fail("total_records differs from the retrieved record count or is invalid");
  if (typeof data.meta.timestamp !== "string" || !data.meta.timestamp.trim()) return fail("missing or invalid publisher timestamp");
  if (data.data.some(row => !isObject(row))) return fail("data contains a non-object record");
  return { status: 200, data: { ...data, _ema: { ...metadata,
    api: "EMA website JSON feed", format: "website_json_not_fhir", transport_complete: true,
    reported_rows: count, observed_rows: data.data.length, record_count_matches: true,
    scope: "Complete retrieved file with matching native record count; meta.timestamp is the publisher's file timestamp, not retrieval time, a PMS version or proof of complete clinical coverage",
  } } };
}

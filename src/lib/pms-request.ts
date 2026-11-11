import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";

export const PMS_BASE = "https://api.pms.ema.europa.eu/public/v1";
export const PMS_SEARCH = "/MedicinalProductDefinition";
/** Query names from the provider OpenAPI retrieved 2026-09-28. */
export const PMS_FILTERS: Record<string, string> = {
  name: "Partial product name",
  identifier: "Exact XEVMPD identifier, e.g. PRD2589182; use the returned resource.id for PMS detail",
  status: "SPOR product status code",
  _lastUpdated: "Timestamp with gt prefix only; date or datetime, UTC or explicit offset",
  "authorised-dose-form": "SPOR authorised dose-form code",
  "_has:PackagedProductDefinition:package-for:_id": "Package resource ID",
  "_has:RegulatedAuthorization:subject:identifier": "Product marketing authorisation number",
  "_has:PackagedProductDefinition:package-for:_has:RegulatedAuthorization:subject:identifier": "Package marketing authorisation number",
  "_has:RegulatedAuthorization:subject:region": "SPOR authorisation country code",
  "_has:RegulatedAuthorization:subject:holder": "Holder OMS Location ID",
  "_has:RegulatedAuthorization:subject:regulator": "Regulator OMS Location reference",
  "_has:RegulatedAuthorization:subject:case-type": "SPOR procedure-type code",
  "_has:RegulatedAuthorization:subject:case": "Procedure number",
  "product-classification": "SPOR ATC classification code",
  "_has:Ingredient:for:substance-code": "SMS substance ID",
  "_has:Ingredient:for:substance-code-presentation-strength": "SMS code$numerator|unit|denominator|unit; preserve source precision and units",
  "_has:Ingredient:for:substance-code-concentration-strength": "SMS code$numerator|unit|denominator|unit; preserve source precision and units",
};
const controls = new Set(["_count", "_sort", "_summary", "_ct"]);

function appendParameters(url: URL, params: Record<string, unknown>) {
  for (const [key, value] of Object.entries(params)) {
    if (!Object.prototype.hasOwnProperty.call(PMS_FILTERS, key) && !controls.has(key)) throw new Error(`Unsupported PMS query parameter: ${key}`);
    if (key === "_count") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 10 || value > 100) throw new Error("PMS _count must be an integer from 10 to 100");
      url.searchParams.append(key, String(value)); continue;
    }
    const values = Array.isArray(value) ? value : [value];
    if (!values.length || (controls.has(key) && values.length !== 1)) throw new Error(`PMS ${key} requires a single value`);
    for (const item of values) {
      if (typeof item !== "string" || !item.trim() || item.length > 16_384) throw new Error(`PMS ${key} requires nonempty strings, preserving identifier values`);
      if (key === "_lastUpdated" && (!/^gt\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(item) || !Number.isFinite(Date.parse(item.slice(2))))) throw new Error("PMS _lastUpdated requires gt followed by a valid date/time");
      if (key === "_sort" && !["name", "-name", "id", "-id", "lastUpdated", "-lastUpdated"].includes(item)) throw new Error("Unsupported PMS sort field");
      if (key === "_summary" && item !== "count") throw new Error("PMS _summary supports count only");
      url.searchParams.append(key, item);
    }
  }
}

/** A continuation is followed verbatim only on the exact public search endpoint. */
export function pmsNextUrl(value: string, current = `${PMS_BASE}${PMS_SEARCH}`): string {
  const url = new URL(value, current);
  if (url.origin !== new URL(PMS_BASE).origin || url.pathname !== `/public/v1${PMS_SEARCH}` || url.username || url.password || url.hash) throw new Error("Unsafe or unsupported PMS continuation URL");
  if (url.searchParams.getAll("_ct").length !== 1 || !url.searchParams.get("_ct")) throw new Error("PMS next link must contain one provider continuation token");
  for (const [key, value] of url.searchParams) {
    const test = new URL(`${PMS_BASE}${PMS_SEARCH}`);
    appendParameters(test, { [key]: key === "_count" ? Number(value) : value });
  }
  for (const key of controls) if (url.searchParams.getAll(key).length > 1) throw new Error(`Repeated PMS control parameter: ${key}`);
  return url.toString();
}

export function pmsRequest(request: Parameters<ApiFetchFn>[0]) {
  if (request.method !== "GET" || request.body !== undefined) throw new Error("PMS operations support GET without a body");
  const params = request.params ?? {};
  if (request.path === "/pms/next") {
    if (Object.keys(params).length !== 1 || typeof params.url !== "string") throw new Error("PMS continuation accepts only the returned next URL; do not change its filters");
    return { url: pmsNextUrl(params.url), operation: "search" as const };
  }
  if (request.path === `/pms${PMS_SEARCH}`) {
    const url = new URL(`${PMS_BASE}${PMS_SEARCH}`);
    appendParameters(url, params);
    return { url: url.toString(), operation: "search" as const };
  }
  const match = request.path.match(/^\/pms\/MedicinalProductDefinition\/([A-Za-z0-9.-]{1,64})\/\$everything$/);
  if (!match || match[1] === "." || match[1] === "..") throw new Error("Use PMS search or /pms/MedicinalProductDefinition/{id}/$everything with the returned resource.id");
  if (Object.keys(params).length) throw new Error("PMS $everything does not accept search parameters");
  return { url: `${PMS_BASE}${PMS_SEARCH}/${match[1]}/$everything`, operation: "detail" as const, id: match[1] };
}

import { expect, it } from "vitest";
import { PMS_BASE, PMS_SEARCH, pmsNextUrl, pmsRequest } from "./pms-request";

const request = { method: "GET", path: "/pms/MedicinalProductDefinition" };
it("preserves string identifiers, repeated AND filters, comma OR and composite units", () => {
  const params = { identifier: ["PRD001,PRD002", "PRD003"], "_has:Ingredient:for:substance-code-presentation-strength": "000123$100|000045|1|000067", _count: 10, _lastUpdated: "gt2026-09-01T00:00:00+02:00" };
  const url = new URL(pmsRequest({ ...request, params }).url);
  expect(url.searchParams.getAll("identifier")).toEqual(params.identifier);
  expect(url.searchParams.get("_has:Ingredient:for:substance-code-presentation-strength")).toBe(params["_has:Ingredient:for:substance-code-presentation-strength"]);
  expect(url.searchParams.get("_lastUpdated")).toBe(params._lastUpdated);
});

it("follows a provider token without inventing pages or losing repeated filters", () => {
  const url = `${PMS_BASE}${PMS_SEARCH}?identifier=PRD001&identifier=PRD002&_ct=a%2Bb%3D`;
  expect(pmsRequest({ method: "GET", path: "/pms/next", params: { url } }).url).toBe(url);
  expect(pmsNextUrl("?_ct=next", `${PMS_BASE}${PMS_SEARCH}?_ct=previous`)).toBe(`${PMS_BASE}${PMS_SEARCH}?_ct=next`);
});

it.each([
  { method: "POST" }, { body: {} }, { params: { _count: 9 } }, { params: { _count: 101 } },
  { params: { _count: "10" } }, { params: { identifier: 123 } }, { params: { identifier: [] } },
  { params: { _lastUpdated: "ge2026-01-01" } }, { params: { _sort: "status" } },
  { params: { _summary: "true" } }, { params: { _include: "*" } }, { params: { _format: "xml" } },
  { path: "/pms/MedicinalProductDefinition/../$everything" },
  { path: "/pms/MedicinalProductDefinition/%2Fsecret/$everything" },
  { path: "/pms/MedicinalProductDefinition/60001/$everything", params: { name: "changed" } },
])("rejects unsupported requests rather than silently broadening: %j", change => {
  expect(() => pmsRequest({ ...request, ...change })).toThrow();
});

it.each([
  "https://attacker.invalid/public/v1/MedicinalProductDefinition?_ct=x",
  `${PMS_BASE}/Patient?_ct=x`,
  `${PMS_BASE}${PMS_SEARCH}?_ct=x&access_token=secret`,
  `${PMS_BASE}${PMS_SEARCH}?_ct=x&_ct=y`,
  `${PMS_BASE}${PMS_SEARCH}?_ct=x&_count=10&_count=100`,
  `${PMS_BASE}${PMS_SEARCH}?name=x`,
  `${PMS_BASE}${PMS_SEARCH}?_ct=x#fragment`,
])("rejects unsafe or ambiguous continuation %s", url => expect(() => pmsNextUrl(url)).toThrow());

it("uses exact resource.id for detail, retaining leading zeros", () => {
  expect(pmsRequest({ method: "GET", path: "/pms/MedicinalProductDefinition/00060001/$everything" })).toEqual({ url: `${PMS_BASE}${PMS_SEARCH}/00060001/$everything`, operation: "detail", id: "00060001" });
});

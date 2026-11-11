import type { ApiEndpoint, WorkflowRecipe } from "@bio-mcp/shared/codemode/catalog";
import { PMS_FILTERS } from "../lib/pms-request";

export const pmsEndpoints: ApiEndpoint[] = [
  {
    method: "GET", path: "/pms/MedicinalProductDefinition", category: "pms", featured: true,
    summary: "Search beta PMS public human-product data (FHIR R5). Requires registered OAuth credentials. Search returns product IDs; retrieve $everything for full public product detail.",
    description: "Strings containing commas express OR; arrays of strings send repeated parameters for AND. Identifiers and SPOR codes stay strings. identifier is documented as XEVMPD (PRD...), while resource.id is the PMS ID for detail; do not equate these with website ema_product_number. Preserves original Bundle and links. No automatic page traversal or bulk-export claim.",
    queryParams: [
      ...Object.entries(PMS_FILTERS).map(([name, description]) => ({ name, type: "string" as const, required: false, description: `${description}. May also supply a string array for repeated AND constraints.` })),
      { name: "_count", type: "number", required: false, default: 10, description: "Page size, integer 10–100" },
      { name: "_sort", type: "string", required: false, enum: ["name", "-name", "id", "-id", "lastUpdated", "-lastUpdated"], description: "Supported sort field and direction" },
      { name: "_summary", type: "string", required: false, enum: ["count"], description: "Count only; absence of entries is expected and is not zero matching products" },
      { name: "_ct", type: "string", required: false, description: "Provider-issued continuation token; prefer /pms/next with the unchanged next_url" },
    ],
    example: 'return await api.get("/pms/MedicinalProductDefinition", { name: "Comirnaty", _count: 10 });',
    response: { description: "Original bundle plus fhir_version=5.0.0, beta status, provenance, product_ids and guarded next_url. Bundle.total describes matches, returned_entries describes this page only." },
  },
  {
    method: "GET", path: "/pms/MedicinalProductDefinition/{id}/$everything", category: "pms", featured: true,
    summary: "Get the complete public FHIR R5 product Bundle for a PMS resource.id, including packaging, authorisation and ingredient relationships. Beta; confidential fields are excluded.",
    pathParams: [{ name: "id", type: "string", required: true, description: "Exact MedicinalProductDefinition.resource.id from search; not PRD identifier or EMEA website product number" }],
    description: "Preserves fullUrl, references, identifiers with systems, strength units and qualifiers, contained resources and version metadata. A 404 can mean unavailable/nullified product; it does not prove the product never existed. No R4 conversion or clinical-record operation occurs.",
    example: 'return await api.get("/pms/MedicinalProductDefinition/600000000022/$everything");',
  },
  {
    method: "GET", path: "/pms/next", category: "pms",
    summary: "Continue a PMS search using its unchanged provider next_url. Local adapter operation restricted to the official search host/path; no automatic retries or complete-dataset claim.",
    queryParams: [{ name: "url", type: "string", required: true, description: "Exact next_url returned by the previous call; no additional filters" }],
  },
];

export const pmsWorkflows: WorkflowRecipe[] = [{
  title: "PMS search to public product detail",
  description: "Preserve discovery and error/staging handles. Fetch detail only for one unambiguous product with no next page; otherwise explicitly select a resource.id from discovery before a later call. Keep PMS R5 and website evidence separate.",
  keywords: ["PMS", "FHIR R5", "beta", "product detail", "ingredients", "packaging"],
  code: 'const search = await api.get("/pms/MedicinalProductDefinition", { name: "Comirnaty", _count: 10 }); if (search.__api_error || search.__staged) return search; if (search.has_next_page || search.bundle?.total !== 1 || search.product_ids?.length !== 1) return { search, next_step: "Select the intended PMS resource.id; inspect remaining pages or staged data first." }; const id = search.product_ids[0]; const detail = await api.get("/pms/MedicinalProductDefinition/" + encodeURIComponent(id) + "/$everything"); return { search, detail };',
}, {
  title: "Inspect updated website medicine-type fields",
  description: "Website feeds keep their raw meta/data envelope. Since 24 February 2026, generic replaces generic or hybrid; current feeds include generic: Yes/No. Inspect raw schema before filtering, retain publisher timestamp and ema_product_number. Do not synthesize PMS IDs from EMEA product numbers.",
  keywords: ["generic", "medicine type", "post-authorisation", "2026"],
  code: 'return await api.get("/post-authorisation");',
}];

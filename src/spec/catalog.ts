import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const emaCatalog: ApiCatalog = {
    name: "European Medicines Agency",
    baseUrl: "https://www.ema.europa.eu",
    version: "1.0",
    auth: "none",
    endpointCount: 7,
    notes:
        "- EU regulatory database for centrally authorized medicines in the European Union\n" +
        "- Contains 2,641+ centrally authorized human and veterinary medicines\n" +
        "- Data is updated twice daily from EMA production systems\n" +
        "- No authentication required; all endpoints return JSON arrays\n" +
        "- Covers: medicines, orphan designations, paediatric investigation plans, safety communications (DHPCs), supply shortages, PSUR assessments, and EPARs\n" +
        "- Code Mode paths are mapped to /en/api/v1/* automatically",
    endpoints: [
        {
            method: "GET",
            path: "/medicines",
            summary: "List all centrally authorized EU medicines with active substance, ATC code, authorization status, therapeutic area, and marketing authorization holder",
            category: "medicines",
        },
        {
            method: "GET",
            path: "/orphan-designations",
            summary: "List orphan medicinal product designations granted by the European Commission for rare diseases",
            category: "orphan",
        },
        {
            method: "GET",
            path: "/paediatric",
            summary: "List paediatric investigation plans (PIPs) — agreed plans for studies in children to support medicine authorization",
            category: "paediatric",
        },
        {
            method: "GET",
            path: "/dhpcs",
            summary: "List Direct Healthcare Professional Communications (DHPCs) — important safety communications about medicines",
            category: "safety",
        },
        {
            method: "GET",
            path: "/shortages",
            summary: "List current and resolved supply shortages for centrally authorized medicines in the EU",
            category: "shortages",
        },
        {
            method: "GET",
            path: "/psusa",
            summary: "List Periodic Safety Update Report (PSUR) single assessments — post-authorization safety reviews",
            category: "safety",
        },
        {
            method: "GET",
            path: "/epars",
            summary: "List European Public Assessment Reports (EPARs) — scientific assessment documents for centrally authorized medicines",
            category: "assessment",
        },
    ],
};

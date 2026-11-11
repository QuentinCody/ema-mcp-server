import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";
import { pmsEndpoints, pmsWorkflows } from "./pms";

export const emaCatalog: ApiCatalog = {
    name: "European Medicines Agency",
    baseUrl: "https://www.ema.europa.eu",
    version: "2026.09",
    auth: "Website feeds: none. PMS public beta: registered OAuth2 Bearer token in Worker environment.",
    endpointCount: 10 + pmsEndpoints.length,
    workflows: pmsWorkflows,
    notes:
        "- Website JSON feeds cover EMA pages and documents; medicines can have different application/authorisation statuses, not only approved medicines\n" +
        "- Website feeds update twice daily; retain meta.timestamp and all original fields\n" +
        "- Website responses are meta/data objects, not bare arrays. No upstream filter or paging; use staged SQL for local filtering\n" +
        "- Website reads require complete HTTP 200 and a matching native total_records count. _ema preserves the decoded-body SHA-256/byte count, validators, retrieval time and explicit count checks; publisher time remains in meta.timestamp\n" +
        "- Invalid or partial files fail with retained public error evidence. Matching file counts do not prove clinical coverage or an immutable release. Preserve all rows, including repeated IDs and historical/future fields\n" +
        "- Covers: medicines, orphan designations, paediatric investigation plans, safety communications (DHPCs), supply shortages, PSUR assessments, and EPARs\n" +
        "- Website paths map to official /en/documents/report/*.json files\n" +
        "- /pms/* is a separate beta FHIR R5 public-product service. Requires registered credentials; human non-nullified products only. It is not the clinical FHIR R4 server\n" +
        "- PMS uses SPOR identifiers: retain identifier systems, ingredient units, dates and resource versions. Website EMA numbers, PMS resource IDs and XEVMPD identifiers are distinct\n" +
        "- February 2026 website medicine-type update: generic replaced generic or hybrid; retain source fields, do not normalize historical releases silently",
    endpoints: [
        ...pmsEndpoints,
        { method: "GET", path: "/post-authorisation", category: "medicines", summary: "EMA website post-authorisation procedure feed; original generic field and publisher timestamp preserved" },
        { method: "GET", path: "/referrals", category: "safety", summary: "EMA website referral pages feed, retaining procedure status and product references" },
        { method: "GET", path: "/all-documents", category: "assessment", summary: "EMA English document feed; includes EMA product numbers where provided. Full-file read bounded to 64MB; oversized files require external download" },
        {
            method: "GET",
            path: "/medicines",
            summary: "EMA medicine-pages feed with substance, ATC code, application/authorisation status and holder. Includes different regulatory statuses; not every row is an authorised medicine",
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
            summary: "EMA documents for centrally authorised medicines, including EPAR-related documents and translations. Retain document type and EMA product number before filtering",
            category: "assessment",
        },
    ],
};

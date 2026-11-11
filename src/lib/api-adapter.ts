import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { createPmsFetch } from "./pms";
import type { PmsCredentials } from "./pms-auth";
import { fetchWebsiteFeed } from "./website";

/**
 * Route map: Code Mode clean paths -> EMA static JSON report endpoints.
 * EMA serves data as static JSON files under /en/documents/report/.
 * Response format: { meta: { total_records, timestamp }, data: [...] }
 */
const ROUTE_MAP: Record<string, string> = {
    "/medicines": "/en/documents/report/medicines-output-medicines_json-report_en.json",
    "/orphan-designations": "/en/documents/report/medicines-output-orphan_designations-json-report_en.json",
    "/paediatric": "/en/documents/report/medicines-output-paediatric_investigation_plans-output-json-report_en.json",
    "/dhpcs": "/en/documents/report/dhpc-output-json-report_en.json",
    "/shortages": "/en/documents/report/shortages-output-json-report_en.json",
    "/psusa": "/en/documents/report/medicines-output-periodic_safety_update_report_single_assessments-output-json-report_en.json",
    "/epars": "/en/documents/report/documents-output-epar_documents_json-report_en.json",
    "/post-authorisation": "/en/documents/report/medicines-output-post_authorisation_json-report_en.json",
    "/referrals": "/en/documents/report/referrals-output-json-report_en.json",
    "/all-documents": "/en/documents/report/documents-output-json-report_en.json",
};

export function createEmaApiFetch(env: PmsCredentials = {}, fetcher: typeof fetch = fetch): ApiFetchFn {
    const pms = createPmsFetch(env, fetcher);
    return async (request) => {
        if (request.path === "/pms" || request.path.startsWith("/pms/")) return pms(request);
        if (request.method !== "GET" || request.body !== undefined) throw new Error("EMA website feeds support GET without a body");
        let path = request.path;

        // Map clean Code Mode paths to actual EMA API paths
        for (const [clean, actual] of Object.entries(ROUTE_MAP)) {
            if (path === clean) {
                path = actual;
                break;
            }
        }

        if (!Object.values(ROUTE_MAP).includes(path)) throw new Error("Unknown EMA website feed; use ema_search for supported routes");
        if (Object.keys(request.params ?? {}).length) throw new Error("EMA website files have no server-side search or paging; query the returned/staged feed locally");
        const url = `https://www.ema.europa.eu${path}`;
        return fetchWebsiteFeed(url, fetcher);
    };
}

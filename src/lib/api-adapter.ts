import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { emaFetch } from "./http";

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

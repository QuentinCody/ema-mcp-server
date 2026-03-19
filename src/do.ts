import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

interface EmaMedicine {
    medicine_name?: string;
    active_substance?: string;
    authorisation_status?: string;
    atc_code?: string;
    therapeutic_area?: string;
}

interface EmaOrphanDesignation {
    orphan_designation?: string;
    designation_number?: string;
    medicine_name?: string;
    active_substance?: string;
    condition?: string;
}

interface EmaPaediatricPlan {
    pip_number?: string;
    paediatric_investigation_plan?: string;
    medicine_name?: string;
    active_substance?: string;
    decision_date?: string;
}

interface EmaDhpc {
    dhpc?: string;
    safety_communication?: string;
    medicine_name?: string;
    active_substance?: string;
    date_published?: string;
}

interface EmaShortage {
    shortage?: string;
    shortage_status?: string;
    medicine_name?: string;
    active_substance?: string;
}

interface EmaPsusa {
    psusa?: string;
    psur?: string;
    psusa_number?: string;
    active_substance?: string;
    outcome?: string;
}

interface EmaEpar {
    epar?: string;
    epar_url?: string;
    procedure_number?: string;
    medicine_name?: string;
    active_substance?: string;
}

function isMedicine(sample: object): sample is EmaMedicine {
    return (
        "medicine_name" in sample ||
        "active_substance" in sample ||
        "authorisation_status" in sample
    );
}

function isOrphanDesignation(sample: object): sample is EmaOrphanDesignation {
    return "orphan_designation" in sample || "designation_number" in sample;
}

function isPaediatricPlan(sample: object): sample is EmaPaediatricPlan {
    return "pip_number" in sample || "paediatric_investigation_plan" in sample;
}

function isDhpc(sample: object): sample is EmaDhpc {
    return "dhpc" in sample || "safety_communication" in sample;
}

function isShortage(sample: object): sample is EmaShortage {
    return "shortage" in sample || "shortage_status" in sample;
}

function isPsusa(sample: object): sample is EmaPsusa {
    return "psusa" in sample || "psur" in sample || "psusa_number" in sample;
}

function isEpar(sample: object): sample is EmaEpar {
    return "epar" in sample || "epar_url" in sample || "procedure_number" in sample;
}

export class EmaDataDO extends RestStagingDO {
    protected getSchemaHints(data: unknown): SchemaHints | undefined {
        if (!data || typeof data !== "object") return undefined;

        if (Array.isArray(data)) {
            const sample: unknown = data[0];
            if (!sample || typeof sample !== "object") return undefined;

            if (isMedicine(sample)) {
                return {
                    tableName: "medicines",
                    indexes: [
                        "medicine_name",
                        "active_substance",
                        "authorisation_status",
                        "atc_code",
                        "therapeutic_area",
                    ],
                };
            }

            if (isOrphanDesignation(sample)) {
                return {
                    tableName: "orphan_designations",
                    indexes: [
                        "designation_number",
                        "medicine_name",
                        "active_substance",
                        "condition",
                    ],
                };
            }

            if (isPaediatricPlan(sample)) {
                return {
                    tableName: "paediatric_plans",
                    indexes: [
                        "pip_number",
                        "medicine_name",
                        "active_substance",
                        "decision_date",
                    ],
                };
            }

            if (isDhpc(sample)) {
                return {
                    tableName: "dhpcs",
                    indexes: [
                        "medicine_name",
                        "active_substance",
                        "date_published",
                    ],
                };
            }

            if (isShortage(sample)) {
                return {
                    tableName: "shortages",
                    indexes: [
                        "medicine_name",
                        "active_substance",
                        "shortage_status",
                    ],
                };
            }

            if (isPsusa(sample)) {
                return {
                    tableName: "psusa",
                    indexes: [
                        "active_substance",
                        "psusa_number",
                        "outcome",
                    ],
                };
            }

            if (isEpar(sample)) {
                return {
                    tableName: "epars",
                    indexes: [
                        "medicine_name",
                        "active_substance",
                        "procedure_number",
                    ],
                };
            }
        }

        // Single object with medicine-level data
        if (!Array.isArray(data) && isMedicine(data)) {
            return {
                tableName: "medicine_detail",
                indexes: [
                    "medicine_name",
                    "active_substance",
                    "authorisation_status",
                ],
            };
        }

        return undefined;
    }
}

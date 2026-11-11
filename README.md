# EMA MCP Server

This is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. It lets MCP clients (Claude Desktop, Claude Code, Continue, etc.) query the upstream EMA API in natural language. It is one of 100+ servers in the [Bio MCP](../../README.md) monorepo.

## Connect

The server is deployed and ready at:

```
https://ema-mcp-server.quentincody.workers.dev/mcp
```

Add it to your MCP client (Claude Desktop → Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "ema": {
      "command": "npx",
      "args": ["mcp-remote", "https://ema-mcp-server.quentincody.workers.dev/mcp"]
    }
  }
}
```

For local development the server runs at `http://localhost:8850/mcp` (start it with `./scripts/dev-servers.sh ema`):

```json
{
  "mcpServers": {
    "ema-local": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8850/mcp"]
    }
  }
}
```

## Tools

- `ema_search` — discover website feeds and PMS public-product operations
- `ema_execute` — **Code Mode**: write JavaScript in a V8 isolate (`api.get()` / `api.post()` / `searchSpec()`) instead of issuing tool calls one by one
- `ema_query_data` — run SQL over large responses auto-staged into a per-session SQLite database
- `ema_get_schema` — inspect the inferred schema of a staged dataset

Large responses (>30KB) are auto-staged into a queryable SQLite database; the tools return a `data_access_id` you can query with SQL.

Every tool returns both a human-readable `content` summary and a structured `structuredContent` payload.

All four tools also have `mcp_ema_*` aliases.

## PMS public product data (beta, FHIR R5)

The [PMS public API](https://api.pms.ema.europa.eu/public/v1/swagger) adds product search and
complete public product Bundles. The [June 12, 2026 announcement](https://plm-portal.ema.europa.eu/Guidance/article/KA-02917/en-us)
labels it beta. This server keeps PMS data separate from website feeds and clinical FHIR R4.
It preserves original resources, references, identifier systems, versions, dates, ingredient
strength values and units. Manufacturer information and other confidential data are outside
the public dataset; veterinary and nullified products are unavailable.

Public data requires registered OAuth2 credentials. Configure Worker secrets:

- `EMA_PMS_ACCESS_TOKEN` for an externally managed Bearer token, without the `Bearer` prefix; or
- `EMA_PMS_CLIENT_ID`, `EMA_PMS_CLIENT_SECRET`, `EMA_PMS_TOKEN_URL` from EMA registration,
  plus `EMA_PMS_SCOPE` if required by that registration.

The client-credentials exchange uses an HTTPS token endpoint and a URL-encoded form.
Tokens remain in the host and are cached within an adapter instance until shortly before
expiry. A supplied access token takes precedence and requires external renewal. A 401
invalidates an exchanged token; there is no automatic data-request retry. Registration,
token endpoint and scope must come from EMA; this implementation does not create an account
or guess those values. Token-exchange responses are not exposed to Code Mode.

```javascript
// Search identifiers are XEVMPD values. Detail uses returned product_ids/resource.id.
return await api.get("/pms/MedicinalProductDefinition", {
  name: "Comirnaty", _count: 10
});
// After selecting the intended returned PMS ID:
// return await api.get("/pms/MedicinalProductDefinition/600000000022/$everything");
// Continue with the unchanged provider next_url:
// return await api.get("/pms/next", { url: previous.next_url });
```

Search supports documented SPOR/name/identifier filters, `_lastUpdated` with `gt`, sorting,
count-only results and pages of 10–100 products. A comma-separated string means OR; an array
of strings emits repeated parameters for AND. Preserve string IDs and composite strength
syntax. PMS resource IDs, XEVMPD identifiers and website `ema_product_number` values are
different namespaces. No crosswalk is inferred from similar names.

Responses wrap the original `bundle` with FHIR version, beta status, retrieval provenance,
response hash, returned IDs and a validated `next_url`. `Bundle.total` is distinct from this
page's entry count. No automatic paging or bulk export is performed. PMS data reads are
limited to 8MB and 30 seconds; token exchange to 64KB and 15 seconds. One deadline
covers headers and the complete body, including stalled reads. Redirects and
partial HTTP responses are refused. Code Mode allows 60 seconds to accommodate
the bounded exchange followed by a data read.
Errors preserve status, OperationOutcome and retry guidance while redacting the access token.
Large results use canonical staging; inspect `ema_get_schema` before querying.

## Website JSON feeds

Website feeds remain anonymous and retain their original `meta`/`data` envelope plus `_ema`
retrieval provenance. There is no upstream filter or paging: filter returned/staged data
locally. A read is bounded to 64MB/30 seconds; larger files need external download.
Source metadata is preserved rather than replaced with retrieval time.

Website reads require HTTP 200 without Content-Range, a valid native `meta`/`data`
envelope, a nonempty publisher timestamp and a nonnegative integer
`meta.total_records` matching the returned row count. Every row must be an object;
the adapter keeps repeated IDs, unknown fields, nested values and historical
medicine-type fields. Missing or inconsistent counts, invalid UTF-8, invalid or
numerically unsafe JSON and a native `_ema` field collision fail explicitly.
These checks establish transport and file-count consistency, not clinical
coverage, medicine equivalence or completeness of all EMA knowledge.

`_ema` carries `transport_complete`, `reported_rows`, `observed_rows`,
`record_count_matches`, retrieval time, validators and the SHA-256/byte count of
the decoded HTTP response body. BOM, line endings and source whitespace remain
part of that hash. Compressed HTTP transfer sizes are not compared with decoded
body sizes; actual streamed decoded bytes are always bounded. No publication
date or immutable release is inferred from the content hash. The pipeline also
checks the native count before selecting medicines from the recovered feed.

Public feed HTTP/schema errors retain their original text, status, response hash
and retry guidance. PMS token responses remain private and echoed access tokens
remain redacted. Both aliases measure and cite complete MCP envelopes, including
SQL/schema results and errors; large responses stage before transport limits are
reached. A synthetic document-size feed over 37MB has been recovered exactly
through the actual MCP HTTP/SQLite code with a mocked Workers base and isolate.
This does not establish Workerd memory/performance or native current-release
qualification. See the [feed-integrity review](../../docs/audits/2026-10-05-ema-feeds-review.md).

The [website change log](https://www.ema.europa.eu/en/about-us/about-website/download-website-data-json-data-format)
records the February 24, 2026 change from “generic or hybrid” to “generic”, and July additions
of EMA product numbers to document feeds. Current post-authorisation data uses a `generic`
Yes/No field. The adapter does not restrict or rename medicine-type values; historical and
future fields survive unchanged. The existing `/post-authorisation`, `/referrals` and
`/all-documents` routes are now discoverable alongside the other feeds.

The OpenAPI and a public post-authorisation feed were inspected on 2026-09-28. Local tests
use synthetic PMS Bundles; authenticated PMS content, token exchange, pagination latency
and live MCP staging remain unverified in this restricted environment. No deployment has
been performed for this addition.

## Development

```bash
./scripts/dev-servers.sh ema            # run locally (port 8850)
pnpm --filter ema-mcp-server run deploy   # deploy to Cloudflare Workers
```

See [`docs/adding-mcp-servers.md`](../../docs/adding-mcp-servers.md) and the root [README](../../README.md) for the full architecture (Code Mode, staging, portals).

---

*Auto-generated baseline README — refine with server-specific detail as needed.*

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from EMA website JSON / PMS and stays under the terms of that source: EMA legal notice: reuse for commercial and non-commercial purposes with EMA acknowledged as the source.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DwClient } from "../client.js";
import { jsonParam, numParam } from "../utils.js";

let swaggerCache: { spec: Record<string, unknown>; ts: number } | null = null;
const SWAGGER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchSwagger(client: DwClient): Promise<Record<string, unknown>> {
  if (swaggerCache && Date.now() - swaggerCache.ts < SWAGGER_CACHE_TTL) {
    return swaggerCache.spec;
  }
  // The swagger spec is at /admin/api/api.json
  // DW may return the spec as a raw JSON string or wrapped in the standard model envelope
  const raw = await client.get<unknown>("api.json");

  let spec: Record<string, unknown>;

  if (raw && typeof raw === "object" && "paths" in (raw as Record<string, unknown>)) {
    // Case 1: already a parsed spec object with "paths"
    spec = raw as Record<string, unknown>;
  } else if (typeof raw === "string") {
    // Case 2: double-encoded JSON string
    spec = JSON.parse(raw) as Record<string, unknown>;
  } else {
    // Case 3: wrapped in { model: "..." } or { model: { paths: ... } }
    const r = raw as Record<string, unknown>;
    if (typeof r.model === "string") {
      spec = JSON.parse(r.model) as Record<string, unknown>;
    } else if (r.model && typeof r.model === "object" && "paths" in (r.model as Record<string, unknown>)) {
      spec = r.model as Record<string, unknown>;
    } else {
      spec = r;
    }
  }

  swaggerCache = { spec, ts: Date.now() };
  return spec;
}

export function registerDiscoveryTools(server: McpServer, client: DwClient): void {

  server.registerTool(
    "dw_api_search",
    {
      description: `Search the DynamicWeb Admin API Swagger spec for endpoints matching a keyword.
    Use this when you're unsure which endpoint to call — search by feature name (e.g. "navigation", "media", "user").
    Returns matching paths with their HTTP methods and summaries.`,
      inputSchema: {
        keyword: z.string().describe("Search term, e.g. 'navigation', 'file', 'user', 'page'"),
        maxResults: numParam(z.number().optional().default(20)),
      },
    },
    async ({ keyword, maxResults }) => {
      // Fetch Swagger spec from the DW instance
      const spec = await fetchSwagger(client);

      const paths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>;
      const kw = keyword.toLowerCase();
      const matches: Array<{ path: string; method: string; summary: string; operationId: string }> = [];

      outer: for (const [path, methods] of Object.entries(paths)) {
        for (const [method, op] of Object.entries(methods)) {
          if (!["get", "post", "put", "delete", "patch"].includes(method)) continue;
          const operation = op as Record<string, unknown>;
          const summary = String(operation.summary ?? "");
          const operationId = String(operation.operationId ?? "");
          const tags = (operation.tags as string[] ?? []).join(" ");

          if (
            path.toLowerCase().includes(kw) ||
            summary.toLowerCase().includes(kw) ||
            operationId.toLowerCase().includes(kw) ||
            tags.toLowerCase().includes(kw)
          ) {
            matches.push({ path, method: method.toUpperCase(), summary, operationId });
          }

          if (matches.length >= maxResults) break outer;
        }
      }

      if (matches.length === 0) {
        return { content: [{ type: "text", text: `No endpoints found matching '${keyword}'` }] };
      }

      const text = matches
        .map(m => `${m.method} ${m.path}\n  Summary: ${m.summary}\n  OperationId: ${m.operationId}`)
        .join("\n\n");

      return { content: [{ type: "text", text: `Found ${matches.length} endpoints for '${keyword}':\n\n${text}` }] };
    }
  );

  server.registerTool(
    "dw_api_endpoint_schema",
    {
      description: `Get the full request/response schema for a specific DynamicWeb Admin API endpoint.
    Use this before calling an unknown endpoint to understand its parameters.`,
      inputSchema: {
        path: z.string().describe("Endpoint path, e.g. '/NavigationSave' or 'MediaFolderAll'"),
        method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional().default("POST"),
      },
    },
    async ({ path: endpointPath, method }) => {
      const spec = await fetchSwagger(client);
      const paths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>;

      // Normalize path - try with and without leading slash
      const normalizedPath = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
      const entry = paths[normalizedPath] ?? paths[endpointPath];

      if (!entry) {
        // Try partial match
        const partial = Object.entries(paths).find(([p]) =>
          p.toLowerCase().includes(endpointPath.toLowerCase())
        );
        if (partial) {
          return { content: [{ type: "text", text: `Path '${endpointPath}' not found exactly. Did you mean: ${partial[0]}?\n\n${JSON.stringify(partial[1], null, 2)}` }] };
        }
        return { content: [{ type: "text", text: `Endpoint '${endpointPath}' not found in Swagger spec` }] };
      }

      const methodOp = (entry[method.toLowerCase()] ?? entry[Object.keys(entry)[0]]) as Record<string, unknown>;
      return { content: [{ type: "text", text: JSON.stringify({ path: normalizedPath, ...methodOp }, null, 2) }] };
    }
  );

  server.registerTool(
    "dw_api_call",
    {
      description: `Make a raw call to any DynamicWeb Admin API endpoint.
    For GET: provide params as query params.
    For POST: choose bodyMode.
      - 'model' (default) — wraps your model in {"Model": ...}. Used by most Save endpoints that create new records.
      - 'raw'   — sends your model as the top-level body (no wrapper). Used by delete-style commands (e.g. ProductDelete, ItemTypeDelete). Supports params in the URL.
      - 'update' — sends {RunUpdateIndex?, QueryData, model} and appends ?Query.Type=queryType. Used to UPDATE existing records via screen commands (e.g. ProductSave).
    For update mode: pass queryType (e.g. 'ProductById'), queryData (identifies the record: {Id, LanguageId, QueryContext:{screenTypeName:'ProductEdit'}}), and optionally extraFields (e.g. {RunUpdateIndex:true}).`,
      inputSchema: {
        endpoint: z.string().describe("Endpoint name without leading slash, e.g. 'NavigationAll'"),
        method: z.enum(["GET", "POST"]).optional().default("GET"),
        params: jsonParam(z.record(z.string()).optional()).describe("Query parameters (used by GET and POST-raw)"),
        model: jsonParam(z.record(z.unknown()).optional()).describe("Body for POST"),
        bodyMode: z.enum(["model", "raw", "update"]).optional().default("model").describe("How to wrap the body: 'model' | 'raw' | 'update'"),
        queryType: z.string().optional().describe("Required for bodyMode='update'. E.g. 'ProductById', 'ProductsAll'"),
        queryData: jsonParam(z.record(z.unknown()).optional()).describe("Required for bodyMode='update'. Identifies the record, e.g. {Id:'PROD1', LanguageId:'LANG1', QueryContext:{screenTypeName:'ProductEdit'}}"),
        extraFields: jsonParam(z.record(z.unknown()).optional()).describe("Extra top-level body fields for bodyMode='update' (e.g. {RunUpdateIndex:true})"),
      },
    },
    async ({ endpoint, method, params, model, bodyMode, queryType, queryData, extraFields }) => {
      let res: unknown;
      if (method === "GET") {
        res = await client.get(endpoint, params);
      } else if (bodyMode === "update") {
        if (!queryType) throw new Error("bodyMode='update' requires queryType, e.g. 'ProductById'");
        res = await client.update(endpoint, queryType, queryData ?? {}, model ?? {}, extraFields);
      } else if (bodyMode === "raw") {
        res = await client.command(endpoint, model ?? {}, params);
      } else {
        res = await client.post(endpoint, model ?? {});
      }
      return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
  );
}

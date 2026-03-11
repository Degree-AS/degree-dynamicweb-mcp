/**
 * DynamicWeb HTTP client
 *
 * DW has two API surfaces:
 *
 * 1. Admin API (Swagger-documented, 1800+ endpoints)
 *    Base: {DW_BASE_URL}/admin/api/{Endpoint}
 *    Auth: Bearer token
 *    GET  → query params
 *    POST → JSON body with uppercase "Model" key
 *
 * 2. Update API (same endpoints, different mode for updating existing records)
 *    Base: {DW_BASE_URL}/Admin/Api/{Endpoint}?Query.Type={Type}
 *    POST → JSON body with "QueryData" (identifies record) + lowercase "model" key
 *
 * 3. Delivery API (read-only content API)
 *    Base: {DW_BASE_URL}/dwapi/content/{resource}
 *    No auth required
 */

export interface DwConfig {
  baseUrl: string;
  token: string;
}

export class DwClient {
  constructor(private config: DwConfig) {
    // Remove trailing slash
    this.config = {
      ...config,
      baseUrl: config.baseUrl.replace(/\/$/, ""),
    };
  }

  /** GET /admin/api/{endpoint} with query params */
  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.config.baseUrl}/admin/api/${endpoint}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    return this.request<T>(url.toString(), { method: "GET" });
  }

  /** POST /admin/api/{endpoint} — creates new records, body: { Model: {...} } */
  async post<T>(endpoint: string, model: Record<string, unknown>): Promise<T> {
    const url = `${this.config.baseUrl}/admin/api/${endpoint}`;
    return this.request<T>(url, {
      method: "POST",
      body: JSON.stringify({ Model: model }),
    });
  }

  /** POST /admin/api/{endpoint} — flat body (no Model wrapper). Used by delete commands. */
  async command<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.config.baseUrl}/admin/api/${endpoint}`;
    return this.request<T>(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * POST /Admin/Api/{endpoint}?Query.Type={queryType} — updates existing records
   * Body: { QueryData: { SystemName: "..." }, model: {...} }
   */
  async update<T>(
    endpoint: string,
    queryType: string,
    queryData: Record<string, unknown>,
    model: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.config.baseUrl}/Admin/Api/${endpoint}?Query.Type=${queryType}`;
    return this.request<T>(url, {
      method: "POST",
      body: JSON.stringify({ QueryData: queryData, model }),
    });
  }

  /** GET /dwapi/content/{resource} — delivery API, no auth */
  async delivery<T>(
    resource: string,
    params?: Record<string, string>
  ): Promise<T> {
    const url = new URL(`${this.config.baseUrl}/dwapi/content/${resource}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Delivery API ${resource} failed: ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  private async request<T>(
    url: string,
    init: RequestInit
  ): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 200)}`);
    }

    if (!res.ok) {
      const d = data as Record<string, unknown>;
      const msg = d.message ?? d.Message ?? JSON.stringify(data);
      throw new Error(`DW API error ${res.status} at ${url}: ${msg}`);
    }

    return data as T;
  }
}

/** Unwrap { Model: { Data: [...] } } list responses (handles both PascalCase and camelCase) */
export function unwrapList<T>(response: unknown): T[] {
  const r = response as Record<string, unknown>;
  const model = (r.Model ?? r.model ?? r) as Record<string, unknown>;
  if (Array.isArray(model)) return model as T[];
  if (Array.isArray(model.Data)) return model.Data as T[];
  if (Array.isArray(model.data)) return model.data as T[];
  if (Array.isArray(r.Data)) return r.Data as T[];
  if (Array.isArray(r.data)) return r.data as T[];
  return [];
}

/** Unwrap { Model: {...} } single item responses (handles both PascalCase and camelCase) */
export function unwrapModel<T>(response: unknown): T {
  const r = response as Record<string, unknown>;
  return ((r.Model ?? r.model ?? r) as T);
}

/** Check response status (handles both command and query response formats) */
export function checkStatus(response: unknown): { ok: boolean; message: string } {
  const r = response as Record<string, unknown>;
  const successful = r.Successful ?? r.successful;
  const status = r.Status ?? r.status;
  const message = (r.Message ?? r.message ?? r.Exception ?? r.exception ?? "") as string;
  const ok = successful === true || status === 0 || status === "ok";
  return { ok, message };
}

/** Set field values in a DW Groups/Fields item structure (PageItem or ContentItem).
 *  Handles both camelCase and PascalCase property names from DW API. */
export function setItemFieldValues(
  item: Record<string, unknown> | undefined,
  fields: Record<string, unknown>
): void {
  if (!item) return;
  const groups = (item.groups ?? item.Groups ?? []) as Array<Record<string, unknown>>;
  for (const group of groups) {
    const groupFields = (group.fields ?? group.Fields ?? []) as Array<Record<string, unknown>>;
    for (const field of groupFields) {
      const sysName = (field.systemName ?? field.SystemName) as string;
      if (sysName in fields) {
        // Set both casings to be safe
        field.value = fields[sysName];
        field.Value = fields[sysName];
      }
    }
  }
}

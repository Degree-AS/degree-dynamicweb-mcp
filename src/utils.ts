import { z } from "zod";

/** Read a property from a DW object, trying camelCase first then PascalCase */
export function prop(obj: Record<string, unknown>, name: string): unknown {
  const camel = name.charAt(0).toLowerCase() + name.slice(1);
  return obj[camel] ?? obj[name];
}

/**
 * Wraps a Zod schema with a JSON string preprocessor.
 *
 * MCP clients (including Claude Code) may serialize nested object/array
 * parameters as JSON strings. This preprocessor transparently parses them
 * before Zod validation runs.
 */
export function jsonParam<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(v => {
    if (typeof v === "string") {
      try { return JSON.parse(v); } catch { return v; }
    }
    return v;
  }, schema);
}

/**
 * Preprocess a string-encoded number (MCP may pass numbers as strings).
 */
export function numParam<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(v => (typeof v === "string" ? Number(v) : v), schema);
}

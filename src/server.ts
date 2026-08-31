/**
 * Server construction, independent of transport.
 *
 * Nothing here touches stdio, HTTP, or process state. An entrypoint picks a transport and
 * connects it; the same server works over stdio (local clients such as Claude Code, Cursor,
 * or an agent framework spawning the binary) or over Streamable HTTP (a hosted endpoint that
 * ChatGPT and the OpenAI Responses API can reach).
 *
 * Process-level policy - disabling TLS verification, warning about a missing token - belongs to
 * the entrypoint, not here: what is right for a local child process is wrong for a hosted server.
 */
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DwClient, type DwConfig } from "./client.js";
import { registerItemTypeTools } from "./tools/itemTypes.js";
import { registerPageTools } from "./tools/pages.js";
import { registerParagraphTools } from "./tools/paragraphs.js";
import { registerDeliveryTools } from "./tools/delivery.js";
import { registerDiscoveryTools } from "./tools/discovery.js";
import { registerFileTools } from "./tools/files.js";
import { registerProductTools } from "./tools/products.js";
import { registerProductSchemaTools } from "./tools/productSchema.js";

export const SERVER_NAME = "degree-dynamicweb";

/**
 * Read the version from package.json so a release bump has a single home.
 *
 * `require` rather than an `import` of ../package.json: tsconfig sets rootDir to src, so importing
 * a file above it would restructure dist/. The relative path holds either way - src/ and dist/ are
 * both one level below the manifest - and npm always ships package.json regardless of `files`.
 *
 * A missing or unreadable manifest degrades to "0.0.0" rather than failing startup: an MCP client
 * only reports this string, and refusing to serve 45 working tools over it would be absurd.
 */
function readVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const { version } = require("../package.json") as { version?: unknown };
    return typeof version === "string" ? version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const SERVER_VERSION = readVersion();

/** Default base URL, suited to a local DW development site. */
export const DEFAULT_BASE_URL = "https://localhost:38547";

const registrars = [
  registerItemTypeTools,
  registerPageTools,
  registerParagraphTools,
  registerDeliveryTools,
  registerDiscoveryTools,
  registerFileTools,
  registerProductTools,
  registerProductSchemaTools,
];

/** Build an MCP server with every tool registered against `config`. Caller connects a transport. */
export function createServer(config: DwConfig): McpServer {
  const client = new DwClient(config);
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  for (const register of registrars) {
    register(server, client);
  }

  return server;
}

/** Read DW config from an environment. Pure - validating it is the entrypoint's job. */
export function configFromEnv(env: NodeJS.ProcessEnv = process.env): DwConfig {
  return {
    baseUrl: env.DW_BASE_URL ?? DEFAULT_BASE_URL,
    token: env.DW_API_TOKEN ?? "",
  };
}

/** True when the token is absent, or is an unsubstituted config placeholder such as `{{TOKEN}}`. */
export function isTokenMissing(config: DwConfig): boolean {
  return !config.token || config.token.startsWith("{");
}

/** True when `baseUrl` is a loopback host, whose DW dev certificate is self-signed. */
export function isLoopback(baseUrl: string): boolean {
  return baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
}

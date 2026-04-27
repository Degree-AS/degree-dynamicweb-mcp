#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DwClient, type DwConfig } from "./client.js";
import { registerItemTypeTools } from "./tools/itemTypes.js";
import { registerPageTools } from "./tools/pages.js";
import { registerParagraphTools } from "./tools/paragraphs.js";
import { registerDeliveryTools } from "./tools/delivery.js";
import { registerDiscoveryTools } from "./tools/discovery.js";
import { registerFileTools } from "./tools/files.js";
import { registerProductTools } from "./tools/products.js";
import { registerProductSchemaTools } from "./tools/productSchema.js";

const baseUrl = process.env.DW_BASE_URL ?? "https://localhost:38547";
const token = process.env.DW_API_TOKEN ?? "";

if (!token || token.startsWith("{")) {
  process.stderr.write(
    "[degree-dynamicweb-mcp] Warning: DW_API_TOKEN not set. Set it in ~/.zshrc or in .mcp.json env.\n"
  );
}

// Disable TLS verification for local DW with self-signed cert
if (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1")) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  process.stderr.write(
    "[degree-dynamicweb-mcp] TLS verification disabled for localhost.\n"
  );
}

const config: DwConfig = { baseUrl, token };
const dwClient = new DwClient(config);

const server = new McpServer({
  name: "degree-dynamicweb",
  version: "1.3.0",
});

registerItemTypeTools(server, dwClient);
registerPageTools(server, dwClient);
registerParagraphTools(server, dwClient);
registerDeliveryTools(server, dwClient);
registerDiscoveryTools(server, dwClient);
registerFileTools(server, dwClient);
registerProductTools(server, dwClient);
registerProductSchemaTools(server, dwClient);

const transport = new StdioServerTransport();
await server.connect(transport);

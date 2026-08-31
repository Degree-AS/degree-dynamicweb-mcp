#!/usr/bin/env node
/**
 * stdio entrypoint - the binary a local MCP client or agent framework spawns as a child process.
 *
 * Config comes from the environment because that is the only channel every such host offers.
 * For a hosted HTTP endpoint, add a sibling entrypoint; the server itself is in server.ts and
 * needs no change.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { configFromEnv, createServer, isLoopback, isTokenMissing } from "./server.js";

const config = configFromEnv();

// stdout carries the protocol - diagnostics must go to stderr.
if (isTokenMissing(config)) {
  process.stderr.write(
    "[degree-dynamicweb-mcp] Warning: DW_API_TOKEN not set. Set it in the env block of your MCP client config.\n"
  );
}

// A local DW dev site serves a self-signed certificate. Acceptable for a child process the user
// started themselves; a hosted entrypoint must not do this.
if (isLoopback(config.baseUrl)) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  process.stderr.write(
    "[degree-dynamicweb-mcp] TLS verification disabled for localhost.\n"
  );
}

const server = createServer(config);
await server.connect(new StdioServerTransport());

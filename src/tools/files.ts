import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DwClient, unwrapList, unwrapModel } from "../client.js";

/** Read a property from a DW object, trying camelCase first then PascalCase */
function prop(obj: Record<string, unknown>, name: string): unknown {
  const camel = name.charAt(0).toLowerCase() + name.slice(1);
  return obj[camel] ?? obj[name];
}

export function registerFileTools(server: McpServer, client: DwClient): void {

  server.registerTool(
    "dw_files_list",
    {
      description: "List files in a DynamicWeb directory. Optionally filter by file extensions.",
      inputSchema: {
        directoryPath: z.string().default("/Files").describe("Directory path, e.g. '/Files/Images', '/Files/Uploads'"),
        extensions: z.string().optional().describe("Comma-separated extensions to filter client-side, e.g. 'png,jpg,webp,svg'"),
      },
    },
    async ({ directoryPath, extensions }) => {
      const res = await client.get("FilesByDirectory", { DirectoryPath: directoryPath });
      let items = unwrapList<Record<string, unknown>>(res);

      // Filter by extensions client-side (DW API filter format is unreliable)
      if (extensions) {
        const extSet = new Set(extensions.split(",").map(e => `.${e.trim().toLowerCase()}`));
        items = items.filter(f => {
          const ext = ((prop(f, "Extension") as string) ?? "").toLowerCase();
          return extSet.has(ext);
        });
      }

      const summary = items.map(f => ({
        name: prop(f, "Name"),
        extension: prop(f, "Extension"),
        filePath: prop(f, "FilePath"),
        dimensions: prop(f, "Dimensions"),
        sizeInBytes: prop(f, "SizeInBytes"),
      }));
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    }
  );

  server.registerTool(
    "dw_files_directories",
    {
      description: "List subdirectories in a DynamicWeb directory.",
      inputSchema: {
        directoryPath: z.string().default("/Files").describe("Directory path, e.g. '/Files/Images'"),
      },
    },
    async ({ directoryPath }) => {
      const res = await client.get("DirectoryAll", {
        DirectoryPath: directoryPath,
        Recursive: "false",
      });
      // DirectoryAll returns { model: { directories: [...] } } — not model.data
      const model = unwrapModel<Record<string, unknown>>(res);
      const dirs = ((model.directories ?? model.Directories ?? []) as Array<Record<string, unknown>>);
      const summary = dirs.map(d => ({
        name: prop(d, "Name"),
        directoryPath: prop(d, "DirectoryPath"),
      }));
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    }
  );
}

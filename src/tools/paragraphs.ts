import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DwClient, unwrapList, unwrapModel, checkStatus } from "../client.js";
import { jsonParam } from "../utils.js";

export function registerParagraphTools(server: McpServer, client: DwClient): void {

  server.registerTool(
    "dw_paragraph_list",
    {
      description: "List paragraphs on a DynamicWeb page.",
      inputSchema: {
        pageId: z.string().describe("Page ID to list paragraphs for"),
      },
    },
    async ({ pageId }) => {
      const res = await client.get("ParagraphAll", { PageId: pageId });
      const items = unwrapList<Record<string, unknown>>(res);
      const summary = items.map(p => ({
        id: p.id,
        pageId: p.pageId,
        sortOrder: p.sortOrder,
        itemTypeSystemName: p.itemTypeSystemName,
        columnId: p.columnId,
        gridRowId: p.gridRowId,
      }));
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    }
  );

  server.registerTool(
    "dw_paragraph_get",
    {
      description: "Get a single DynamicWeb paragraph by ID, including all item fields.",
      inputSchema: {
        paragraphId: z.string().describe("Paragraph ID"),
      },
    },
    async ({ paragraphId }) => {
      const res = await client.get("ParagraphById", { Id: paragraphId });
      const model = unwrapModel<Record<string, unknown>>(res);
      return { content: [{ type: "text", text: JSON.stringify(model, null, 2) }] };
    }
  );

  server.registerTool(
    "dw_paragraph_create",
    {
      description: `Create a new paragraph block on a DynamicWeb page.

    The paragraph itemType must already exist and be allowed on the page's item type.
    Use dw_paragraph_set_fields after creation to populate content fields.

    sortOrder: paragraphs are ordered ascending. Use 100, 200, 300... for easy re-ordering.`,
      inputSchema: {
        pageId: z.string().describe("Page ID to add the paragraph to"),
        itemTypeSystemName: z.string().describe("Paragraph item type systemName, e.g. 'HeroBanner'"),
        sortOrder: z.number().optional().default(100),
        active: z.boolean().optional().default(true),
      },
    },
    async ({ pageId, itemTypeSystemName, sortOrder, active }) => {
      const res = await client.post("ParagraphSave", {
        PageId: pageId,
        ItemTypeSystemName: itemTypeSystemName,
        SortOrder: sortOrder,
        Active: active,
      });

      const status = checkStatus(res);
      if (!status.ok) throw new Error(`Failed to create paragraph: ${status.message}`);

      const created = unwrapModel<Record<string, unknown>>(res);
      return { content: [{ type: "text", text: `✓ Created paragraph '${itemTypeSystemName}' on page ${pageId} (ID: ${created.id ?? "unknown"})\n${JSON.stringify(created, null, 2)}` }] };
    }
  );

  server.registerTool(
    "dw_paragraph_set_fields",
    {
      description: `Set item fields on a DynamicWeb paragraph.

    fields is a key-value map where keys are field SystemNames and values are the content.
    For richtext fields, provide HTML string.
    For link fields use { url: "...", pageId: "..." }.
    For file/image fields use the file path string (e.g. "/Files/Images/hero.jpg").`,
      inputSchema: {
        paragraphId: z.string().describe("Paragraph ID"),
        fields: jsonParam(z.record(z.unknown())).describe("Map of fieldSystemName -> value"),
      },
    },
    async ({ paragraphId, fields }) => {
      const model: Record<string, unknown> = {
        Id: paragraphId,
        ...fields,
      };

      const res = await client.update(
        "ParagraphSave",
        "ParagraphById",
        { Id: paragraphId },
        model
      );
      const status = checkStatus(res);
      if (!status.ok) throw new Error(`Failed to update paragraph fields: ${status.message}`);
      return { content: [{ type: "text", text: `✓ Fields updated on paragraph ${paragraphId}` }] };
    }
  );

  server.registerTool(
    "dw_paragraph_delete",
    {
      description: "Delete a DynamicWeb paragraph by ID.",
      inputSchema: { paragraphId: z.string() },
    },
    async ({ paragraphId }) => {
      const res = await client.command("ParagraphDelete", { Id: paragraphId });
      const status = checkStatus(res);
      if (!status.ok) throw new Error(status.message);
      return { content: [{ type: "text", text: `✓ Deleted paragraph ${paragraphId}` }] };
    }
  );
}

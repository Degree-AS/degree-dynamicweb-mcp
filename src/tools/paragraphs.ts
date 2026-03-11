import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DwClient, unwrapList, unwrapModel, checkStatus, setItemFieldValues } from "../client.js";
import { jsonParam } from "../utils.js";

/** Read a property from a DW object, trying camelCase first then PascalCase */
function prop(obj: Record<string, unknown>, name: string): unknown {
  const camel = name.charAt(0).toLowerCase() + name.slice(1);
  return obj[camel] ?? obj[name];
}

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
      const res = await client.get("GetParagraphsByPageId", { PageId: pageId });
      const items = unwrapList<Record<string, unknown>>(res);
      const summary = items.map(p => ({
        id: prop(p, "ID"),
        pageId: prop(p, "PageID"),
        sort: prop(p, "Sort"),
        itemType: prop(p, "ItemType"),
        name: prop(p, "Name"),
        showParagraph: prop(p, "ShowParagraph"),
        gridRowId: prop(p, "GridRowId"),
        gridRowColumn: prop(p, "GridRowColumn"),
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
      const res = await client.get("GetParagraphById", { Id: paragraphId });
      const model = unwrapModel<Record<string, unknown>>(res);
      return { content: [{ type: "text", text: JSON.stringify(model, null, 2) }] };
    }
  );

  server.registerTool(
    "dw_paragraph_create",
    {
      description: `Create a new paragraph on a DynamicWeb page.

    Creates the paragraph via ParagraphSave with the specified item type.
    Use dw_paragraph_set_fields after creation to populate content fields.

    sort: paragraphs are ordered ascending. Use 100, 200, 300... for easy re-ordering.`,
      inputSchema: {
        pageId: z.string().describe("Page ID to add the paragraph to"),
        itemType: z.string().describe("Paragraph item type systemName, e.g. 'HeroBanner'"),
        sort: z.number().optional().default(100),
        active: z.boolean().optional().default(true),
      },
    },
    async ({ pageId, itemType, sort, active }) => {
      // Step 1: Get template model from ParagraphNew (has proper dates, contentItem structure)
      const templateRes = await client.get<Record<string, unknown>>("ParagraphNew", {
        PageId: pageId,
        ParagraphType: itemType,
      });
      const model = unwrapModel<Record<string, unknown>>(templateRes);

      // Step 2: Set sort and visibility
      model.sort = sort;
      model.showParagraph = active;

      // Step 3: Save to create the paragraph
      const res = await client.post<Record<string, unknown>>("ParagraphSave", model);
      const status = checkStatus(res);
      if (!status.ok) throw new Error(`Failed to create paragraph: ${status.message}`);

      const newId = prop(res, "ModelIdentifier") as string | undefined;
      return { content: [{ type: "text", text: `Created paragraph '${itemType}' on page ${pageId} (ID: ${newId ?? "unknown"})` }] };
    }
  );

  server.registerTool(
    "dw_paragraph_set_fields",
    {
      description: `Set item fields on a DynamicWeb paragraph.

    Fetches the current paragraph, updates field values in its contentItem structure, then saves.
    fields is a key-value map where keys are field SystemNames and values are the content.
    For richtext fields, provide HTML string.
    For file/image fields use the file path string (e.g. "/Files/Images/hero.jpg").`,
      inputSchema: {
        paragraphId: z.string().describe("Paragraph ID"),
        fields: jsonParam(z.record(z.unknown())).describe("Map of fieldSystemName -> value"),
      },
    },
    async ({ paragraphId, fields }) => {
      // Fetch current paragraph
      const getRes = await client.get<Record<string, unknown>>("GetParagraphById", { Id: paragraphId });
      const model = unwrapModel<Record<string, unknown>>(getRes);

      // Update field values in contentItem (camelCase from DW API)
      const contentItem = (model.contentItem ?? model.ContentItem) as Record<string, unknown> | undefined;
      setItemFieldValues(contentItem, fields);

      // Save
      const saveRes = await client.post<Record<string, unknown>>("ParagraphSave", model);
      const status = checkStatus(saveRes);
      if (!status.ok) throw new Error(`Failed to update paragraph fields: ${status.message}`);
      return { content: [{ type: "text", text: `Fields updated on paragraph ${paragraphId}` }] };
    }
  );

  server.registerTool(
    "dw_paragraph_delete",
    {
      description: "Delete a DynamicWeb paragraph by ID.",
      inputSchema: { paragraphId: z.string() },
    },
    async ({ paragraphId }) => {
      const res = await client.command("ParagraphDelete", { Id: Number(paragraphId) });
      const status = checkStatus(res);
      if (!status.ok) throw new Error(status.message);
      return { content: [{ type: "text", text: `Deleted paragraph ${paragraphId}` }] };
    }
  );
}

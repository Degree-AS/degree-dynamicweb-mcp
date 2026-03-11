import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DwClient, unwrapList, unwrapModel, checkStatus } from "../client.js";
import { jsonParam } from "../utils.js";

export function registerPageTools(server: McpServer, client: DwClient): void {

  server.registerTool(
    "dw_page_list",
    {
      description: "List DynamicWeb pages. Optionally filter by areaId (website ID) or parentPageId.",
      inputSchema: {
        areaId: z.string().optional().describe("Area (website) ID to filter by"),
        parentPageId: z.string().optional().describe("Parent page ID to get child pages"),
      },
    },
    async ({ areaId, parentPageId }) => {
      const params: Record<string, string> = {};
      if (areaId) params.AreaId = areaId;
      if (parentPageId) params.ParentPageId = parentPageId;

      const res = await client.get("PageAll", Object.keys(params).length ? params : undefined);
      const items = unwrapList<Record<string, unknown>>(res);
      const summary = items.map(p => ({
        id: p.id,
        parentId: p.parentId,
        name: p.name,
        navigationName: p.navigationName,
        url: p.url,
        areaId: p.areaId,
        itemTypeSystemName: p.itemTypeSystemName,
        published: p.published,
        childCount: p.childCount,
      }));
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    }
  );

  server.registerTool(
    "dw_page_get",
    {
      description: "Get a single DynamicWeb page by ID, including all item fields.",
      inputSchema: {
        pageId: z.string().describe("Page ID (numeric string)"),
      },
    },
    async ({ pageId }) => {
      const res = await client.get("PageById", { Id: pageId });
      const model = unwrapModel<Record<string, unknown>>(res);
      return { content: [{ type: "text", text: JSON.stringify(model, null, 2) }] };
    }
  );

  server.registerTool(
    "dw_page_create",
    {
      description: `Create a new DynamicWeb page under a parent page.

    The page itemType must already exist in DW. Use dw_itemtype_list to find available page item types.
    After creating, use dw_page_set_fields to populate item fields.`,
      inputSchema: {
        parentPageId: z.string().describe("Parent page ID"),
        name: z.string().describe("Internal page name (shown in tree)"),
        navigationName: z.string().optional().describe("Name shown in navigation menus"),
        title: z.string().optional().describe("SEO title / browser tab title"),
        itemTypeSystemName: z.string().optional().describe("Page item type systemName, e.g. 'LandingPage'"),
        published: z.boolean().optional().default(true),
        showInMenu: z.boolean().optional().default(true),
      },
    },
    async ({ parentPageId, name, navigationName, title, itemTypeSystemName, published, showInMenu }) => {
      const model: Record<string, unknown> = {
        ParentPageId: parentPageId,
        Name: name,
        NavigationName: navigationName ?? name,
        Title: title ?? name,
        Published: published,
        ShowInMenu: showInMenu,
      };
      if (itemTypeSystemName) model.ItemTypeSystemName = itemTypeSystemName;

      const res = await client.post("PageSave", model);
      const status = checkStatus(res);
      if (!status.ok) throw new Error(`Failed to create page: ${status.message}`);

      const created = unwrapModel<Record<string, unknown>>(res);
      return { content: [{ type: "text", text: `✓ Created page '${name}' (ID: ${created.id ?? "unknown"})\n${JSON.stringify(created, null, 2)}` }] };
    }
  );

  server.registerTool(
    "dw_page_set_fields",
    {
      description: `Set item fields on a DynamicWeb page. Call after creating a page to populate its content.

    fields is a key-value map where keys are field SystemNames and values are the content.
    For link fields use { url: "...", pageId: "..." }.
    For file/image fields use the file path string.`,
      inputSchema: {
        pageId: z.string().describe("Page ID"),
        fields: jsonParam(z.record(z.unknown())).describe("Map of fieldSystemName -> value"),
      },
    },
    async ({ pageId, fields }) => {
      const model: Record<string, unknown> = {
        Id: pageId,
        ...fields,
      };

      const res = await client.update(
        "PageSave",
        "PageById",
        { Id: pageId },
        model
      );
      const status = checkStatus(res);
      if (!status.ok) throw new Error(`Failed to update page fields: ${status.message}`);
      return { content: [{ type: "text", text: `✓ Fields updated on page ${pageId}` }] };
    }
  );

  server.registerTool(
    "dw_page_delete",
    {
      description: "Delete a DynamicWeb page by ID. This is irreversible.",
      inputSchema: { pageId: z.string() },
    },
    async ({ pageId }) => {
      const res = await client.command("PageDelete", { Id: pageId });
      const status = checkStatus(res);
      if (!status.ok) throw new Error(status.message);
      return { content: [{ type: "text", text: `✓ Deleted page ${pageId}` }] };
    }
  );

  server.registerTool(
    "dw_area_list",
    {
      description: "List all DynamicWeb areas (websites/channels).",
    },
    async () => {
      const res = await client.get("AreaAll");
      const items = unwrapList<Record<string, unknown>>(res);
      const summary = items.map(a => ({
        id: a.id,
        name: a.name,
        domainLock: a.domainLock,
        culture: a.culture,
        defaultLanguage: a.defaultLanguage,
        rootPageId: a.rootPageId,
      }));
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    }
  );
}

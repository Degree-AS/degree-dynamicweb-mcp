import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DwClient, unwrapList, unwrapModel, checkStatus, setItemFieldValues } from "../client.js";
import { jsonParam, prop } from "../utils.js";

export function registerPageTools(server: McpServer, client: DwClient): void {

  server.registerTool(
    "dw_page_list",
    {
      description: "List DynamicWeb pages. Filter by areaId (website ID) or parentPageId.",
      inputSchema: {
        areaId: z.string().optional().describe("Area (website) ID to filter by"),
        parentPageId: z.string().optional().describe("Parent page ID to get child pages"),
      },
    },
    async ({ areaId, parentPageId }) => {
      let res: unknown;
      if (parentPageId) {
        res = await client.get("GetPagesByParent", { ParentID: parentPageId });
      } else {
        res = await client.get("GetPagesByAreaId", areaId ? { AreaId: areaId } : {});
      }
      const items = unwrapList<Record<string, unknown>>(res);
      const summary = items.map(p => ({
        id: prop(p, "Id"),
        parentPageId: prop(p, "ParentPageId"),
        name: prop(p, "Name"),
        metaTitle: prop(p, "MetaTitle"),
        friendlyUrl: prop(p, "FriendlyUrl"),
        areaId: prop(p, "AreaId"),
        itemType: prop(p, "ItemType"),
        published: prop(p, "Published"),
        treeSection: prop(p, "TreeSection"),
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
      const res = await client.get("GetPageById", { Id: pageId });
      const model = unwrapModel<Record<string, unknown>>(res);
      return { content: [{ type: "text", text: JSON.stringify(model, null, 2) }] };
    }
  );

  server.registerTool(
    "dw_page_create",
    {
      description: `Create a new DynamicWeb page under a parent page.

    Steps: 1) Creates blank page via PageCreate 2) Sets name, item type, publication via PageSave.
    After creating, use dw_page_set_fields to populate item fields.`,
      inputSchema: {
        parentPageId: z.string().describe("Parent page ID"),
        areaId: z.string().optional().describe("Area ID (auto-detected from parent if omitted)"),
        name: z.string().describe("Internal page name (shown in tree)"),
        itemType: z.string().describe("Page item type systemName, e.g. 'CaseStudyPage', 'ArticlePage'. Use dw_itemtype_list to find available types."),
        published: z.boolean().optional().default(true),
        showInMenu: z.boolean().optional().default(true),
        treeSection: z.string().optional().default("Navigation").describe("Tree section: Navigation, Header, or Footer"),
      },
    },
    async ({ parentPageId, areaId, name, itemType, published, showInMenu, treeSection }) => {
      // Step 1: Resolve AreaId if not provided
      let resolvedAreaId = areaId;
      if (!resolvedAreaId) {
        const parentRes = await client.get<Record<string, unknown>>("GetPageById", { Id: parentPageId });
        const parent = unwrapModel<Record<string, unknown>>(parentRes);
        resolvedAreaId = String(prop(parent, "AreaId") ?? "1");
      }

      // Step 2: Create page with item type (command = flat body)
      const createRes = await client.command<Record<string, unknown>>("PageCreate", {
        AreaId: Number(resolvedAreaId),
        ParentId: Number(parentPageId),
        TreeSection: treeSection,
        PageType: itemType,
      });

      const createStatus = checkStatus(createRes);
      if (!createStatus.ok) throw new Error(`PageCreate failed: ${createStatus.message}`);

      const newPageId = (prop(createRes, "ModelIdentifier")) as string;
      if (!newPageId) throw new Error("PageCreate did not return ModelIdentifier");

      // Step 3: Fetch the new page to get its full model
      const getRes = await client.get<Record<string, unknown>>("GetPageById", { Id: newPageId });
      const pageModel = unwrapModel<Record<string, unknown>>(getRes);

      // Step 4: Set properties (use camelCase matching DW response)
      pageModel.name = name;
      pageModel.published = published;
      pageModel.showInLegend = showInMenu;
      pageModel.allowclick = true;
      pageModel.allowsearch = true;
      pageModel.showInSitemap = true;
      pageModel.itemType = itemType;

      const saveRes = await client.post<Record<string, unknown>>("PageSave", pageModel);
      const saveStatus = checkStatus(saveRes);
      if (!saveStatus.ok) throw new Error(`PageSave failed: ${saveStatus.message}`);

      return {
        content: [{
          type: "text",
          text: `Created page '${name}' (ID: ${newPageId}) under parent ${parentPageId}\n${JSON.stringify({ id: newPageId, name, itemType, published, treeSection }, null, 2)}`,
        }],
      };
    }
  );

  server.registerTool(
    "dw_page_set_fields",
    {
      description: `Set item fields on a DynamicWeb page.

    Fetches the current page, updates field values in its pageItem structure, then saves.
    fields is a key-value map where keys are field SystemNames and values are the content.`,
      inputSchema: {
        pageId: z.string().describe("Page ID"),
        fields: jsonParam(z.record(z.unknown())).describe("Map of fieldSystemName -> value"),
      },
    },
    async ({ pageId, fields }) => {
      // Fetch current page
      const getRes = await client.get<Record<string, unknown>>("GetPageById", { Id: pageId });
      const pageModel = unwrapModel<Record<string, unknown>>(getRes);

      // Update field values in pageItem (camelCase from DW API)
      const pageItem = (pageModel.pageItem ?? pageModel.PageItem) as Record<string, unknown> | undefined;
      setItemFieldValues(pageItem, fields);

      // Save
      const saveRes = await client.post<Record<string, unknown>>("PageSave", pageModel);
      const status = checkStatus(saveRes);
      if (!status.ok) throw new Error(`Failed to update page fields: ${status.message}`);
      return { content: [{ type: "text", text: `Fields updated on page ${pageId}` }] };
    }
  );

  server.registerTool(
    "dw_page_delete",
    {
      description: "Delete a DynamicWeb page by ID. This is irreversible.",
      inputSchema: { pageId: z.string() },
    },
    async ({ pageId }) => {
      const res = await client.command("PageDelete", { Id: Number(pageId) });
      const status = checkStatus(res);
      if (!status.ok) throw new Error(status.message);
      return { content: [{ type: "text", text: `Deleted page ${pageId}` }] };
    }
  );

  server.registerTool(
    "dw_area_list",
    {
      description: "List all DynamicWeb areas (websites/channels).",
    },
    async () => {
      const res = await client.get("GetAreas");
      const items = unwrapList<Record<string, unknown>>(res);
      const summary = items.map(a => ({
        id: prop(a, "Id"),
        name: prop(a, "Name"),
        displayName: prop(a, "DisplayName"),
        domainLock: prop(a, "DomainLock"),
        culture: prop(a, "Culture"),
        cultureCode: prop(a, "CultureCode"),
        active: prop(a, "Active"),
        pageCount: prop(a, "PageCount"),
      }));
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    }
  );
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DwClient } from "../client.js";

export function registerDeliveryTools(server: McpServer, client: DwClient): void {

  server.registerTool(
    "dw_content_areas",
    {
      description: "Fetch all areas (websites) from DynamicWeb Delivery API. No auth required.",
    },
    async () => {
      const data = await client.delivery("areas");
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.registerTool(
    "dw_content_pages",
    {
      description: `Fetch pages from DynamicWeb Delivery API.
    Returns pages with their item fields (content).
    Use pageId to get a specific page, or areaId to list all pages in a website.`,
      inputSchema: {
        pageId: z.string().optional().describe("Specific page ID"),
        areaId: z.string().optional().describe("Area/website ID"),
        url: z.string().optional().describe("Resolve page by URL path, e.g. '/om-oss'"),
        pageSize: z.number().optional().default(50),
        page: z.number().optional().default(1),
      },
    },
    async ({ pageId, areaId, url, pageSize, page }) => {
      const params: Record<string, string> = {
        PageSize: String(pageSize),
        Page: String(page),
      };
      if (areaId) params.AreaId = areaId;
      if (url) params.Url = url;

      const resource = pageId ? `pages/${pageId}` : "pages";
      const data = await client.delivery(resource, pageId ? undefined : params);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.registerTool(
    "dw_content_paragraphs",
    {
      description: `Fetch paragraphs (content blocks) from DynamicWeb Delivery API.
    Returns paragraphs with their item fields.
    Use pageId to get all paragraphs for a specific page.`,
      inputSchema: {
        pageId: z.string().describe("Page ID to fetch paragraphs for"),
        itemTypeSystemName: z.string().optional().describe("Filter by item type systemName"),
      },
    },
    async ({ pageId, itemTypeSystemName }) => {
      const params: Record<string, string> = { PageId: pageId };
      if (itemTypeSystemName) params.ItemType = itemTypeSystemName;

      const data = await client.delivery("paragraphs", params);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DwClient, unwrapModel, checkStatus, setItemFieldValues } from "../client.js";
import { jsonParam, numParam, pascal, prop } from "../utils.js";

// Top-level product fields the ProductSave command accepts (PascalCase).
// Mirrors the body that the DW admin UI sends when saving a product edit.
const SAVE_FIELDS = [
  "Name", "Number", "ManufacturerId", "EAN", "Active", "WorkflowStateId",
  "ShortDescription", "LongDescription",
  "DefaultPrice", "Cost", "DefaultPoints",
  "Volume", "Weight", "Width", "Height", "Depth",
  "Stock", "NeverOutOfStock", "DefaultUnitId", "StockGroupId",
  "ExpectedDeliveryDate", "PurchaseMinimumQuantity", "PurchaseQuantityStep",
  "Type", "ShowInProductList", "Discontinued",
  "MetaTitle", "MetaKeywords", "MetaDescription", "MetaUrl", "MetaCanonical",
] as const;

/** Build a ProductSave body from a fetched product model, overlaying updates.
 *  CustomFields/CategoryFields are passed through as-is so caller can mutate Field.Value via setItemFieldValues. */
function buildSaveModel(
  current: Record<string, unknown>,
  updates: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of SAVE_FIELDS) {
    const val = prop(current, field);
    out[field] = val ?? "";
  }
  const customFields = prop(current, "CustomFields");
  const categoryFields = prop(current, "CategoryFields");
  if (customFields) out.CustomFields = customFields;
  if (categoryFields) out.CategoryFields = categoryFields;
  for (const [key, value] of Object.entries(updates)) {
    out[pascal(key)] = value;
  }
  return out;
}

async function fetchProduct(
  client: DwClient,
  id: string,
  languageId: string,
  variantId: string,
): Promise<Record<string, unknown>> {
  const res = await client.get<Record<string, unknown>>("ProductById", {
    Id: id, LanguageId: languageId, VariantId: variantId,
  });
  return unwrapModel<Record<string, unknown>>(res);
}

async function saveProduct(
  client: DwClient,
  id: string,
  languageId: string,
  model: Record<string, unknown>,
  runUpdateIndex: boolean,
): Promise<Record<string, unknown>> {
  return client.update<Record<string, unknown>>(
    "ProductSave",
    "ProductById",
    { Id: id, LanguageId: languageId, QueryContext: { screenTypeName: "ProductEdit" } },
    model,
    { RunUpdateIndex: runUpdateIndex },
  );
}

export function registerProductTools(server: McpServer, client: DwClient): void {

  server.registerTool(
    "dw_product_list",
    {
      description: `List DynamicWeb products. Filter by groupId (product catalog group) or search term.
Returns id, number, name, defaultPrice, stock, active. Use pagingSize to control result count.`,
      inputSchema: {
        groupId: z.string().optional().describe("Group ID, e.g. 'GROUP1'. Omit for all products."),
        languageId: z.string().optional().default("LANG1"),
        search: z.string().optional().describe("Search term"),
        pagingSize: numParam(z.number().optional().default(100)),
        pagingIndex: numParam(z.number().optional().default(1)),
      },
    },
    async ({ groupId, languageId, search, pagingSize, pagingIndex }) => {
      const params: Record<string, string> = {
        LanguageId: languageId ?? "LANG1",
        PagingSize: String(pagingSize),
        PagingIndex: String(pagingIndex),
      };
      if (search) params.Search = search;
      if (groupId) params.GroupId = groupId;
      const endpoint = groupId ? "ProductsByGroupId" : "ProductsAll";
      const res = await client.get<Record<string, unknown>>(endpoint, params);
      const model = unwrapModel<Record<string, unknown>>(res);
      const data = (prop(model, "Data") ?? []) as Array<Record<string, unknown>>;
      const summary = data.map(p => ({
        id: prop(p, "Id"),
        number: prop(p, "Number"),
        name: prop(p, "Name"),
        groupId: prop(p, "GroupId") || prop(p, "DefaultGroupId"),
        active: prop(p, "Active"),
        defaultPrice: prop(p, "DefaultPrice"),
        stock: prop(p, "Stock"),
      }));
      return {
        content: [{ type: "text", text: JSON.stringify({
          totalCount: prop(model, "TotalCount"),
          totalPages: prop(model, "TotalPages"),
          products: summary,
        }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "dw_product_get",
    {
      description: "Get a single DynamicWeb product by ID. Returns the full model including CustomFields.",
      inputSchema: {
        id: z.string().describe("Product ID, e.g. 'PROD1'"),
        languageId: z.string().optional().default("LANG1"),
        variantId: z.string().optional().default(""),
      },
    },
    async ({ id, languageId, variantId }) => {
      const model = await fetchProduct(client, id, languageId ?? "LANG1", variantId ?? "");
      return { content: [{ type: "text", text: JSON.stringify(model, null, 2) }] };
    }
  );

  server.registerTool(
    "dw_product_update",
    {
      description: `Update fields on an existing DynamicWeb product.
Fetches the current product, overlays your field updates, and saves via ProductSave (update mode, Query.Type=ProductById).

- 'fields': top-level product fields (Name, DefaultPrice, Stock, Active, etc.) - PascalCase or camelCase.
- 'customFields': global product custom fields, keyed by SystemName (e.g. {Color: "red"}).
- 'categoryFields': product category fields, keyed by SystemName.

Manage the schema of customFields/categoryFields via dw_product_field_save / dw_product_category_save.`,
      inputSchema: {
        id: z.string().describe("Product ID, e.g. 'PROD1'"),
        languageId: z.string().optional().default("LANG1"),
        variantId: z.string().optional().default(""),
        fields: jsonParam(z.record(z.unknown()).optional().default({})).describe("Top-level fields, e.g. {DefaultPrice: 99.99, Stock: 42}"),
        customFields: jsonParam(z.record(z.unknown()).optional().default({})).describe("Custom field values keyed by SystemName, e.g. {Color: 'red', BatteryLife: 8}"),
        categoryFields: jsonParam(z.record(z.unknown()).optional().default({})).describe("Category field values keyed by SystemName"),
        runUpdateIndex: z.boolean().optional().default(true),
      },
    },
    async ({ id, languageId, variantId, fields, customFields, categoryFields, runUpdateIndex }) => {
      const current = await fetchProduct(client, id, languageId ?? "LANG1", variantId ?? "");
      const saveModel = buildSaveModel(current, fields);
      if (Object.keys(customFields).length > 0) {
        setItemFieldValues(saveModel.CustomFields as Record<string, unknown>, customFields);
      }
      if (Object.keys(categoryFields).length > 0) {
        setItemFieldValues(saveModel.CategoryFields as Record<string, unknown>, categoryFields);
      }
      const res = await saveProduct(client, id, languageId ?? "LANG1", saveModel, runUpdateIndex);
      const status = checkStatus(res);
      if (!status.ok) throw new Error(`ProductSave failed: ${status.message}`);
      const saved = unwrapModel<Record<string, unknown>>(res);
      return {
        content: [{ type: "text", text: JSON.stringify({
          id: prop(saved, "Id"),
          name: prop(saved, "Name"),
          number: prop(saved, "Number"),
          defaultPrice: prop(saved, "DefaultPrice"),
          stock: prop(saved, "Stock"),
          active: prop(saved, "Active"),
        }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "dw_product_delete",
    {
      description: `Delete one or more DynamicWeb products. Irreversible.
IDs must be in modelIdentifier format: 'PROD1|LANG1|'. The tool accepts plain IDs too and auto-formats them.`,
      inputSchema: {
        ids: jsonParam(z.array(z.string())).describe("Product IDs, e.g. ['PROD12','PROD13']"),
        languageId: z.string().optional().default("LANG1"),
      },
    },
    async ({ ids, languageId }) => {
      const lang = languageId ?? "LANG1";
      const modelIdentifiers = ids.map(id => id.includes("|") ? id : `${id}|${lang}|`);
      const res = await client.command<Record<string, unknown>>(
        "ProductDelete",
        {
          Ids: modelIdentifiers,
          QueryData: { QueryContext: { screenTypeName: "ProductList" } },
        },
        { "Query.Type": "ProductsAll" },
      );
      const status = checkStatus(res);
      if (!status.ok) throw new Error(`ProductDelete failed: ${status.message}`);
      return { content: [{ type: "text", text: `Deleted ${modelIdentifiers.length} product(s): ${modelIdentifiers.join(", ")}` }] };
    }
  );

  server.registerTool(
    "dw_product_bulk_discount",
    {
      description: `Apply a percentage discount to DefaultPrice across a set of products (modifies the base price in-place).
Target either a groupId (all products in the group) or an explicit productIds array. Returns per-product old/new price.`,
      inputSchema: {
        groupId: z.string().optional().describe("Apply to all products in this group"),
        productIds: jsonParam(z.array(z.string()).optional()).describe("Explicit product IDs"),
        percent: numParam(z.number()).describe("Discount percentage, e.g. 15 for 15% off"),
        languageId: z.string().optional().default("LANG1"),
        decimals: numParam(z.number().optional().default(2)).describe("Round new price to N decimals"),
        pagingSize: numParam(z.number().optional().default(500)).describe("Max products fetched when using groupId"),
      },
    },
    async ({ groupId, productIds, percent, languageId, decimals, pagingSize }) => {
      const lang = languageId ?? "LANG1";
      let ids: string[];
      if (productIds && productIds.length > 0) {
        ids = productIds;
      } else if (groupId) {
        const listRes = await client.get<Record<string, unknown>>("ProductsByGroupId", {
          GroupId: groupId, LanguageId: lang, PagingSize: String(pagingSize), PagingIndex: "1",
        });
        const listModel = unwrapModel<Record<string, unknown>>(listRes);
        const data = (prop(listModel, "Data") ?? []) as Array<Record<string, unknown>>;
        ids = data.map(p => String(prop(p, "Id")));
      } else {
        throw new Error("Provide either groupId or productIds");
      }

      const factor = (100 - percent) / 100;
      const round = (n: number) => Number(n.toFixed(decimals));
      const results: Array<Record<string, unknown>> = [];
      for (const id of ids) {
        try {
          const current = await fetchProduct(client, id, lang, "");
          const oldPrice = Number(prop(current, "DefaultPrice") ?? 0);
          const newPrice = round(oldPrice * factor);
          const saveModel = buildSaveModel(current, { DefaultPrice: newPrice });
          const saveRes = await saveProduct(client, id, lang, saveModel, true);
          const status = checkStatus(saveRes);
          results.push({ id, oldPrice, newPrice, ok: status.ok, message: status.message || undefined });
        } catch (e) {
          results.push({ id, ok: false, error: (e as Error).message });
        }
      }
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }
  );
}

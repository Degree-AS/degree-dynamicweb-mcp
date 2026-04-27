import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DwClient, unwrapList, unwrapModel, checkStatus } from "../client.js";
import { jsonParam, numParam, prop } from "../utils.js";

// Maps short aliases → DW Product Field TypeId (int).
// Source: GET /admin/api/FieldTypeAll?SystemTypes=true
const FIELD_TYPE_ALIASES: Record<string, number> = {
  text: 1,           // Text (255)
  text255: 1,
  longtext: 2,       // LargeText
  checkbox: 3,
  date: 4,
  datetime: 5,
  number: 6,         // Integer
  integer: 6,
  decimal: 7,        // Double
  link: 8,
  file: 9,           // Filemanager
  text100: 10,
  text50: 11,
  text20: 12,
  text5: 13,
  richtext: 14,      // EditorText
  editor: 14,
  list: 15,
  dropdown: 15,
};

function resolveTypeId(type: string | number): number {
  if (typeof type === "number") return type;
  const n = Number(type);
  if (!Number.isNaN(n) && type.trim() !== "") return n;
  const id = FIELD_TYPE_ALIASES[type.toLowerCase()];
  if (id === undefined) {
    throw new Error(
      `Unknown field type alias '${type}'. Use dw_product_field_type_list to see available types, or pass a numeric TypeId.`
    );
  }
  return id;
}

export function registerProductSchemaTools(server: McpServer, client: DwClient): void {

  server.registerTool(
    "dw_product_field_type_list",
    {
      description: `List all DynamicWeb product field types (Text, Integer, Date, etc.) with their TypeId.
Use the returned 'id' as TypeId in dw_product_field_save, or use a short alias (text, longtext, checkbox, date, datetime, number, decimal, link, file, richtext, dropdown).`,
    },
    async () => {
      const res = await client.get<Record<string, unknown>>("FieldTypeAll", {
        SystemTypes: "true",
        PagingSize: "100",
      });
      const model = unwrapModel<Record<string, unknown>>(res);
      const data = (prop(model, "Data") ?? []) as Array<Record<string, unknown>>;
      const types = data.map(t => ({
        id: prop(t, "Id"),
        name: prop(t, "Name"),
        systemName: prop(t, "SystemName"),
        aliases: Object.entries(FIELD_TYPE_ALIASES)
          .filter(([, v]) => v === prop(t, "Id"))
          .map(([k]) => k),
      }));
      return { content: [{ type: "text", text: JSON.stringify(types, null, 2) }] };
    }
  );

  server.registerTool(
    "dw_product_category_list",
    {
      description: `List DynamicWeb product categories (groups of product attribute fields).
Returns id, name, fieldsCount per category.`,
      inputSchema: {
        search: z.string().optional().describe("Search term"),
        pagingSize: numParam(z.number().optional().default(100)),
        pagingIndex: numParam(z.number().optional().default(1)),
      },
    },
    async ({ search, pagingSize, pagingIndex }) => {
      const params: Record<string, string> = {
        PagingSize: String(pagingSize),
        PagingIndex: String(pagingIndex),
      };
      if (search) params.Search = search;
      const res = await client.get<Record<string, unknown>>("ProductCategoriesAll", params);
      const model = unwrapModel<Record<string, unknown>>(res);
      const data = (prop(model, "Data") ?? []) as Array<Record<string, unknown>>;
      const summary = data.map(c => ({
        id: prop(c, "Id"),
        name: prop(c, "Name"),
        categoryType: prop(c, "CategoryType"),
        fieldsCount: prop(c, "FieldsCount"),
      }));
      return {
        content: [{ type: "text", text: JSON.stringify({
          totalCount: prop(model, "TotalCount"),
          categories: summary,
        }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "dw_product_category_save",
    {
      description: `Create or update a DynamicWeb product category (group of attribute fields).
Set isNew: true to create, false to update an existing one.
Category fields are added separately via dw_product_field_save with this category's id.`,
      inputSchema: {
        id: z.string().describe("PascalCase identifier, e.g. 'TechSpecs'. Used as CategoryId on fields."),
        name: z.string().describe("Human-readable name shown in DW Admin"),
        categoryType: z.string().optional().default("categoryFields")
          .describe("'categoryFields' (default) for product category fields"),
        isNew: z.boolean().optional().default(true),
      },
    },
    async ({ id, name, categoryType, isNew }) => {
      const res = await client.command<Record<string, unknown>>(
        "ProductCategorySave",
        {
          IsNew: isNew,
          Model: { Id: id, Name: name, CategoryType: categoryType },
        },
      );
      const status = checkStatus(res);
      if (!status.ok) throw new Error(`ProductCategorySave failed: ${status.message}`);
      return { content: [{ type: "text", text: `${isNew ? "Created" : "Updated"} product category '${id}'` }] };
    }
  );

  server.registerTool(
    "dw_product_category_delete",
    {
      description: `Delete one or more DynamicWeb product categories. Irreversible.
Fields belonging to the categories must be deleted first via dw_product_field_delete - otherwise the validation step will reject them.

Internally runs DW's 3-step delete: ProductCategorySetIds (mark candidates) → ProductCategoryDeleteValidated (get valid/invalid split) → ProductCategoryDelete.`,
      inputSchema: {
        ids: jsonParam(z.union([z.string(), z.array(z.string())]))
          .describe("Single category id or array, e.g. 'TechSpecs' or ['TechSpecs','Specs']"),
      },
    },
    async ({ ids }) => {
      const idArray = Array.isArray(ids) ? ids : [ids];
      await client.command<Record<string, unknown>>("ProductCategorySetIds", { Ids: idArray });
      const validatedRes = await client.get<Record<string, unknown>>("ProductCategoryDeleteValidated");
      const validatedModel = unwrapModel<Record<string, unknown>>(validatedRes);
      const validIds = (prop(validatedModel, "ValidIds") ?? []) as string[];
      const invalidIds = (prop(validatedModel, "InvalidIds") ?? []) as string[];
      if (validIds.length === 0) {
        return { content: [{ type: "text", text: `No categories deleted. Invalid: [${invalidIds.join(", ")}] (likely have fields or are referenced elsewhere)` }] };
      }
      const res = await client.command<Record<string, unknown>>(
        "ProductCategoryDelete",
        { Model: { ValidIds: validIds, InvalidIds: invalidIds } },
      );
      const status = checkStatus(res);
      if (!status.ok) throw new Error(`ProductCategoryDelete failed: ${status.message}`);
      const skipped = invalidIds.length > 0 ? ` (skipped: [${invalidIds.join(", ")}])` : "";
      return { content: [{ type: "text", text: `Deleted ${validIds.length} category(s): ${validIds.join(", ")}${skipped}` }] };
    }
  );

  server.registerTool(
    "dw_product_field_list",
    {
      description: "List all product fields belonging to a category. Returns systemName, name, typeId, typeName, required.",
      inputSchema: {
        categoryId: z.string().describe("Category id, e.g. 'TechSpecs'"),
      },
    },
    async ({ categoryId }) => {
      const res = await client.get<Record<string, unknown>>("ProductCategoryFieldsByCategoryId", {
        CategoryId: categoryId,
      });
      const model = unwrapModel<Record<string, unknown>>(res);
      const data = (prop(model, "Data") ?? []) as Array<Record<string, unknown>>;
      const fields = data.map(f => ({
        id: prop(f, "Id"),
        modelIdentifier: prop(f, "ModelIdentifier"),
        label: prop(f, "Label"),
        typeId: prop(f, "TypeId"),
        typeName: prop(f, "TypeName"),
        required: prop(f, "Required"),
        hidden: prop(f, "Hidden"),
        readonly: prop(f, "Readonly"),
        useAsFacet: prop(f, "UseAsFacet"),
      }));
      return {
        content: [{ type: "text", text: JSON.stringify({
          categoryId: prop(model, "CategoryId"),
          categoryName: prop(model, "CategoryName"),
          totalCount: prop(model, "TotalCount"),
          fields,
        }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "dw_product_field_save",
    {
      description: `Create or update a product field (attribute) on a product category.

Type can be a numeric TypeId or a short alias: text, longtext, checkbox, date, datetime, number, decimal, link, file, richtext, dropdown.
Use dw_product_field_type_list for the full mapping.

Field SystemName becomes the key the frontend reads via the product CustomFields/CategoryFields structure.`,
      inputSchema: {
        categoryId: z.string().describe("Owning category id, e.g. 'TechSpecs'"),
        systemName: z.string().describe("PascalCase key, e.g. 'BatteryLife'"),
        name: z.string().describe("Display name shown in DW Admin"),
        type: z.union([z.string(), z.number()]).describe("Type alias (text, number, ...) or numeric TypeId"),
        required: z.boolean().optional().default(false),
        hidden: z.boolean().optional().default(false),
        readonly: z.boolean().optional().default(false),
        useAsFacet: z.boolean().optional().default(false),
        languageEditing: z.boolean().optional().default(false),
        variantEditing: z.boolean().optional().default(false),
        description: z.string().optional().default(""),
        validationPattern: z.string().optional().default(""),
        validationErrorMessage: z.string().optional().default(""),
      },
    },
    async ({ categoryId, systemName, name, type, required, hidden, readonly, useAsFacet, languageEditing, variantEditing, description, validationPattern, validationErrorMessage }) => {
      const typeId = resolveTypeId(type);
      const res = await client.post<Record<string, unknown>>("ProductFieldSave", {
        SystemName: systemName,
        Name: name,
        CategoryId: categoryId,
        TypeId: typeId,
        Required: required,
        Hidden: hidden,
        Readonly: readonly,
        UseAsFacet: useAsFacet,
        LanguageEditing: languageEditing,
        VariantEditing: variantEditing,
        Description: description,
        ValidationPattern: validationPattern,
        ValidationErrorMessage: validationErrorMessage,
      });
      const status = checkStatus(res);
      if (!status.ok) throw new Error(`ProductFieldSave failed: ${status.message}`);
      const saved = unwrapModel<Record<string, unknown>>(res);
      return {
        content: [{ type: "text", text: JSON.stringify({
          modelIdentifier: prop(saved, "ModelIdentifier"),
          systemName: prop(saved, "SystemName"),
          typeId: prop(saved, "TypeId"),
          categoryId: prop(saved, "CategoryId"),
        }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "dw_product_field_delete",
    {
      description: `Delete one or more product fields from a single category. Irreversible.
All ids must belong to the same categoryId. To delete fields across multiple categories, call this tool once per category.`,
      inputSchema: {
        categoryId: z.string().describe("Owning category id, e.g. 'TechSpecs'"),
        systemNames: jsonParam(z.array(z.string())).describe("Field SystemNames to delete, e.g. ['Color', 'BatteryLife']"),
      },
    },
    async ({ categoryId, systemNames }) => {
      const res = await client.command<Record<string, unknown>>(
        "ProductCategoryFieldDelete",
        { CategoryId: categoryId, Ids: systemNames },
      );
      const status = checkStatus(res);
      if (!status.ok) throw new Error(`ProductCategoryFieldDelete failed: ${status.message}`);
      return { content: [{ type: "text", text: `Deleted ${systemNames.length} field(s) from category '${categoryId}': ${systemNames.join(", ")}` }] };
    }
  );
}

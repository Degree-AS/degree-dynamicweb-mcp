import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DwClient, unwrapList, unwrapModel, checkStatus } from "../client.js";
import { jsonParam } from "../utils.js";

// Short aliases → full .NET editor type string. Convenience only — any full editorType string is accepted.
// The authoritative list comes from the DW API: AddInClassesByType?AddInTypeName=Dynamicweb.Content.Items.Editors.Editor
const EDITOR_ALIASES: Record<string, string> = {
  // Text
  text: "Dynamicweb.Content.Items.Editors.TextEditor, Dynamicweb",
  longtext: "Dynamicweb.Content.Items.Editors.LongTextEditor, Dynamicweb",
  richtext: "Dynamicweb.Content.Items.Editors.RichTextEditor, Dynamicweb",
  richtextlight: "Dynamicweb.Content.Items.Editors.RichTextEditorLight, Dynamicweb",
  hidden: "Dynamicweb.Content.Items.Editors.HiddenFieldEditor, Dynamicweb",
  password: "Dynamicweb.Content.Items.Editors.PasswordEditor, Dynamicweb",
  // Files & media
  file: "Dynamicweb.Content.Items.Editors.FileEditor, Dynamicweb",
  image: "Dynamicweb.Content.Items.Editors.FileEditor, Dynamicweb",
  folder: "Dynamicweb.Content.Items.Editors.FolderEditor, Dynamicweb",
  media: "Dynamicweb.Content.Items.Editors.MediaEditor, Dynamicweb",
  // Links & relations
  link: "Dynamicweb.Content.Items.Editors.LinkEditor, Dynamicweb",
  itemlink: "Dynamicweb.Content.Items.Editors.ItemLinkEditor, Dynamicweb",
  itemrelation: "Dynamicweb.Content.Items.Editors.ItemRelationListEditor, Dynamicweb",
  // Numbers & dates
  number: "Dynamicweb.Content.Items.Editors.IntegerEditor, Dynamicweb",
  decimal: "Dynamicweb.Content.Items.Editors.DecimalEditor, Dynamicweb",
  date: "Dynamicweb.Content.Items.Editors.DateEditor, Dynamicweb",
  datetime: "Dynamicweb.Content.Items.Editors.DateTimeEditor, Dynamicweb",
  // Selection
  checkbox: "Dynamicweb.Content.Items.Editors.CheckboxEditor, Dynamicweb",
  checkboxlist: "Dynamicweb.Content.Items.Editors.CheckboxListEditor`1, Dynamicweb",
  dropdown: "Dynamicweb.Content.Items.Editors.DropDownListEditor`1, Dynamicweb",
  radiolist: "Dynamicweb.Content.Items.Editors.RadioButtonListEditor`1, Dynamicweb",
  editablelist: "Dynamicweb.Content.Items.Editors.EditableListEditor, Dynamicweb",
  // Visual & color
  color: "Dynamicweb.Content.Items.Editors.ColorEditor, Dynamicweb",
  colorswatch: "Dynamicweb.Content.Items.Editors.ColorSwatchEditor, Dynamicweb",
  // Item type composition
  itemtype: "Dynamicweb.Content.Items.Editors.ItemTypeEditor, Dynamicweb",
  itemtab: "Dynamicweb.Content.Items.Editors.ItemTypeTabEditor, Dynamicweb",
  // Users
  user: "Dynamicweb.Content.Items.Editors.UserEditor, Dynamicweb",
  singleuser: "Dynamicweb.Content.Items.Editors.SingleUserEditor, Dynamicweb",
  usergroup: "Dynamicweb.Content.Items.Editors.SingleUserGroupEditor, Dynamicweb",
  // Other
  geolocation: "Dynamicweb.Content.Items.Editors.GeolocationEditor, Dynamicweb",
  googlefont: "Dynamicweb.Content.Items.Editors.GoogleFontEditor, Dynamicweb",
};

// EditorConfiguration XML required by certain editors
const EDITOR_CONFIGS: Record<string, string> = {
  RichTextEditor: `<Parameters addin="Dynamicweb.Content.Items.Editors.RichTextEditor"><Parameter addin="Dynamicweb.Content.Items.Editors.RichTextEditor" name="DefaultFontStyle" value="dw-paragraph" /><Parameter addin="Dynamicweb.Content.Items.Editors.RichTextEditor" name="ShowToggle" value="False" /><Parameter addin="Dynamicweb.Content.Items.Editors.RichTextEditor" name="Configuration" value="" /></Parameters>`,
  FileEditor: `<Parameters addin="Dynamicweb.Content.Items.Editors.FileEditor"><Parameter name="Show as image selector" value="True" /><Parameter name="Use focal point selector for images" value="False" /></Parameters>`,
  LinkEditor: `<Parameters addin="Dynamicweb.Content.Items.Editors.LinkEditor"><Parameter name="EnablePageSelection" value="True" /><Parameter name="EnableExternalLinkSelection" value="True" /><Parameter name="EnableFileSelection" value="False" /></Parameters>`,
};

// Underlying .NET type for common editors. Falls back to System.String for unknown editors.
const UNDERLYING_TYPES: Record<string, string> = {
  checkbox: "System.Boolean, System.Private.CoreLib",
  number: "System.Int32, System.Private.CoreLib",
  decimal: "System.Decimal, System.Private.CoreLib",
  date: "System.DateTime, System.Private.CoreLib",
  datetime: "System.DateTime, System.Private.CoreLib",
};
const DEFAULT_UNDERLYING_TYPE = "System.String, System.Private.CoreLib";

/** Resolve a type alias or full editorType string to the full .NET class name */
function resolveEditorType(type: string): string {
  return EDITOR_ALIASES[type.toLowerCase()] ?? type;
}

/** Get EditorConfiguration XML for an editor type, if required */
function resolveEditorConfig(editorType: string): string {
  // Match on "EditorName," boundary to avoid ambiguity (e.g. RichTextEditorLight vs RichTextEditor)
  const match = Object.keys(EDITOR_CONFIGS).find(k =>
    editorType.includes(k + ",") || editorType.endsWith(k)
  );
  return match ? EDITOR_CONFIGS[match] : "";
}

/** Get the .NET underlying type for an editor */
function resolveUnderlyingType(typeAlias: string): string {
  return UNDERLYING_TYPES[typeAlias.toLowerCase()] ?? DEFAULT_UNDERLYING_TYPE;
}

const fieldSchema = z.object({
  name: z.string().describe("Display name, e.g. 'Heading'"),
  systemName: z.string().describe("PascalCase key, e.g. 'Heading'. Must match frontend getFieldString() calls."),
  type: z.string()
    .describe("Short alias (text, longtext, richtext, file, image, link, itemlink, media, checkbox, number, dropdown) or full .NET editor class name. Use dw_field_types to discover available types."),
  required: z.boolean().optional().default(false),
  group: z.string().min(1).optional().default("General")
    .describe("Field group systemName. Default: 'General'. Use to organize fields into collapsible sections in DW Admin."),
});

const restrictionsSchema = z.object({
  allowedWebsites: jsonParam(z.array(z.string()).optional().default(["*"]))
    .describe("Area IDs or '*' for all. Default: ['*']"),
  structureType: z.enum(["Pages", "Paragraphs"]).optional()
    .describe("Whether this is a Page or Paragraph item type. Inferred from pageDefaultView if not set."),
  allowedParentTypes: jsonParam(z.array(z.string()).optional().default(["RegularPage"]))
    .describe("Page parent types. Default: ['RegularPage']"),
  allowedSections: jsonParam(z.array(z.string()).optional().default(["*"]))
    .describe("Tree sections. Default: ['*']"),
  allowedParentItemTypes: jsonParam(z.array(z.string()).optional().default([]))
    .describe("Parent item type systemNames. Usually empty."),
  allowedChildItemTypes: jsonParam(z.array(z.string()).optional().default([]))
    .describe("For Page item types: which Paragraph systemNames are allowed as children. Empty = no paragraphs allowed."),
  allowedChildTypes: jsonParam(z.array(z.string()).optional().default([]))
    .describe("Allowed child page types. Usually empty."),
});

export function registerItemTypeTools(server: McpServer, client: DwClient): void {

  server.registerTool(
    "dw_itemtype_list",
    {
      description: "List all DynamicWeb item types. Returns systemName, name, category, fieldsCount, enabledFor.",
    },
    async () => {
      const res = await client.get("ItemTypeAll");
      const items = unwrapList<Record<string, unknown>>(res);
      const summary = items.map(i => ({
        systemName: i.systemName,
        name: i.name,
        category: i.category,
        fieldsCount: i.fieldsCount,
        enabledFor: i.enabledFor,
      }));
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    }
  );

  server.registerTool(
    "dw_itemtype_get",
    {
      description: "Get a single DynamicWeb item type by systemName, including all restrictions.",
      inputSchema: { systemName: z.string().describe("Exact systemName, e.g. 'HeroBanner'") },
    },
    async ({ systemName }) => {
      const res = await client.get("ItemTypeById", { SystemName: systemName });
      const model = unwrapModel<Record<string, unknown>>(res);
      return { content: [{ type: "text", text: JSON.stringify(model, null, 2) }] };
    }
  );

  server.registerTool(
    "dw_itemtype_create",
    {
      description: `Create a new DynamicWeb item type with fields and restrictions in one operation.

    Category conventions:
    - Page item types → category: "" (top-level)
    - Layout/config → category: "Layout"
    - Article paragraphs → category: "Paragraphs/Article"
    - Landing paragraphs → category: "Paragraphs/Landing"

    For Page item types, set restrictions.allowedChildItemTypes to the paragraph systemNames that editors can add.
    For Paragraph item types, leave restrictions.allowedChildItemTypes empty.`,
      inputSchema: {
        systemName: z.string().describe("PascalCase, no spaces. This is the contract with the frontend registry.ts."),
        name: z.string().describe("Human-readable name shown in DW Admin"),
        description: z.string().optional().default(""),
        category: z.string().optional().default("Paragraphs/Landing")
          .describe("Category path. Use '' for page types, 'Paragraphs/Landing' or 'Paragraphs/Article' for paragraphs."),
        icon: z.string().optional().default("uil-file-alt")
          .describe("Unicons icon name, e.g. 'uil-desktop', 'uil-file-alt', 'uil-arrow-circle-right'"),
        pageDefaultView: z.enum(["page", "paragraph"]).optional().default("paragraph"),
        fieldForTitle: z.string().optional().default("Title")
          .describe("Which field to use as the item title in DW Admin"),
        includeInUrlIndex: z.boolean().optional().default(false),
        fields: jsonParam(z.array(fieldSchema).optional().default([]))
          .describe("Fields to add to the item type"),
        restrictions: jsonParam(restrictionsSchema.optional()),
      },
    },
    async ({ systemName, name, description, category, icon, pageDefaultView, fieldForTitle, includeInUrlIndex, fields, restrictions }) => {
      const results: string[] = [];
      const enabledFor = pageDefaultView === "page" ? ["Pages"] : ["Paragraphs"];

      // Step 1: Create item type
      const createRes = await client.post("ItemTypeSave", {
        SystemName: systemName,
        Name: name,
        Description: description,
        Category: category,
        Icon: icon,
        PageDefaultView: pageDefaultView,
        FieldForTitle: fieldForTitle,
        IncludeInUrlIndex: includeInUrlIndex,
        EnabledFor: enabledFor,
        AllowModuleAttachment: false,
        AllowColorSchemes: false,
      });

      const createStatus = checkStatus(createRes);
      if (!createStatus.ok) {
        throw new Error(`Failed to create item type: ${createStatus.message}`);
      }
      results.push(`✓ Created item type '${systemName}'`);

      // Step 2: Create field groups (except "General" which exists by default)
      const groups = [...new Set(fields.map(f => f.group || "General"))].filter(g => g !== "General");
      for (const group of groups) {
        const groupRes = await client.post("ItemFieldGroupSave", {
          ItemTypeSystemName: systemName,
          Name: group,
          SystemName: group,
        });
        const groupStatus = checkStatus(groupRes);
        if (!groupStatus.ok) {
          results.push(`✗ Group '${group}': ${groupStatus.message}`);
        } else {
          results.push(`✓ Group '${group}'`);
        }
      }

      // Step 3: Add fields
      for (const field of fields) {
        const editorType = resolveEditorType(field.type);
        const underlyingType = resolveUnderlyingType(field.type);
        const editorConfig = resolveEditorConfig(editorType);

        const fieldRes = await client.post("ItemFieldSave", {
          ItemTypeSystemName: systemName,
          IsNew: true,
          Name: field.name,
          SystemName: field.systemName,
          UnderlyingType: underlyingType,
          EditorType: editorType,
          EditorConfiguration: editorConfig,
          Required: field.required ?? false,
          ItemFieldGroupSystemName: field.group ?? "General",
        });

        const fieldStatus = checkStatus(fieldRes);
        if (!fieldStatus.ok) {
          results.push(`✗ Field '${field.systemName}': ${fieldStatus.message}`);
        } else {
          results.push(`✓ Field '${field.systemName}' (${field.type})`);
        }
      }

      // Step 4: Set restrictions
      if (restrictions) {
        const structureType = restrictions.structureType ?? (pageDefaultView === "page" ? "Pages" : "Paragraphs");

        const restrictionRes = await client.update(
          "ItemTypeSave",
          "ItemTypeById",
          { SystemName: systemName },
          {
            Name: name,
            SystemName: systemName,
            Description: description,
            Category: category,
            Icon: icon,
            EnabledFor: enabledFor,
            FieldForTitle: fieldForTitle,
            Title: "",
            AllowModuleAttachment: false,
            AllowColorSchemes: false,
            Base: "",
            "Restrictions|AreaRestrictionRule|Dynamicweb.Content.Items.Activation.AreaRestrictionRule, Dynamicweb": restrictions.allowedWebsites,
            "Restrictions|StructureRestrictionRule|Dynamicweb.Content.Items.Activation.StructureRestrictionRule, Dynamicweb": [structureType],
            "Restrictions|ParentRestrictionRule|Dynamicweb.Content.Items.Activation.ParentRestrictionRule, Dynamicweb": restrictions.allowedParentTypes,
            "Restrictions|SectionRestrictionRule|Dynamicweb.Content.Items.Activation.SectionRestrictionRule, Dynamicweb": restrictions.allowedSections,
            "Restrictions|ParentItemTypeRestrictionRule|Dynamicweb.Content.Items.Activation.ParentItemTypeRestrictionRule, Dynamicweb": restrictions.allowedParentItemTypes,
            "Restrictions|ChildItemTypeRestrictionRule|Dynamicweb.Content.Items.Activation.ChildItemTypeRestrictionRule, Dynamicweb": restrictions.allowedChildItemTypes,
            "Restrictions|ChildRestrictionRule|Dynamicweb.Content.Items.Activation.ChildRestrictionRule, Dynamicweb": restrictions.allowedChildTypes,
          }
        );

        const restrictionStatus = checkStatus(restrictionRes);
        if (!restrictionStatus.ok) {
          results.push(`✗ Restrictions: ${restrictionStatus.message}`);
        } else {
          results.push(`✓ Restrictions set`);
        }
      }

      return { content: [{ type: "text", text: results.join("\n") }] };
    }
  );

  server.registerTool(
    "dw_itemtype_update_settings",
    {
      description: `Update Settings fields on an existing DynamicWeb item type.
    Only pass the fields you want to change — omitted ones are preserved from current state.

    Corresponds to the Settings tab in DW Admin (General, Availability, Title for new items, Advanced sections).`,
      inputSchema: {
        systemName: z.string().describe("SystemName of the item type to update"),
        name: z.string().optional().describe("Display name shown in DW Admin"),
        description: z.string().optional().describe("Description text"),
        category: z.string().optional()
          .describe("Category path, e.g. 'Paragraphs/Landing'. Use '' for top-level page types."),
        icon: z.string().optional()
          .describe("Unicons icon name, e.g. 'uil-file-alt', 'uil-desktop'"),
        enabledFor: jsonParam(z.array(z.enum(["Pages", "Paragraphs", "Rows", "Websites"])).optional())
          .describe("Availability checkboxes. e.g. ['Pages'] or ['Paragraphs']"),
        fieldForTitle: z.string().optional()
          .describe("Which field to use as the item title in DW Admin, e.g. 'Title'"),
        title: z.string().optional()
          .describe("Title template for new items, e.g. '{{Title}}'"),
        allowModuleAttachment: z.boolean().optional()
          .describe("Advanced: Allow module attachment checkbox"),
        allowColorSchemes: z.boolean().optional()
          .describe("Advanced: Allow color schemes checkbox"),
        pageDefaultView: z.enum(["page", "paragraph"]).optional()
          .describe("Advanced: Default view in page — 'page' = Item, 'paragraph' = Paragraph"),
        base: z.string().optional()
          .describe("Advanced: Inherited from — systemName of base item type"),
      },
    },
    async ({ systemName, name, description, category, icon, enabledFor, fieldForTitle, title, allowModuleAttachment, allowColorSchemes, pageDefaultView, base }) => {
      const currentRes = await client.get<Record<string, unknown>>("ItemTypeById", { SystemName: systemName });
      const current = unwrapModel<Record<string, unknown>>(currentRes);

      const res = await client.update(
        "ItemTypeSave",
        "ItemTypeById",
        { SystemName: systemName },
        {
          Name: name ?? current.name,
          SystemName: systemName,
          Description: description ?? current.description ?? "",
          Category: category ?? current.category ?? "",
          Icon: icon ?? current.icon ?? "uil-file-alt",
          EnabledFor: enabledFor ?? current.enabledFor,
          FieldForTitle: fieldForTitle ?? current.fieldForTitle ?? "Title",
          Title: title ?? current.title ?? "",
          AllowModuleAttachment: allowModuleAttachment ?? current.allowModuleAttachment ?? false,
          AllowColorSchemes: allowColorSchemes ?? current.allowColorSchemes ?? false,
          PageDefaultView: pageDefaultView ?? current.pageDefaultView ?? "page",
          Base: base ?? current.base ?? "",
        }
      );

      const status = checkStatus(res);
      if (!status.ok) throw new Error(status.message);
      return { content: [{ type: "text", text: `✓ Settings updated for '${systemName}'` }] };
    }
  );

  server.registerTool(
    "dw_itemtype_update_restrictions",
    {
      description: `Update restrictions on an existing DynamicWeb item type.

    Only pass the restriction arrays you want to change — omitted ones are left untouched.
    Most common use: adding allowed paragraph types to a Page item type so editors can add content blocks.
    Example: allowedChildItemTypes: ["HeroBanner", "RichText", "CTABlock"]`,
      inputSchema: {
        systemName: z.string(),
        allowedWebsites: jsonParam(z.array(z.string()).optional())
          .describe("Area IDs or '*' for all"),
        allowedParentTypes: jsonParam(z.array(z.string()).optional())
          .describe("Page parent types, e.g. ['RegularPage']"),
        allowedSections: jsonParam(z.array(z.string()).optional())
          .describe("Tree sections, e.g. ['*']"),
        allowedParentItemTypes: jsonParam(z.array(z.string()).optional())
          .describe("Parent item type systemNames"),
        allowedChildItemTypes: jsonParam(z.array(z.string()).optional())
          .describe("Paragraph systemNames allowed as children on a Page item type"),
        allowedChildTypes: jsonParam(z.array(z.string()).optional())
          .describe("Allowed child page types"),
      },
    },
    async ({ systemName, allowedWebsites, allowedParentTypes, allowedSections, allowedParentItemTypes, allowedChildItemTypes, allowedChildTypes }) => {
      // Fetch current item type to preserve name/category/icon/etc.
      const currentRes = await client.get<Record<string, unknown>>("ItemTypeById", { SystemName: systemName });
      const current = unwrapModel<Record<string, unknown>>(currentRes);

      const restrictionKeys: Record<string, unknown> = {};
      if (allowedWebsites !== undefined)
        restrictionKeys["Restrictions|AreaRestrictionRule|Dynamicweb.Content.Items.Activation.AreaRestrictionRule, Dynamicweb"] = allowedWebsites;
      if (allowedParentTypes !== undefined)
        restrictionKeys["Restrictions|ParentRestrictionRule|Dynamicweb.Content.Items.Activation.ParentRestrictionRule, Dynamicweb"] = allowedParentTypes;
      if (allowedSections !== undefined)
        restrictionKeys["Restrictions|SectionRestrictionRule|Dynamicweb.Content.Items.Activation.SectionRestrictionRule, Dynamicweb"] = allowedSections;
      if (allowedParentItemTypes !== undefined)
        restrictionKeys["Restrictions|ParentItemTypeRestrictionRule|Dynamicweb.Content.Items.Activation.ParentItemTypeRestrictionRule, Dynamicweb"] = allowedParentItemTypes;
      if (allowedChildItemTypes !== undefined)
        restrictionKeys["Restrictions|ChildItemTypeRestrictionRule|Dynamicweb.Content.Items.Activation.ChildItemTypeRestrictionRule, Dynamicweb"] = allowedChildItemTypes;
      if (allowedChildTypes !== undefined)
        restrictionKeys["Restrictions|ChildRestrictionRule|Dynamicweb.Content.Items.Activation.ChildRestrictionRule, Dynamicweb"] = allowedChildTypes;

      const res = await client.update(
        "ItemTypeSave",
        "ItemTypeById",
        { SystemName: systemName },
        {
          Name: current.name,
          SystemName: systemName,
          Description: current.description ?? "",
          Category: current.category ?? "",
          Icon: current.icon ?? "uil-file-alt",
          EnabledFor: current.enabledFor,
          FieldForTitle: current.fieldForTitle ?? "Title",
          Title: current.title ?? "",
          AllowModuleAttachment: current.allowModuleAttachment ?? false,
          AllowColorSchemes: current.allowColorSchemes ?? false,
          PageDefaultView: current.pageDefaultView ?? "page",
          Base: current.base ?? "",
          ...restrictionKeys,
        }
      );

      const status = checkStatus(res);
      if (!status.ok) throw new Error(status.message);
      return { content: [{ type: "text", text: `✓ Restrictions updated for '${systemName}'` }] };
    }
  );

  server.registerTool(
    "dw_itemtype_delete",
    {
      description: "Delete a DynamicWeb item type by systemName.",
      inputSchema: { systemName: z.string() },
    },
    async ({ systemName }) => {
      const res = await client.command("ItemTypeDelete", { SystemName: systemName });
      const status = checkStatus(res);
      if (!status.ok) throw new Error(status.message);
      return { content: [{ type: "text", text: `✓ Deleted item type '${systemName}'` }] };
    }
  );

  server.registerTool(
    "dw_field_list",
    {
      description: "List all fields for a DynamicWeb item type. Returns systemName, type, required for each field.",
      inputSchema: { systemName: z.string().describe("Item type systemName") },
    },
    async ({ systemName }) => {
      const res = await client.get("ItemFieldsByItemTypeSystemName", { SystemName: systemName });
      const items = unwrapList<Record<string, unknown>>(res);
      const fields = items.map(f => ({
        systemName: f.systemName,
        name: f.name,
        editorName: f.editorName,
        required: f.required,
      }));
      return { content: [{ type: "text", text: JSON.stringify(fields, null, 2) }] };
    }
  );

  server.registerTool(
    "dw_field_save",
    {
      description: `Add or update a field on a DynamicWeb item type.

    Set isNew: true to add a new field. Set isNew: false to update existing.

    IMPORTANT: RichTextEditor requires EditorConfiguration — this tool handles that automatically.`,
      inputSchema: {
        itemTypeSystemName: z.string(),
        name: z.string().describe("Display name"),
        systemName: z.string().describe("PascalCase field key"),
        type: z.string()
          .describe("Short alias (text, longtext, richtext, file, image, link, itemlink, media, checkbox, number, dropdown) or full .NET editor class name. Use dw_field_types to discover available types."),
        isNew: z.boolean().optional().default(true),
        required: z.boolean().optional().default(false),
        group: z.string().optional().default("General")
          .describe("Field group systemName. Default: 'General'."),
      },
    },
    async ({ itemTypeSystemName, name, systemName, type, isNew, required, group }) => {
      const editorType = resolveEditorType(type);
      const underlyingType = resolveUnderlyingType(type);
      const editorConfig = resolveEditorConfig(editorType);

      const res = await client.post("ItemFieldSave", {
        ItemTypeSystemName: itemTypeSystemName,
        IsNew: isNew,
        Name: name,
        SystemName: systemName,
        UnderlyingType: underlyingType,
        EditorType: editorType,
        EditorConfiguration: editorConfig,
        Required: required,
        ItemFieldGroupSystemName: group,
      });

      const status = checkStatus(res);
      if (!status.ok) throw new Error(status.message);
      return { content: [{ type: "text", text: `✓ Field '${systemName}' (${type}) saved on '${itemTypeSystemName}'` }] };
    }
  );

  server.registerTool(
    "dw_field_delete",
    {
      description: "Delete a field from a DynamicWeb item type.",
      inputSchema: {
        itemTypeSystemName: z.string(),
        fieldSystemName: z.string(),
      },
    },
    async ({ itemTypeSystemName, fieldSystemName }) => {
      // DW delete command uses "ItemSystemName" (not "ItemTypeSystemName" like save)
      const res = await client.command("ItemFieldDelete", {
        ItemSystemName: itemTypeSystemName,
        SystemName: fieldSystemName,
      });
      const status = checkStatus(res);
      if (!status.ok) throw new Error(status.message);
      return { content: [{ type: "text", text: `✓ Deleted field '${fieldSystemName}' from '${itemTypeSystemName}'` }] };
    }
  );

  server.registerTool(
    "dw_field_types",
    {
      description: `List all available field editor types from this DynamicWeb instance.
    Fetches the authoritative list from the DW AddIn registry — not hardcoded.
    Returns full .NET class names and short aliases you can use in dw_field_save and dw_itemtype_create.`,
    },
    async () => {
      const res = await client.get<Record<string, unknown>>("AddInClassesByType", {
        AddInTypeName: "Dynamicweb.Content.Items.Editors.Editor",
      });
      const editors = unwrapList<Record<string, unknown>>(res);

      const editorList = editors.map(e => {
        const fqn = String(e.fullyQualifiedName ?? "");
        const asm = String(e.assemblyName ?? "");
        const fullType = `${fqn}, ${asm}`;
        // Find matching alias(es)
        const aliases = Object.entries(EDITOR_ALIASES)
          .filter(([, v]) => v === fullType)
          .map(([k]) => k);
        return {
          name: String(e.name ?? ""),
          editorType: fullType,
          assembly: asm,
          aliases: aliases.length > 0 ? aliases : undefined,
        };
      });

      return {
        content: [{
          type: "text",
          text: `${editorList.length} editor types available:\n\n${JSON.stringify(editorList, null, 2)}`
        }]
      };
    }
  );
}

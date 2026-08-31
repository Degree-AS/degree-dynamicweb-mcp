# degree-dynamicweb-mcp

[![npm](https://img.shields.io/npm/v/@degree-as/dynamicweb-mcp)](https://www.npmjs.com/package/@degree-as/dynamicweb-mcp)
[![node](https://img.shields.io/node/v/@degree-as/dynamicweb-mcp)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@degree-as/dynamicweb-mcp)](LICENSE)

Build and edit a DynamicWeb 10 site by asking for it, instead of clicking through the Admin UI. This is an MCP server: it gives Claude, Cursor, Copilot, or your own agent code 45 tools over the DynamicWeb Admin API - item types, fields, pages, paragraphs, products, and the PIM data model.

```
"Create an OpeningHours item type with a title and a repeatable list of day/hours rows,
 then add it to the Contact page."

  → dw_itemtype_create ×2   (the row type, then the parent with an itemrelation field)
  → dw_itemtype_sync_schema (XML alone does not create the database columns)
  → dw_itemtype_health      (confirms every field has a column)
  → dw_paragraph_create + dw_paragraph_set_fields
```

Three things make this usable rather than merely possible:

- **Writes are proved, not assumed.** DW answers "ok" whether or not a value was stored, so `set_fields` reads the item back and returns what it now holds. A typo in a SystemName is an error listing the valid names, not a silent no-op.
- **Schema drift is visible.** Deploying item type XML does not touch the database; a field whose column is missing saves without error and keeps nothing. `dw_itemtype_health` reports exactly that.
- **The other ~1800 endpoints are reachable.** `dw_api_search` → `dw_api_endpoint_schema` → `dw_api_call` covers whatever has no dedicated tool.

## Install

Get a token from DynamicWeb Admin: **Settings > Developer > API Keys > New**, with full access. Then, for Claude Code:

```bash
claude mcp add dynamicweb -s project \
  --env DW_BASE_URL=https://your-dw-instance \
  --env DW_API_TOKEN=your-token \
  -- npx -y @degree-as/dynamicweb-mcp
```

Any other client wants the same four values in its config file:

```json
{
  "mcpServers": {
    "dynamicweb": {
      "command": "npx",
      "args": ["-y", "@degree-as/dynamicweb-mcp"],
      "env": {
        "DW_BASE_URL": "https://your-dw-instance",
        "DW_API_TOKEN": "your-token"
      }
    }
  }
}
```

Restart the client, then ask it to run `dw_area_list` - a list of your websites means the URL and token are both good.

<details>
<summary><b>Where that file lives, per client</b></summary>

Only the path and the top-level key differ.

| Client            | File                                                                                          | Top-level key                                   |
| ----------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Claude Code       | `.mcp.json` in the project                                                                    | `mcpServers`                                    |
| Claude Desktop    | `~/Library/Application Support/Claude/claude_desktop_config.json` · `%APPDATA%\Claude\…` (Win) | `mcpServers`                                    |
| Cursor            | `.cursor/mcp.json` or `~/.cursor/mcp.json`                                                    | `mcpServers`                                    |
| Windsurf          | `~/.codeium/windsurf/mcp_config.json`                                                         | `mcpServers`                                    |
| Cline             | its MCP settings UI, or the same JSON                                                         | `mcpServers`                                    |
| VS Code / Copilot | `.vscode/mcp.json`                                                                            | `servers`, plus `"type": "stdio"`               |
| Zed               | `settings.json`                                                                               | `context_servers`, plus `"source": "custom"`    |
| Continue.dev      | `~/.continue/config.yaml`                                                                     | `mcpServers`, as YAML                           |

`DW_BASE_URL` defaults to `https://localhost:38547` and is the only optional variable; `DW_API_TOKEN` is required. Against `localhost` the server disables TLS verification so DW's self-signed dev certificate is accepted - anywhere else the certificate must be valid.

</details>

<details>
<summary><b>From an agent framework instead of a client</b></summary>

It is a standard stdio MCP server - tools only, no prompts or sampling - so any framework can spawn it with the four values above. OpenAI Agents SDK (Python):

```python
async with MCPServerStdio(
    name="DynamicWeb",
    params={
        "command": "npx",
        "args": ["-y", "@degree-as/dynamicweb-mcp"],
        "env": {"DW_BASE_URL": "https://your-dw-instance", "DW_API_TOKEN": "your-token"},
    },
    cache_tools_list=True,
) as dw:
    agent = Agent(name="DW editor", mcp_servers=[dw])
```

The JS SDK's `MCPServerStdio` is equivalent but wants explicit `connect()`/`close()`. LangChain goes through [`langchain-mcp-adapters`](https://github.com/langchain-ai/langchain-mcp-adapters); Pydantic AI, Mastra, Vercel AI SDK and n8n each have their own stdio MCP client.

**ChatGPT and the OpenAI Responses API do not work yet.** They never spawn a local process - OpenAI's servers call your endpoint over HTTP - and this server speaks stdio only. Adding a Streamable HTTP entrypoint is planned; `src/server.ts` is already transport-agnostic, so the server itself will not change.

</details>

## Safety

These tools write to a live CMS. Of the 45, **23 only read**, 12 create or update, and **10 destroy data**: every `_delete`, plus `dw_itemtype_clean_table`, `dw_product_bulk_discount` (overwrites `DefaultPrice` across a whole group, no undo), and `dw_api_call` (the caller picks the endpoint).

Each tool declares MCP annotations - `readOnlyHint`, `destructiveHint`, `idempotentHint` - so a client can warn before a destructive call or auto-approve a read. Whether it does is the client's choice, not this server's. There is no dry-run and no confirmation step here: point it at staging before production.

## Tools

45 tools, all prefixed `dw_`, grouped by the DynamicWeb concept they act on.

### Item Types

| Tool                              | Description                                                        |
| --------------------------------- | ------------------------------------------------------------------ |
| `dw_itemtype_list`                | List all item types                                                |
| `dw_itemtype_get`                 | Get item type details and restrictions                             |
| `dw_itemtype_create`              | Create item type with fields, groups, and restrictions in one call |
| `dw_itemtype_update_settings`     | Update settings (name, category, icon, availability, etc.)         |
| `dw_itemtype_update_restrictions` | Update restrictions (allowed parents, children, websites, etc.)    |
| `dw_itemtype_delete`              | Delete an item type                                                |

#### Schema maintenance

Deploying item type XML does not touch the database. Until the schema is synced, a field whose column is missing saves without error and keeps nothing.

| Tool                      | Description                                                                       |
| ------------------------- | --------------------------------------------------------------------------------- |
| `dw_itemtype_health`      | Report fields whose DB column is missing, and columns the XML no longer declares   |
| `dw_itemtype_sync_schema` | Reload item type XML and create the missing tables and columns                     |
| `dw_itemtype_usages`      | List the pages and paragraphs that use an item type                               |
| `dw_itemtype_clean_table` | **Destructive.** Delete orphaned rows from an item type's table                    |

After deploying new XML: `dw_itemtype_sync_schema`, then `dw_itemtype_health`. The sync endpoint answers "ok" even when it aborted partway, so the health check is what tells you whether it worked - and `/Files/System/Log/items/ActivationWorkflow` holds the real errors. An item type whose table is missing entirely does not appear in the health report at all.

### Fields

| Tool              | Description                                                          |
| ----------------- | -------------------------------------------------------------------- |
| `dw_field_list`   | List fields on an item type                                          |
| `dw_field_save`   | Add or update a field                                                |
| `dw_field_delete` | Delete a field                                                       |
| `dw_field_types`  | List all available editor types from the DW instance (not hardcoded) |

### Pages

| Tool                 | Description                                       |
| -------------------- | ------------------------------------------------- |
| `dw_page_list`       | List pages, optionally filtered by area or parent |
| `dw_page_get`        | Get a page with all item fields                   |
| `dw_page_create`     | Create a page under a parent                      |
| `dw_page_set_fields` | Set item field values on a page                   |
| `dw_page_delete`     | Delete a page                                     |
| `dw_area_list`       | List all areas (websites)                         |

### Paragraphs

| Tool                      | Description                          |
| ------------------------- | ------------------------------------ |
| `dw_paragraph_list`       | List paragraphs on a page            |
| `dw_paragraph_get`        | Get a paragraph with all item fields |
| `dw_paragraph_create`     | Create a paragraph on a page         |
| `dw_paragraph_set_fields` | Set item field values on a paragraph |
| `dw_paragraph_delete`     | Delete a paragraph                   |

`dw_page_set_fields` and `dw_paragraph_set_fields` verify their own write. A field name the item type does not declare is an error that lists the names it does have, and after saving they read the item back and return what it now holds. DW answers "ok" whether or not a value was stored, so a typo in a SystemName used to be indistinguishable from a successful write.

### Products

| Tool                      | Description                                                                |
| ------------------------- | -------------------------------------------------------------------------- |
| `dw_product_list`         | List products, optionally filtered by group or search                      |
| `dw_product_get`          | Get a single product (full model incl. CustomFields/CategoryFields). Returns `{found: false}` for a missing product rather than an API error |
| `dw_product_update`       | Update top-level fields, customFields, and categoryFields on a product     |
| `dw_product_delete`       | Delete one or more products                                                |
| `dw_product_bulk_discount`| Apply a percentage discount to DefaultPrice across a group or product list |

`dw_product_update` accepts three input maps:

- `fields` - top-level product fields (Name, DefaultPrice, Stock, etc.)
- `customFields` - global product custom field values, keyed by SystemName
- `categoryFields` - product category field values, keyed by SystemName

### Product Schema

Manage the PIM data model: product categories (groups of attributes) and product fields (the attributes themselves).

| Tool                          | Description                                                       |
| ----------------------------- | ----------------------------------------------------------------- |
| `dw_product_field_type_list`  | List the 15 product field types (TypeId + aliases)                |
| `dw_product_category_list`    | List product categories                                           |
| `dw_product_category_save`    | Create or update a product category                               |
| `dw_product_category_delete`  | Delete categories (3-step DW workflow handled internally)         |
| `dw_product_field_list`       | List fields belonging to a category                               |
| `dw_product_field_save`       | Create or update a field on a category (accepts type aliases)     |
| `dw_product_field_delete`     | Delete fields from a single category                              |

### Files

| Tool                   | Description                                                 |
| ---------------------- | ----------------------------------------------------------- |
| `dw_files_list`        | List files in a directory, optionally filtered by extension |
| `dw_files_directories` | List subdirectories                                         |

### Delivery API (read-only)

| Tool                    | Description                   |
| ----------------------- | ----------------------------- |
| `dw_content_areas`      | Fetch areas from Delivery API |
| `dw_content_pages`      | Fetch pages with content      |
| `dw_content_paragraphs` | Fetch paragraphs with content |

### API Discovery

| Tool                     | Description                                      |
| ------------------------ | ------------------------------------------------ |
| `dw_api_search`          | Search the Swagger spec for endpoints by keyword |
| `dw_api_endpoint_schema` | Get request/response schema for an endpoint      |
| `dw_api_call`            | Raw call to any Admin API endpoint               |

## Reference

<details>
<summary><b>Item type field types</b> - aliases for <code>dw_field_save</code> and <code>dw_itemtype_create</code></summary>

When creating fields, you can use short aliases instead of full .NET class names:

| Alias            | Editor                 |
| ---------------- | ---------------------- |
| `text`           | TextEditor             |
| `longtext`       | LongTextEditor         |
| `richtext`       | RichTextEditor         |
| `richtextlight`  | RichTextEditorLight    |
| `file` / `image` | FileEditor             |
| `folder`         | FolderEditor           |
| `media`          | MediaEditor            |
| `link`           | LinkEditor             |
| `itemlink`       | ItemLinkEditor         |
| `itemrelation`   | ItemRelationListEditor |
| `number`         | IntegerEditor          |
| `decimal`        | DecimalEditor          |
| `date`           | DateEditor             |
| `datetime`       | DateTimeEditor         |
| `checkbox`       | CheckboxEditor         |
| `checkboxlist`   | CheckboxListEditor     |
| `dropdown`       | DropDownListEditor     |
| `radiolist`      | RadioButtonListEditor  |
| `editablelist`   | EditableListEditor     |
| `color`          | ColorEditor            |
| `colorswatch`    | ColorSwatchEditor      |
| `itemtype`       | ItemTypeEditor         |
| `itemtab`        | ItemTypeTabEditor      |
| `user`           | UserEditor             |
| `singleuser`     | SingleUserEditor       |
| `usergroup`      | SingleUserGroupEditor  |
| `geolocation`    | GeolocationEditor      |
| `googlefont`     | GoogleFontEditor       |
| `hidden`         | HiddenFieldEditor      |
| `password`       | PasswordEditor         |

Any full .NET editor class name is also accepted. Use `dw_field_types` to discover all available editors from your DW instance.

#### Repeatable lists (`itemrelation`)

`itemrelation` (ItemRelationListEditor) creates a **repeatable list of child items** — the generic way to model FAQ items, rows, persons, etc. (instead of fixed numbered slots like `Question1..5`). It needs two extra params:

| Param              | Required | Description                                                              |
| ------------------ | -------- | ------------------------------------------------------------------------ |
| `itemRelationType` | yes      | systemName of the **child item type** the list holds. Create it first.   |
| `itemSource`       | no       | where items live. Default `CurrentParagraph` (rows stored on the owner). |

Create the child item type first, then the parent:

```jsonc
// 1) child row
dw_itemtype_create { systemName: "OpeningHoursRow", fields: [
  { name: "Label", systemName: "Label", type: "text" },
  { name: "Value", systemName: "Value", type: "text" },
]}
// 2) parent with the repeatable list
dw_itemtype_create { systemName: "OpeningHours", fields: [
  { name: "Title", systemName: "Title", type: "text" },
  { name: "Rows",  systemName: "Rows",  type: "itemrelation", itemRelationType: "OpeningHoursRow" },
]}
```

The tool emits the required `EditorConfiguration` + `EditorFields` (Item type / Item source) and the `Int32` underlying type automatically.

</details>

<details>
<summary><b>Product field types</b> - aliases for <code>dw_product_field_save</code></summary>

Product fields use a different system - integer `TypeId` from `FieldTypeAll`, not editor class names:

| Alias                | TypeId | Name        |
| -------------------- | ------ | ----------- |
| `text` / `text255`   | 1      | Text (255)  |
| `longtext`           | 2      | Long text   |
| `checkbox`           | 3      | Checkbox    |
| `date`               | 4      | Date        |
| `datetime`           | 5      | Date/Time   |
| `number` / `integer` | 6      | Integer     |
| `decimal`            | 7      | Decimal     |
| `link`               | 8      | Link        |
| `file`               | 9      | File        |
| `text100`            | 10     | Text (100)  |
| `text50`             | 11     | Text (50)   |
| `text20`             | 12     | Text (20)   |
| `text5`              | 13     | Text (5)    |
| `richtext` / `editor`| 14     | Editor      |
| `list` / `dropdown`  | 15     | List        |

Numeric TypeId is also accepted directly. Use `dw_product_field_type_list` to fetch the live list from your DW instance.

</details>

<details>
<summary><b>Troubleshooting</b></summary>

| Symptom                                          | Cause                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `DW_API_TOKEN not set` on startup                | `env` block missing or misplaced in the config - it belongs inside the server entry |
| `DW API error 401`                               | Token wrong, expired, or from a different instance                             |
| `DW API error 403` on some tools only            | API key lacks full access - recreate it with broader rights                     |
| `Non-JSON response`                              | `DW_BASE_URL` points at the frontend or a login redirect, not the Admin API root |
| `fetch failed` / `self-signed certificate`       | Remote host with an untrusted certificate, or DW not running                    |
| Tools missing after an upgrade                   | Client caches the old process - restart it fully                               |

</details>

## Development

```bash
npm install
npm run dev      # tsx, hot reload
npm run build    # tsc
npm run start    # compiled
```

```
src/
  index.ts    stdio entrypoint - env, process-level policy, transport
  server.ts   createServer() - registers every tool, knows no transport
  client.ts   DwClient - the three DW API calling conventions, documented in its header
  utils.ts    shared Zod and response helpers
  tools/      one module per concept, each exporting registerXTools(server, client)
```

A new tool module means one import and one entry in `registrars` in `server.ts`. A new tool needs `annotations` beside its description, or clients cannot tell whether it writes. The server version comes from `package.json`, so a release bumps one file. After changes, `npm run build` and restart your client - clients cache the tool list at startup.

A second transport (Streamable HTTP, for ChatGPT and the Responses API) is a new entrypoint beside `index.ts`, not a change to `server.ts`.

# degree-dynamicweb-mcp

[![npm](https://img.shields.io/npm/v/@degree-as/dynamicweb-mcp)](https://www.npmjs.com/package/@degree-as/dynamicweb-mcp)
[![node](https://img.shields.io/node/v/@degree-as/dynamicweb-mcp)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@degree-as/dynamicweb-mcp)](LICENSE)

MCP (Model Context Protocol) server for the DynamicWeb 10 Admin API. Gives any MCP-capable AI client or agent framework 45 tools to manage item types, fields, pages, paragraphs, products, and the PIM data model - without touching the DW Admin UI.

[Installation](#installation) · [Safety](#safety) · [Tools](#tools) · [Field type aliases](#field-type-aliases) · [Architecture](#architecture) · [Development](#development)

## Installation

- **Node.js 18+** (`node -v`)
- **A DynamicWeb 10 instance** reachable over HTTP, with the Admin API enabled
- **An API token** for it (step 1)

Nothing to clone or build - the server is published on npm and `npx` fetches it on first run.

### 1. Get a DW API token

In DynamicWeb Admin: **Settings > Developer > API Keys > New**. Give the key full access - the server reaches item types, pages, paragraphs, products, files, and the Swagger spec, so a narrowly scoped key fails on some tools. Copy the token; DW shows it once.

### 2. Add the server to your client

Every client wants the same four values - `npx`, the package, and two environment variables:

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

Only the file and the top-level key differ between clients:

| Client                 | File                                                                                            | Top-level key      |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ------------------ |
| Claude Code            | `.mcp.json` in the project                                                                      | `mcpServers`       |
| Claude Desktop         | `~/Library/Application Support/Claude/claude_desktop_config.json` · `%APPDATA%\Claude\…` (Win)   | `mcpServers`       |
| Cursor                 | `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global)                                    | `mcpServers`       |
| Windsurf               | `~/.codeium/windsurf/mcp_config.json`                                                            | `mcpServers`       |
| Cline                  | its MCP settings UI, or the same JSON                                                            | `mcpServers`       |
| VS Code / Copilot      | `.vscode/mcp.json`                                                                               | `servers`, and add `"type": "stdio"` |
| Zed                    | `settings.json`                                                                                  | `context_servers`, and add `"source": "custom"` |
| Continue.dev           | `~/.continue/config.yaml` (YAML, see below)                                                      | `mcpServers`       |

Claude Code can skip the file entirely (drop `-s project` to install it just for yourself):

```bash
claude mcp add dynamicweb -s project \
  --env DW_BASE_URL=https://your-dw-instance \
  --env DW_API_TOKEN=your-token \
  -- npx -y @degree-as/dynamicweb-mcp
```

<details>
<summary>Continue.dev, as YAML</summary>

```yaml
mcpServers:
  - name: dynamicweb
    command: npx
    args:
      - -y
      - "@degree-as/dynamicweb-mcp"
    env:
      DW_BASE_URL: https://your-dw-instance
      DW_API_TOKEN: your-token
```

</details>

### 3. Restart your client and verify

Clients spawn the server once and cache its tool list, so a restart is required. Then:

- **Claude Code** - run `/mcp`; `dynamicweb` should be listed as connected
- **Any client** - ask it to run `dw_area_list`. A list of your websites means the URL and token are both good.

### Environment variables

| Variable       | Required | Default                   | Notes                                                               |
| -------------- | -------- | ------------------------- | ------------------------------------------------------------------- |
| `DW_API_TOKEN` | yes      | -                         | Bearer token from **Settings > Developer > API Keys**                |
| `DW_BASE_URL`  | no       | `https://localhost:38547` | Instance root, no trailing slash. Default suits a local DW dev site  |

When `DW_BASE_URL` points at `localhost` or `127.0.0.1`, the server disables TLS verification so DW's self-signed dev certificate is accepted. Against any other host the certificate must be valid.

### Other agents and frameworks

The server has no client-specific behaviour - standard stdio MCP, tools only, no prompts, resources, or sampling - so any MCP-capable framework can drive it. Whatever the language, it needs the same four values:

| Setting | Value                            |
| ------- | -------------------------------- |
| command | `npx`                            |
| args    | `-y @degree-as/dynamicweb-mcp`   |
| env     | `DW_BASE_URL`, `DW_API_TOKEN`    |

**OpenAI Agents SDK (Python)** - the SDK spawns the process itself; the context manager owns its lifetime:

```python
from agents import Agent
from agents.mcp import MCPServerStdio

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

**OpenAI Agents SDK (JS/TS)** - same `MCPServerStdio` class from `@openai/agents`, but options are flat (`fullCommand` or `command`/`args`) and you call `await server.connect()` / `await server.close()` yourself. See the [MCP guide](https://openai.github.io/openai-agents-js/guides/mcp/) for the current option names.

**LangChain / LangGraph** - via the [`langchain-mcp-adapters`](https://github.com/langchain-ai/langchain-mcp-adapters) package, which converts MCP tools into LangChain tools. **Pydantic AI**, **Mastra**, **Vercel AI SDK**, and **n8n** each have their own stdio MCP client taking the same four values above.

#### ChatGPT and the OpenAI Responses API - not yet supported

These do not spawn a local process. OpenAI's servers call your MCP endpoint over HTTP:

```json
{
  "type": "mcp",
  "server_label": "dynamicweb",
  "server_url": "https://your-host/mcp",
  "headers": { "Authorization": "Bearer ..." },
  "require_approval": "never"
}
```

This server speaks stdio only, so that path needs a Streamable HTTP entrypoint plus an authentication story - the endpoint would be reachable from the public internet, and these tools include destructive ones (`dw_itemtype_clean_table`, `dw_product_bulk_discount`). Planned, not shipped. `src/server.ts` is already transport-agnostic so the server itself will not have to change.

### Troubleshooting

| Symptom                                          | Cause                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `DW_API_TOKEN not set` on startup                | `env` block missing or misplaced in the config - it belongs inside the server entry |
| `DW API error 401`                               | Token wrong, expired, or from a different instance                             |
| `DW API error 403` on some tools only            | API key lacks full access - recreate it with broader rights                     |
| `Non-JSON response`                              | `DW_BASE_URL` points at the frontend or a login redirect, not the Admin API root |
| `fetch failed` / `self-signed certificate`       | Remote host with an untrusted certificate, or DW not running                    |
| Tools missing after an upgrade                   | Client caches the old process - restart it fully                               |

### Run from source

Only needed to change the server itself:

```bash
git clone https://github.com/Degree-AS/degree-dynamicweb-mcp.git
cd degree-dynamicweb-mcp
npm install
npm run build
```

Then point the config at the build instead of `npx`:

```json
"command": "node",
"args": ["/absolute/path/to/degree-dynamicweb-mcp/dist/index.js"]
```

## Safety

These tools write to a live CMS. Of the 45, **23 only read**, 12 create or update, and **10 can destroy data**.

Every tool declares standard MCP [annotations](https://modelcontextprotocol.io/docs/concepts/tools) - `readOnlyHint`, `destructiveHint`, `idempotentHint` - so a client can warn before running one, or auto-approve the read-only ones. Whether it does is up to the client, not this server.

| Destructive tool             | What it destroys                                                        |
| ---------------------------- | ----------------------------------------------------------------------- |
| `dw_itemtype_delete`         | An item type, and access to content stored against it                   |
| `dw_field_delete`            | A field, and the values held in its column                              |
| `dw_itemtype_clean_table`    | Orphaned rows in an item type's table - run `dw_itemtype_usages` first   |
| `dw_page_delete`             | A page and its paragraphs                                               |
| `dw_paragraph_delete`        | A paragraph and its field values                                        |
| `dw_product_delete`          | One or more products                                                    |
| `dw_product_bulk_discount`   | Overwrites `DefaultPrice` across a whole group - no undo                 |
| `dw_product_category_delete` | A product category and its field definitions                            |
| `dw_product_field_delete`    | A product field and its stored values                                   |
| `dw_api_call`                | Anything - the caller picks the endpoint and method                     |

Point a client at a staging instance before production. There is no dry-run mode and no built-in confirmation step: the server does what it is asked.

## Tools

45 tools in eight groups. Names are prefixed `dw_` and grouped by the DW concept they act on. Read-only tools are marked as such via MCP annotations - see [Safety](#safety).

### Typical sequences

**A new item type, end to end.** Deploying XML does not touch the database, so the schema step is not optional:

```
dw_itemtype_create  →  dw_itemtype_sync_schema  →  dw_itemtype_health
```

**Populating content.** `set_fields` reads the item back and returns what it now holds, so a typo in a SystemName surfaces as an error listing the valid names rather than a silent no-op:

```
dw_page_create  →  dw_page_set_fields  →  (dw_page_get to confirm)
```

**Something these tools do not cover.** The Admin API has ~1800 endpoints; discovery reaches the rest:

```
dw_api_search "customer"  →  dw_api_endpoint_schema  →  dw_api_call
```

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

## Field Type Aliases

Item type fields and product fields use two unrelated type systems - editor class names for the former, integer `TypeId` for the latter. Both accept short aliases.

### Item type fields (`dw_field_save`, `dw_itemtype_create`)

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

### Product fields (`dw_product_field_save`)

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

## Architecture

```
src/
  index.ts          stdio entrypoint - reads env, applies process-level policy, connects the transport
  server.ts         createServer() - registers every tool; no transport knowledge
  client.ts         DwClient - HTTP client for Admin API, Update API, Delivery API
  utils.ts          Shared Zod helpers (jsonParam, numParam) and response helpers (prop, pascal)
  tools/
    itemTypes.ts    Item type CRUD, fields, restrictions, settings, editor discovery, schema health and sync
    pages.ts        Page and area management
    paragraphs.ts   Paragraph management (uses ParagraphNew + ParagraphSave)
    products.ts     Product CRUD, bulk discount, custom/category field value updates
    productSchema.ts Product categories and product field schema management
    files.ts        File and directory browsing
    delivery.ts     Read-only Delivery API
    discovery.ts    Swagger search, endpoint schema, raw API calls
```

### DW API surfaces

The DynamicWeb Admin API has three calling conventions:

1. **Admin API** (`GET /admin/api/{Endpoint}`) - queries with URL params
2. **Command API** (`POST /admin/api/{Endpoint}`) - mutations with `{ Model: {...} }` body. Delete commands use flat body (no Model wrapper).
3. **Update API** (`POST /Admin/Api/{Endpoint}?Query.Type={Type}`) - updates existing records with `{ QueryData: {...}, model: {...} }` body

`DwClient` has dedicated methods for each: `get()`, `post()`, `command()`, `update()`, `delivery()`.

## Development

```bash
npm run dev      # Run with tsx (hot reload)
npm run build    # Compile TypeScript
npm run start    # Run compiled version
```

After changes, `npm run build` and restart your MCP client to pick up the new tool list.

`server.ts` builds the server and `index.ts` connects stdio, so a second transport - Streamable HTTP, for ChatGPT and the Responses API - is a new entrypoint rather than a change to either. Adding a tool module means one import and one entry in the `registrars` array in `server.ts`; a new tool needs `annotations` alongside its description, or clients cannot tell whether it writes.

The server version is read from `package.json`, so a release bumps one file.

# degree-dynamicweb-mcp

MCP (Model Context Protocol) server for DynamicWeb 10 Admin API. Gives Claude Code full access to manage DynamicWeb item types, fields, pages, paragraphs, and API discovery - without touching the DW Admin UI.

## Tools

### Item Types

| Tool                              | Description                                                        |
| --------------------------------- | ------------------------------------------------------------------ |
| `dw_itemtype_list`                | List all item types                                                |
| `dw_itemtype_get`                 | Get item type details and restrictions                             |
| `dw_itemtype_create`              | Create item type with fields, groups, and restrictions in one call |
| `dw_itemtype_update_settings`     | Update settings (name, category, icon, availability, etc.)         |
| `dw_itemtype_update_restrictions` | Update restrictions (allowed parents, children, websites, etc.)    |
| `dw_itemtype_delete`              | Delete an item type                                                |

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

### Products

| Tool                      | Description                                                                |
| ------------------------- | -------------------------------------------------------------------------- |
| `dw_product_list`         | List products, optionally filtered by group or search                      |
| `dw_product_get`          | Get a single product (full model incl. CustomFields/CategoryFields)        |
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

## Setup

### 1. Get a DW API token

In DynamicWeb Admin, go to **Settings > Developer > API Keys** and create a new key with full access.

### 2. Configure your AI client

<details>
<summary><b>Claude Code</b></summary>

Add to `.mcp.json` in your project:

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

</details>

<details>
<summary><b>Claude Desktop</b></summary>

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

</details>

<details>
<summary><b>Cursor</b></summary>

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

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

</details>

<details>
<summary><b>VS Code / GitHub Copilot</b></summary>

Add `.vscode/mcp.json` to your project (note: uses `servers`, not `mcpServers`):

```json
{
  "servers": {
    "dynamicweb": {
      "type": "stdio",
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

</details>

<details>
<summary><b>Windsurf</b></summary>

Edit `~/.codeium/windsurf/mcp_config.json`:

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

</details>

<details>
<summary><b>Cline</b></summary>

Configure via Cline's MCP settings UI, or add to its config:

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

</details>

<details>
<summary><b>Zed</b></summary>

Add to Zed's `settings.json` (note: uses `context_servers`):

```json
{
  "context_servers": {
    "dynamicweb": {
      "source": "custom",
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

</details>

<details>
<summary><b>Continue.dev</b></summary>

Add to `~/.continue/config.yaml`:

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

### 3. Restart your client

The MCP server starts automatically when your AI client loads.

### Local development

If you want to run from source instead of the published package:

```bash
git clone https://github.com/Degree-AS/degree-dynamicweb-mcp.git
cd degree-dynamicweb-mcp
npm install
npm run build
```

Then use `"command": "node", "args": ["/path/to/degree-dynamicweb-mcp/dist/index.js"]` in `.mcp.json`.

## Field Type Aliases

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
  index.ts          Entry point - reads config from env, registers tools
  client.ts         DwClient - HTTP client for Admin API, Update API, Delivery API
  utils.ts          Shared Zod helpers (jsonParam, numParam) and string helpers (pascal)
  tools/
    itemTypes.ts    Item type CRUD, fields, restrictions, settings, editor discovery
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

After changes, run `npm run build` and restart Claude Code to pick up the new version.

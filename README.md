# degree-dynamicweb-mcp

MCP (Model Context Protocol) server for DynamicWeb 10 Admin API. Gives Claude Code full access to manage DynamicWeb item types, fields, pages, paragraphs, and API discovery - without touching the DW Admin UI.

## Tools

### Item Types

| Tool | Description |
|---|---|
| `dw_itemtype_list` | List all item types |
| `dw_itemtype_get` | Get item type details and restrictions |
| `dw_itemtype_create` | Create item type with fields, groups, and restrictions in one call |
| `dw_itemtype_update_settings` | Update settings (name, category, icon, availability, etc.) |
| `dw_itemtype_update_restrictions` | Update restrictions (allowed parents, children, websites, etc.) |
| `dw_itemtype_delete` | Delete an item type |

### Fields

| Tool | Description |
|---|---|
| `dw_field_list` | List fields on an item type |
| `dw_field_save` | Add or update a field |
| `dw_field_delete` | Delete a field |
| `dw_field_types` | List all available editor types from the DW instance (not hardcoded) |

### Pages

| Tool | Description |
|---|---|
| `dw_page_list` | List pages, optionally filtered by area or parent |
| `dw_page_get` | Get a page with all item fields |
| `dw_page_create` | Create a page under a parent |
| `dw_page_set_fields` | Set item field values on a page |
| `dw_page_delete` | Delete a page |
| `dw_area_list` | List all areas (websites) |

### Paragraphs

| Tool | Description |
|---|---|
| `dw_paragraph_list` | List paragraphs on a page |
| `dw_paragraph_get` | Get a paragraph with all item fields |
| `dw_paragraph_create` | Create a paragraph on a page |
| `dw_paragraph_set_fields` | Set item field values on a paragraph |
| `dw_paragraph_delete` | Delete a paragraph |

### Files

| Tool | Description |
|---|---|
| `dw_files_list` | List files in a directory, optionally filtered by extension |
| `dw_files_directories` | List subdirectories |

### Delivery API (read-only)

| Tool | Description |
|---|---|
| `dw_content_areas` | Fetch areas from Delivery API |
| `dw_content_pages` | Fetch pages with content |
| `dw_content_paragraphs` | Fetch paragraphs with content |

### API Discovery

| Tool | Description |
|---|---|
| `dw_api_search` | Search the Swagger spec for endpoints by keyword |
| `dw_api_endpoint_schema` | Get request/response schema for an endpoint |
| `dw_api_call` | Raw call to any Admin API endpoint |

## Setup

### 1. Install

```bash
npm install
npm run build
```

### 2. Get a DW API token

In DynamicWeb Admin, go to **Settings > API Keys** and create a new key with full access.

### 3. Configure in Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "degree-dynamicweb": {
      "command": "node",
      "args": ["<path-to>/degree-dynamicweb-mcp/dist/index.js"],
      "env": {
        "DW_BASE_URL": "https://localhost:38547",
        "DW_API_TOKEN": "<your-token-here>"
      }
    }
  }
}
```

Alternatively, export `DW_API_TOKEN` in `~/.zshrc` and reference it with shell substitution.

### 4. Restart Claude Code

The MCP server starts automatically when Claude Code loads.

## Field Type Aliases

When creating fields, you can use short aliases instead of full .NET class names:

| Alias | Editor |
|---|---|
| `text` | TextEditor |
| `longtext` | LongTextEditor |
| `richtext` | RichTextEditor |
| `richtextlight` | RichTextEditorLight |
| `file` / `image` | FileEditor |
| `folder` | FolderEditor |
| `media` | MediaEditor |
| `link` | LinkEditor |
| `itemlink` | ItemLinkEditor |
| `itemrelation` | ItemRelationListEditor |
| `number` | IntegerEditor |
| `decimal` | DecimalEditor |
| `date` | DateEditor |
| `datetime` | DateTimeEditor |
| `checkbox` | CheckboxEditor |
| `checkboxlist` | CheckboxListEditor |
| `dropdown` | DropDownListEditor |
| `radiolist` | RadioButtonListEditor |
| `editablelist` | EditableListEditor |
| `color` | ColorEditor |
| `colorswatch` | ColorSwatchEditor |
| `itemtype` | ItemTypeEditor |
| `itemtab` | ItemTypeTabEditor |
| `user` | UserEditor |
| `singleuser` | SingleUserEditor |
| `usergroup` | SingleUserGroupEditor |
| `geolocation` | GeolocationEditor |
| `googlefont` | GoogleFontEditor |
| `hidden` | HiddenFieldEditor |
| `password` | PasswordEditor |

Any full .NET editor class name is also accepted. Use `dw_field_types` to discover all available editors from your DW instance.

## Architecture

```
src/
  index.ts          Entry point - reads config from env, registers tools
  client.ts         DwClient - HTTP client for Admin API, Update API, Delivery API
  utils.ts          Shared Zod helpers (jsonParam, numParam)
  tools/
    itemTypes.ts    Item type CRUD, fields, restrictions, settings, editor discovery
    pages.ts        Page and area management
    paragraphs.ts   Paragraph management (uses ParagraphNew + ParagraphSave)
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

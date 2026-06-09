# Bruno MCP Server

A Model Context Protocol (MCP) server for generating Bruno API testing files programmatically.

## Overview

Bruno MCP Server enables you to create, manage, and generate Bruno API testing collections, environments, and requests through standardized MCP tools. This allows for automated setup of API testing workflows and integration with Claude and other MCP-compatible clients.

## Recent Improvements

This release fixes the build, hardens file-writing security, and completes
tools that previously did nothing. See [SECURITY.md](./SECURITY.md) for the full
security review.

**Build & run**
- `npm run build` now uses a transpile-only build (`scripts/build.mjs`); the
  previous `tsc` build ran out of memory on this project (deep zod + MCP SDK
  type recursion). A separate `npm run typecheck` keeps static checking.
- `npm run dev` now uses `tsx` (was `ts-node-esm`, which failed on Node 22 ESM).

**Security** (details in [SECURITY.md](./SECURITY.md))
- **Path traversal fixed** — a crafted request `folder`, collection/folder name,
  or environment name can no longer escape its directory to write files
  elsewhere (`src/bruno/paths.ts`).
- **Serialization fixed** — `.bru` files are now produced by Bruno's official
  `@usebruno/lang` serializer. The old hand-rolled generator emitted malformed,
  quote-wrapped values and could corrupt files (a value containing `'''` made
  Bruno reject the file).

**Tools that now actually work**
- `add_test_script` parses, edits, and rewrites the `.bru` file (it previously
  reported success without writing anything).
- `list_collections` scans for `bruno.json` (was a stub).
- `get_collection_stats` counts requests by HTTP method (was always empty).

**Tests** — a `node:test` suite (24 tests) covering path-traversal regressions,
serialization correctness/injection, and manager behaviors. Run with `npm test`.

## Features

- **📁 Collection Management**: Create and organize Bruno collections
- **🌍 Environment Configuration**: Manage multiple environments (dev, staging, prod)
- **🔧 Request Generation**: Generate .bru files for all HTTP methods
- **🔐 Authentication Support**: Bearer tokens, Basic auth, API keys (OAuth 2.0 / Digest accepted but not yet written to file — see [SECURITY.md](./SECURITY.md))
- **📝 Test Scripts**: Add pre/post request scripts and assertions
- **🔄 CRUD Operations**: Generate complete CRUD request sets
- **📊 Collection Statistics**: Analyze existing collections
- **🛡️ Path-traversal safe**: File writes are confined to the target collection

## Installation

```bash
# Clone the repository
git clone https://github.com/teeppiphat/bruno-mcp.git
cd bruno-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Client Integration

The Bruno MCP Server can be integrated with various AI clients that support the Model Context Protocol:

### Quick Setup for Claude Desktop

1. **Edit Claude Desktop config file:**
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%/Claude/claude_desktop_config.json`
   - **Linux:** `~/.config/Claude/claude_desktop_config.json`

2. **Add Bruno MCP Server:**
   ```json
   {
     "mcpServers": {
       "bruno-mcp": {
         "command": "node",
         "args": ["/absolute/path/to/bruno-mcp/dist/index.js"],
         "env": {}
       }
     }
   }
   ```

3. **Restart Claude Desktop**

### Supported Clients

- ✅ **Claude Desktop App** - Full support
- ✅ **Claude Code (VS Code)** - Full support  
- ✅ **Continue** - Tools and resources
- ✅ **Cline** - Tools and resources
- ✅ **LM Studio** - Tools support
- ✅ **MCP Inspector** - Development/testing
- ✅ **Custom MCP Clients** - via SDK

**📖 For detailed integration instructions with all clients, see [INTEGRATION.md](./INTEGRATION.md)**

## Usage

### With Claude Code or MCP Inspector

1. Start the MCP server:
```bash
npm start
```

2. Use the MCP Inspector to test tools:
```bash
npx @modelcontextprotocol/inspector
```

### Available MCP Tools

#### `create_collection`
Create a new Bruno collection with configuration.

**Parameters:**
- `name` (string): Collection name
- `description` (string, optional): Collection description
- `baseUrl` (string, optional): Default base URL
- `outputPath` (string): Directory to create collection
- `ignore` (array, optional): Files to ignore

**Example:**
```json
{
  "name": "my-api-tests",
  "description": "API tests for my application", 
  "baseUrl": "https://api.example.com",
  "outputPath": "./collections"
}
```

#### `create_environment`
Create environment configuration files.

**Parameters:**
- `collectionPath` (string): Path to Bruno collection
- `name` (string): Environment name
- `variables` (object): Environment variables

**Example:**
```json
{
  "collectionPath": "./collections/my-api-tests",
  "name": "production",
  "variables": {
    "baseUrl": "https://api.example.com",
    "apiKey": "prod-key-123",
    "timeout": 30000
  }
}
```

#### `create_request`
Generate .bru request files.

**Parameters:**
- `collectionPath` (string): Path to collection
- `name` (string): Request name
- `method` (string): HTTP method
- `url` (string): Request URL
- `headers` (object, optional): HTTP headers
- `body` (object, optional): Request body
- `auth` (object, optional): Authentication config
- `folder` (string, optional): Folder organization

**Example:**
```json
{
  "collectionPath": "./collections/my-api-tests",
  "name": "Get User Profile",
  "method": "GET",
  "url": "{{baseUrl}}/users/{{userId}}",
  "headers": {
    "Authorization": "Bearer {{token}}"
  },
  "folder": "users"
}
```

#### `create_crud_requests`
Generate complete CRUD operation sets.

**Parameters:**
- `collectionPath` (string): Path to collection
- `entityName` (string): Entity name (e.g., "Users")
- `baseUrl` (string): API base URL
- `folder` (string, optional): Folder name

**Example:**
```json
{
  "collectionPath": "./collections/my-api-tests",
  "entityName": "Products",
  "baseUrl": "{{baseUrl}}/api/v1",
  "folder": "products"
}
```

#### `create_test_suite`
Generate multiple related requests at once as a suite.

**Parameters:**
- `collectionPath` (string): Path to collection
- `suiteName` (string): Suite (folder) name
- `requests` (array): Request definitions (`name`, `method`, `url`, optional `headers`/`body`/`auth`/`folder`)
- `dependencies` (array, optional): Cross-request variable dependencies

#### `add_test_script`
Add a script to an existing request. Parses the `.bru`, appends the script to
the right block, and rewrites it (rejects non-`.bru` targets).

**Parameters:**
- `bruFilePath` (string): Path to .bru file
- `scriptType` (string): Script type (pre-request, post-response, tests)
- `script` (string): JavaScript code

#### `list_collections`
Scan a directory for Bruno collections (folders containing `bruno.json`).

**Parameters:**
- `path` (string): Directory to scan

#### `get_collection_stats`
Get statistics about a collection (total requests, counts by HTTP method,
folders, environments).

**Parameters:**
- `collectionPath` (string): Path to collection

## Generated File Structure

```
my-collection/
├── bruno.json              # Collection configuration
├── environments/           # Environment files
│   ├── development.bru
│   ├── staging.bru
│   └── production.bru
├── auth/                   # Authentication requests
│   ├── login.bru
│   └── get-profile.bru
└── users/                  # User management
    ├── get-all-users.bru
    ├── get-user-by-id.bru
    ├── create-user.bru
    ├── update-user.bru
    └── delete-user.bru
```

## Bruno BRU File Format

Generated .bru files follow the Bruno markup language specification:

```bru
meta {
  name: Get Users
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}/users
  body: none
  auth: none
}

headers {
  Content-Type: application/json
  Authorization: Bearer {{token}}
}

script:pre-request {
  bru.setVar("timestamp", Date.now());
}

script:post-response {
  if (res.status === 200) {
    bru.setVar("userId", res.body[0].id);
  }
}

tests {
  test("Status should be 200", function() {
    expect(res.status).to.equal(200);
  });
}
```

## Testing

### Run the test suite
```bash
npm test
```

Builds the project, then runs the [`node:test`](https://nodejs.org/api/test.html)
suite (24 tests) in `tests/`:
- `paths.test.mjs` — path-traversal guard (`resolveWithin`)
- `generator.test.mjs` — serialization correctness + injection regressions
- `managers.test.mjs` — request/collection/environment behavior, including that
  a traversal `folder` is rejected and no file leaks outside the collection

### Run Integration Tests
```bash
npm run test:integration   # builds, then runs the example collections
```

### Test with Bruno CLI
```bash
# Generate a collection first
# Then run tests with Bruno CLI
bruno-cli run ./collections/my-api-tests/
```

## Security

This server writes files to locations derived from tool inputs. Sub-paths
(request `folder`, collection/folder names, environment names) are confined to
their parent directory, and serialization uses Bruno's official `@usebruno/lang`
to avoid injection/corruption. The top-level `outputPath`/`collectionPath` you
pass are intentional, caller-chosen roots — for untrusted deployments, sandbox
the process at the OS level (dedicated user / container).

See **[SECURITY.md](./SECURITY.md)** for the full review, fixes, and residual notes.

## Examples

See the `examples/` directory for complete usage examples:

- `examples/jsonplaceholder/` - JSONPlaceholder API testing
- `examples/USAGE_EXAMPLES.md` - Worked usage scenarios

## Development

### Project Structure

```
src/
├── index.ts              # Main entry point
├── server.ts             # MCP server implementation
├── bruno/
│   ├── types.ts          # TypeScript interfaces
│   ├── generator.ts      # BRU file generator (delegates to @usebruno/lang)
│   ├── collection.ts     # Collection management
│   ├── environment.ts    # Environment management
│   ├── request.ts        # Request builder
│   └── paths.ts          # Path-traversal-safe path resolution
```

### Building

```bash
npm run build      # Transpile src/ -> dist/ (transpile-only, see note below)
npm run typecheck  # Type-check with tsc --noEmit
npm run dev        # Development mode
npm run clean      # Clean build artifacts
```

> **Note:** `npm run build` uses a transpile-only build (`scripts/build.mjs`)
> rather than `tsc`. The combination of zod's deeply-recursive inferred types
> and the MCP SDK generics can drive the type checker into a multi-GB blow-up on
> some Node builds. Type errors are still surfaced separately via
> `npm run typecheck` on machines/CI where the checker fits in memory.

### Code Quality

```bash
npm run lint       # ESLint
npm run format     # Prettier
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Links

- [Bruno API Client](https://www.usebruno.com/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Bruno Documentation](https://docs.usebruno.com/)
- [BRU Language Specification](https://github.com/brulang/bru-lang)

---

**Generated with Bruno MCP Server** 🚀
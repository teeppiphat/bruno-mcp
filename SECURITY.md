# Security Review

Security review of the Bruno MCP server. This server writes files to locations
derived from tool inputs supplied by an MCP client (an LLM), so the primary
threat is **unintended file writes** outside the area the user intended.

## Findings & fixes

### 1. Path traversal → arbitrary file write (HIGH) — FIXED

**Before:** The `folder` parameter of `create_request` was joined into the path
with no sanitization (`request.ts`), so a value like
`folder: "../../../../etc/cron.d"` wrote a `.bru` file outside the collection
root. Demonstrated: a request was written to `…/ESCAPED_DIR/escape.bru`,
entirely outside the target collection. `createFolder` and the collection/
environment names had the same class of weakness.

**Fix:** Added `src/bruno/paths.ts#resolveWithin(base, ...segments)`, which
resolves the target and throws `PATH_TRAVERSAL` if it escapes `base` via `..`
or an absolute segment. Applied to request file paths, `createFolder`,
collection creation, and environment files. Environment-name validation also
now rejects `..`.

> Note on scope: the top-level `outputPath` / `collectionPath` a caller passes
> are *intentional* roots — an MCP that writes where you tell it is working as
> designed. The fix confines the **sub-paths** (folder, name) within those
> roots; it does not (and should not) restrict where the root itself may be.
> If you deploy this in an untrusted context, run the process under an OS
> account whose filesystem access is already limited.

### 2. BRU serialization injection / corruption (MEDIUM) — FIXED

**Before:** `.bru` files were produced by hand-built string concatenation with
a single-quote escaping scheme (`generator.ts`, `environment.ts`). This was not
Bruno's actual format, with two consequences:

- **Malformed output:** values were wrapped in quotes (`name: 'X'`), which
  Bruno parses back as the literal string `'X'` (quotes included).
- **File corruption / breakout:** a value containing `'''` closed the
  multiline-string delimiter early, injecting structural tokens. Confirmed by
  feeding the output to Bruno's own parser (`@usebruno/lang`), which **rejected
  the file as invalid**.

**Verification of the worst case (RCE-when-run):** A crafted request `body`
attempting to inject a `script:pre-request { … }` sibling block (Bruno executes
those as JS at run time) was tested against Bruno's real parser. The injected
text stays **contained inside the body value** — Bruno captures the whole
textblock greedily — so block-injection RCE was **not** reproducible. Severity
is therefore corruption/correctness, not code execution.

**Fix:** Serialization now delegates to Bruno's official `@usebruno/lang`
(`jsonToBruV2` / `envJsonToBruV2`), which guarantees round-trip-correct output
and removes the whole class of escaping bugs. Regression tests in
`tests/generator.test.mjs` cover the `'''` case and the body-injection case.

### 3. Tools that returned success without doing the work (correctness) — FIXED

- `add_test_script` returned `✅` while writing **nothing**. Now actually parses
  the `.bru`, appends the script to the correct block, re-serializes, and
  rejects non-`.bru` targets.
- `list_collections` was a "future version" stub. Now scans for `bruno.json`.
- `get_collection_stats.requestsByMethod` was always empty. Now parses each
  request and counts by method.

## Residual risk / hardening notes

- `add_test_script` and the `*Path` inputs read/write at caller-specified
  locations by design; the `.bru` extension check on `add_test_script` is a
  guard rail, not a sandbox.
- There is no global write-root confinement. For untrusted deployments, sandbox
  at the OS level (dedicated user, container, or chroot).
- Known limitation (pre-existing, not security): `create_request`'s
  `buildBruFile` only populates `bearer`, `basic`, and `api-key` auth configs;
  `oauth2`/`digest` are accepted by the schema but their config fields are not
  yet written into the auth block.
- `npm run typecheck` (`tsc --noEmit`) can exhaust memory on some Node builds
  due to deep zod type recursion; the build uses transpile-only
  (`scripts/build.mjs`). Type errors are still surfaced by the editor/CI where
  the checker fits in memory.

## Running the security tests

```bash
npm test   # builds, then runs node:test — includes path-traversal and
           # serialization-injection regression tests
```

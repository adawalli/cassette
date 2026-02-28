# Developer Guide

## Setup

```bash
bun install
cp .env.example .env   # fill in OPENAI_API_KEY
```

## Common commands

```bash
bun test                          # run all tests
bun test test/processor.test.ts   # run a single test file
bun run index.ts --help           # run from source
bun run build                     # compile to dist/
```

## Running from source vs. built output

During development, run directly with Bun - no build step needed:

```bash
bun run index.ts --once
```

After building (`bun run build`), the compiled binary is at `dist/index.js`:

```bash
bun dist/index.js --once
```

## Adding a dependency

```bash
bun add <package>          # runtime dep
bun add -d <package>       # dev dep
```

## Schemas and types

`src/schemas.ts` is the single source of truth for config shape and result types. Any new config field goes there first - the Zod schema drives both runtime validation and TypeScript types.

## LLM in tests

The `LlmClient` interface (`src/llm.ts`) is always injected, never imported directly in tests. To mock it:

```ts
const mockLlm: LlmClient = { complete: async () => "mock output" };
```

## Adding a new transcript format

1. Add a parser in `src/` (e.g. `src/docx-extract.ts`) that returns `TranscriptUnit[]`
2. Extend the file extension check in `src/processor.ts`
3. Update the `include_glob` default in `src/schemas.ts` if appropriate
4. Add tests mirroring the pattern in `test/vtt-extract.test.ts`

## Debug logging

Set `LOG_LEVEL=debug` to see verbose output:

```bash
LOG_LEVEL=debug bun run index.ts --once
```

Or pass `--debug` as a CLI flag.

---

## Publishing to npm

The package is published as `@cassette-meetings/cli` under the `cassette-meetings` npm org.

### One-time setup

1. Create an account at https://npmjs.com if you don't have one
2. Create the `cassette-meetings` org at https://www.npmjs.com/org/create
3. Log in locally: `npm login`

### Publishing a new version

1. Bump the version in `package.json` following semver:
   - Patch (`0.1.1`) - bug fixes only
   - Minor (`0.2.0`) - new features, backwards compatible
   - Major (`1.0.0`) - breaking changes

2. Dry-run to check what will be included:
   ```bash
   npm pack --dry-run
   ```
   Should only list files under `dist/`, plus `README.md` and `LICENSE`.

3. Publish:
   ```bash
   npm publish --access public
   ```
   `prepublishOnly` runs `bun test && bun run build` automatically before publishing.

4. Tag the release in git:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

### After publishing

Verify the release:

```bash
npm info @cassette-meetings/cli
```

Test a clean install:

```bash
cd $(mktemp -d)
bun add @cassette-meetings/cli
bunx cassette --help
```

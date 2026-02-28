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

The package is published as `@cassette-meetings/cli` under the `cassette-meetings` npm org. Publishing is automated via GitHub Actions using [NPM Trusted Publishing](https://docs.npmjs.com/generating-provenance-statements) (OIDC) - no tokens or secrets required.

### One-time setup (per package maintainer account)

1. Go to https://www.npmjs.com/package/@cassette-meetings/cli
2. Navigate to **Settings > Trusted publishing**
3. Click **Add trusted publisher**, select GitHub Actions, and fill in:
   - **GitHub org/user**: `adawalli`
   - **Repository**: `cassette`
   - **Workflow filename**: `publish.yml`
4. Optionally enable **"Disallow tokens"** to block all classic-token publishes

### Publishing a new version

1. Bump the version in `package.json` following semver:
   - Patch (`0.1.1`) - bug fixes only
   - Minor (`0.2.0`) - new features, backwards compatible
   - Major (`1.0.0`) - breaking changes

2. Commit and push:
   ```bash
   git add package.json
   git commit -m "chore: bump version to X.Y.Z"
   git push origin main
   ```

3. Go to [GitHub Releases](https://github.com/adawalli/cassette/releases) and click **Draft a new release**:
   - Set the tag to `vX.Y.Z` (e.g. `v0.2.0`) - GitHub creates it automatically
   - Write release notes
   - Click **Publish release**

4. The `publish.yml` workflow fires automatically and publishes to npm with provenance attestations.

### After publishing

Verify the release:

```bash
npm info @cassette-meetings/cli
```

Check provenance at: `https://www.npmjs.com/package/@cassette-meetings/cli?activeTab=provenance`

Test a clean install:

```bash
cd $(mktemp -d)
bun add @cassette-meetings/cli
bunx cassette --help
```

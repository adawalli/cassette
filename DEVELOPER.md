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
bun test --coverage               # run tests with coverage report
bun run index.ts --help           # run from source
bun run build                     # compile to dist/
```

Coverage also runs automatically during `prepublishOnly`, so every npm publish includes a passing coverage check.

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

The package is published as `@cassette-meetings/cli` under the `cassette-meetings` npm org. The release process is fully automated via two GitHub Actions workflows - you never manually bump versions or publish.

### How it works

**`release-please.yml`** runs on every push to `main`. It analyzes commits since the last release and maintains an open "Release PR" (titled e.g. `chore(main): release 0.1.1`). That PR contains:
- The version bump in `package.json`
- An updated `CHANGELOG.md`

**`publish.yml`** triggers when release-please creates a GitHub Release (which happens automatically when the Release PR is merged). It runs tests, builds, and publishes to npm using OIDC (no tokens required).

### Release flow

1. Merge your PRs to `main` as normal
2. release-please automatically opens/updates a Release PR - no action needed from you
3. When you're ready to ship, review and merge the Release PR
4. The GitHub Release and npm publish happen automatically

That's it. No manual version bumps, no manual tagging, no `npm publish` locally.

### Controlling the version bump

Commit message prefixes determine the bump type:

| Prefix | Bump | Example |
|--------|------|---------|
| `fix:` | patch (`0.1.0` → `0.1.1`) | `fix: handle empty VTT files` |
| `feat:` | minor (`0.1.0` → `0.2.0`) | `feat: add JSON output format` |
| `feat!:` or `BREAKING CHANGE:` in body | major (`0.1.0` → `1.0.0`) | `feat!: rename config field` |

Other prefixes (`chore:`, `docs:`, `ci:`, etc.) appear in the changelog but don't trigger a release on their own.

### Release infrastructure files

These files are managed automatically by the release-please bot - **do not edit them manually**:

- `.release-please-manifest.json` - tracks the last released version; updated by the bot on each release
- `release-please-config.json` - static config telling release-please this is a Node package
- `CHANGELOG.md` - auto-generated on each release

### One-time npm setup (per maintainer)

Publishing uses OIDC Trusted Publishing - no npm tokens needed. If setting up on a new npm account:

1. Go to https://www.npmjs.com/package/@cassette-meetings/cli
2. Navigate to **Settings > Trusted publishing**
3. Click **Add trusted publisher**, select GitHub Actions, and fill in:
   - **GitHub org/user**: `adawalli`
   - **Repository**: `cassette`
   - **Workflow filename**: `publish.yml`

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
# or with npm:
npm install -g @cassette-meetings/cli
npx cassette --help
```

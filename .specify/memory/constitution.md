<!--
Sync Impact Report
- Version change: 1.0.0 -> 1.1.0 (MINOR - new principle added)
- Added principles: VI. Documentation Currency
- Modified principles: none
- Added sections: none
- Removed sections: none
- Templates requiring updates:
  - .specify/templates/plan-template.md ✅ no changes needed
    (Constitution Check is generic; new gate derived at plan time)
  - .specify/templates/spec-template.md ✅ no changes needed
  - .specify/templates/tasks-template.md ✅ no changes needed
- No command templates exist (.specify/templates/commands/) - N/A
- Follow-up TODOs: none
-->

# Cassette Constitution

## Core Principles

### I. Serial Processing

All file processing MUST run one-at-a-time through the
`SerialQueue`. This is intentional to avoid hammering the LLM API
with concurrent requests.

- New features MUST NOT introduce parallel LLM calls.
- Concurrency within a single file (e.g., chunked prompts) MUST be
  justified and gated behind explicit opt-in configuration.
- The `LlmClient` interface MUST remain the single point of contact
  with the LLM so rate-limiting behavior stays centralized.

### II. Test-First (NON-NEGOTIABLE)

Every behavior change MUST follow Red-Green-Refactor.

- Write a failing test before writing implementation code.
- Verify the test fails (Red phase) before proceeding.
- Write the minimal code to make the test pass (Green phase).
- Refactor only after green. Run the full suite before considering
  work complete.
- The LLM MUST always be mocked in tests - never hit the network.
- Tests live in `test/` and mirror the `src/` module structure.

### III. Bun-Only Runtime

Bun is the sole runtime, package manager, test runner, and bundler.

- MUST NOT use Node, npm, pnpm, Yarn, Vite, Jest, or any other
  runtime/toolchain.
- `bun test` is the only sanctioned test command.
- `bun install` is the only sanctioned install command.
- `bun build` is the only sanctioned build command.
- All CI and local workflows MUST use Bun exclusively.

### IV. Simplicity & YAGNI

Start with the simplest solution that works. Do not build for
hypothetical future requirements.

- Three similar lines of code are better than a premature abstraction.
- Do not add error handling or validation for scenarios that cannot
  occur in practice. Trust internal code and framework guarantees.
- Only validate at system boundaries: user input, external APIs,
  file I/O.
- Do not add feature flags or backwards-compatibility shims when the
  code can just be changed directly.
- Complexity MUST be justified in a PR description when introduced.

### V. Conventional Commits & Automated Releases

Commit messages directly control versioning via release-please.

- All commits MUST use conventional commit prefixes (`fix:`, `feat:`,
  `refactor:`, `chore:`, `docs:`, `test:`, `ci:`).
- `fix:` triggers a patch bump; `feat:` triggers a minor bump;
  `feat!:` or a `BREAKING CHANGE:` footer triggers a major bump.
- MUST NOT manually bump `package.json` version or create GitHub
  Releases - release-please handles both.
- MUST NOT use `--no-verify` with git commit.

### VI. Documentation Currency

Project documentation MUST be updated as part of implementing any
spec. Stale docs are treated as bugs.

- `CLAUDE.md` MUST be updated when a feature changes architecture,
  adds new modules, modifies data flow, alters configuration schema,
  or introduces new dependencies. The architecture descriptions in
  CLAUDE.md MUST reflect the current state of the codebase.
- `README.md` MUST be updated when a feature changes user-facing
  behavior: new CLI flags, new config fields, changed defaults, or
  new usage patterns. The configuration examples and usage
  instructions MUST match what the code actually accepts.
- `config.example.yaml` MUST be updated when the config schema
  changes (new fields, removed fields, changed defaults).
- Documentation updates MUST be included in the same PR as the
  code change, not deferred to a follow-up.
- Implementation plans MUST include a Documentation section listing
  which docs need updating and what changes are required.

## Technology Constraints

- **Language**: TypeScript (strict mode via Bun's built-in support)
- **Runtime**: Bun >= 1.1.0
- **Config format**: YAML validated with Zod schemas
- **LLM integration**: OpenAI SDK with `p-retry` for retries
- **File matching**: picomatch for glob patterns
- **Supported input formats**: JSON (via JSONPath) and WebVTT
- **Credentials**: Environment variables only (`OPENAI_API_KEY`).
  Secrets MUST NOT be committed or stored in config files.

## Development Workflow

- Read existing code before proposing changes. Understand context
  before modifying.
- Prefer editing existing files over creating new ones.
- Do not create documentation files unless explicitly requested.
- Use dedicated file tools (Read, Edit, Write) over shell equivalents.
- Run `bun test` after every change to verify nothing is broken.
- When debugging failing tests, understand the root cause rather than
  patching symptoms to make the test pass.

## Governance

This constitution is the authoritative source of project standards.
All code changes, reviews, and architectural decisions MUST comply
with the principles above.

- **Amendments**: Any change to this constitution MUST be documented
  with a version bump, rationale, and updated date. Principle removals
  or redefinitions require a MAJOR version bump.
- **Compliance**: PRs SHOULD be checked against these principles
  before merge. Violations MUST be called out in review.
- **Runtime guidance**: See `CLAUDE.md` for additional development
  guidance that supplements (but does not override) this constitution.

**Version**: 1.1.0 | **Ratified**: 2026-03-23 | **Last Amended**: 2026-03-23

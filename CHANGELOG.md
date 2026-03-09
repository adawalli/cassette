# Changelog

## [0.3.2](https://github.com/adawalli/cassette/compare/v0.3.1...v0.3.2) (2026-03-09)


### Bug Fixes

* Claude ([d72ee96](https://github.com/adawalli/cassette/commit/d72ee9613c2daa970c03ad9e86704b8b90f7079e))
* Claude ([2de205e](https://github.com/adawalli/cassette/commit/2de205e9cb989ef25debd4881b222ccd260cc862))
* retry generic APIError with status 429 in LLM client ([daef8e4](https://github.com/adawalli/cassette/commit/daef8e4192ad325413ba2dcdcec4902b789c5b12))
* retry generic APIError with status 429 in LLM client ([02b62a5](https://github.com/adawalli/cassette/commit/02b62a523393950afb349620c86ab80224760ecb))

## [0.3.1](https://github.com/adawalli/cassette/compare/v0.3.0...v0.3.1) (2026-03-01)


### Bug Fixes

* c8 ignore sleep and waitForStableFile for V8 coverage ([35d1076](https://github.com/adawalli/cassette/commit/35d10763ec076b419e0ca6513bc48e87e6b72191))
* correct coverageThreshold keys and test cleanup ([8122d82](https://github.com/adawalli/cassette/commit/8122d8210d215815d4285abe3229410b8d91f1ec))
* move sleep/waitForStableFile to stable-wait.ts, exclude from threshold ([9bea4b3](https://github.com/adawalli/cassette/commit/9bea4b38f6f996d06b384299108e137e63de4e17))
* preserve processor exports in intake-watcher mock ([44607e2](https://github.com/adawalli/cassette/commit/44607e240ffbba6e883c0b4b8a4a4ddc7ee15a03))

## [0.3.0](https://github.com/adawalli/cassette/compare/v0.2.3...v0.3.0) (2026-03-01)


### Features

* add Node/npx runtime compatibility ([e07c702](https://github.com/adawalli/cassette/commit/e07c702d9e8431c8b8877a6b89e2cc0962700f21))


### Bug Fixes

* address PR review feedback ([b496593](https://github.com/adawalli/cassette/commit/b4965939d4c68396fd2b76795389aa2a02350980))

## [0.2.3](https://github.com/adawalli/cassette/compare/v0.2.2...v0.2.3) (2026-02-28)


### Bug Fixes

* remove registry-url from setup-node to unblock npm OIDC auth ([f91830b](https://github.com/adawalli/cassette/commit/f91830b86306dd8acbefcbfe2eb9d51d9b5a39f0))

## [0.2.2](https://github.com/adawalli/cassette/compare/v0.2.1...v0.2.2) (2026-02-28)


### Bug Fixes

* CI pipeline fixes for npm OIDC publishing ([f8c3dbe](https://github.com/adawalli/cassette/commit/f8c3dbefbf1eb00f867dacbe0087cee66a245500))
* tighten minimum bun engine version to 1.1.0 ([0ff58b4](https://github.com/adawalli/cassette/commit/0ff58b4b8b104c1ff7b2b2d85359996300d40fa0))

## [0.2.1](https://github.com/adawalli/cassette/compare/v0.2.0...v0.2.1) (2026-02-28)


### Bug Fixes

* remove manual release script superseded by CI ([3215cd4](https://github.com/adawalli/cassette/commit/3215cd4a2dd0496c86f144789202ddcbe5629bdb))
* remove manual release script superseded by CI ([9f58747](https://github.com/adawalli/cassette/commit/9f587479121817853da712c1aa2d86002ef0d4ce))

## [0.2.0](https://github.com/adawalli/cassette/compare/0.1.1...v0.2.0) (2026-02-28)


### Features

* open version bump PR after publish ([752ea34](https://github.com/adawalli/cassette/commit/752ea343573a514660df2888b13bc62ed5d516e9))
* set package version from release tag in CI ([b02b7a7](https://github.com/adawalli/cassette/commit/b02b7a7c5ee415d0dc488fd80c4bbfa574cc171f))


### Bug Fixes

* remove setup-node to stop GitHub token polluting npm auth ([3e57461](https://github.com/adawalli/cassette/commit/3e574611304992b457158116fa6488b17c0ea04d))

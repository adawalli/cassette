# Changelog

## [0.6.1](https://github.com/adawalli/cassette/compare/v0.6.0...v0.6.1) (2026-03-25)


### Bug Fixes

* address PR [#45](https://github.com/adawalli/cassette/issues/45) review feedback ([8020399](https://github.com/adawalli/cassette/commit/8020399fb72b6b80212fcbb378ee6320e5c85121))
* correct onIdle drain ordering, remove TOCTOU, consolidate handle types ([b8c0430](https://github.com/adawalli/cassette/commit/b8c043065294a55c94829348931195727247e59c))
* improve error isolation, type safety, and test determinism ([ae76d59](https://github.com/adawalli/cassette/commit/ae76d593c118c48e6441442ac16a951df39bb8eb))
* use consistent error formatting in executeIntake logging ([68cbaab](https://github.com/adawalli/cassette/commit/68cbaab15a216362960b720c7cea55f505f2872d))

## [0.6.0](https://github.com/adawalli/cassette/compare/v0.5.1...v0.6.0) (2026-03-23)


### Features

* add stem_strip config option to clean filenames before copy ([ecf969a](https://github.com/adawalli/cassette/commit/ecf969acad1b5c60c6ad1f5f14584148c74b7deb))
* add stem_strip config to clean filenames before copy ([a247cbf](https://github.com/adawalli/cassette/commit/a247cbf7107e5b0cf1824f75eec59259c534141a))


### Bug Fixes

* address PR review feedback for stem_strip ([3c801ab](https://github.com/adawalli/cassette/commit/3c801ab787e935ae88bebe61ea96af4d89e00cab))

## [0.5.1](https://github.com/adawalli/cassette/compare/v0.5.0...v0.5.1) (2026-03-23)


### Bug Fixes

* case-insensitive .md extension check and add coverage for empty-template fallback ([72ea30e](https://github.com/adawalli/cassette/commit/72ea30e8aa25ebf40b6c9185302026b8d7e66d85))
* prevent double .md extension in copy_filename template ([e1b9915](https://github.com/adawalli/cassette/commit/e1b99154cd69f4f51267b4685335f65e29f43e85))
* prevent double .md extension when copy_filename template includes .md ([220e9b8](https://github.com/adawalli/cassette/commit/220e9b8bf2db3ebc6babff95a632903b1678eef1))

## [0.5.0](https://github.com/adawalli/cassette/compare/v0.4.2...v0.5.0) (2026-03-23)


### Features

* add copy_filename template and fix stripDateFromStem separators ([d860b66](https://github.com/adawalli/cassette/commit/d860b6654eb74f9214741d4a38fa557486adab83))
* add copy_filename template and fix stripDateFromStem separators ([a098a15](https://github.com/adawalli/cassette/commit/a098a154d6919da62ace361d3d20997cf7fc4285))


### Bug Fixes

* address PR review feedback ([624c589](https://github.com/adawalli/cassette/commit/624c5896774e36c0cfbfeaea046e725565601172))
* address PR review feedback ([4b698fa](https://github.com/adawalli/cassette/commit/4b698fa458bd391ad4edfa2aab3851512ae02207))
* address PR review feedback ([35479ef](https://github.com/adawalli/cassette/commit/35479efbd8e975c4becf759e880e5aadfc306dea))

## [0.4.2](https://github.com/adawalli/cassette/compare/v0.4.1...v0.4.2) (2026-03-22)


### Bug Fixes

* add skipDir to walkDirectory and prune failed dir at traversal time ([3dc116d](https://github.com/adawalli/cassette/commit/3dc116d2e9a766ccd81040d2c1283a1d96510c85))
* consolidate path utils and fix module boundaries ([de2495f](https://github.com/adawalli/cassette/commit/de2495f59c7f6f277cc3291693d0314d592260ec))
* correct moveFile bare catch and executeIntake naming ([c3c0664](https://github.com/adawalli/cassette/commit/c3c06646013bcfbc33803439ced224a9706f4460))
* re-throw non-EXDEV rename errors in moveFile ([26fcb30](https://github.com/adawalli/cassette/commit/26fcb30fd76fcdfd765e33bdf59e530de20e62f8))

## [0.4.1](https://github.com/adawalli/cassette/compare/v0.4.0...v0.4.1) (2026-03-10)


### Bug Fixes

* honor retry-after headers and use exponential backoff for LLM rate limits ([80c3fc4](https://github.com/adawalli/cassette/commit/80c3fc4833acae34d12e5585fd6773cbf8e7d26f))
* skip sleep on exhausted retries and handle malformed retry-after headers ([7f59eec](https://github.com/adawalli/cassette/commit/7f59eecab93d707c373a5258b0e4d6d31f6a973b))
* use Headers.get() for retry-after header access ([fb0c88d](https://github.com/adawalli/cassette/commit/fb0c88d756b6e83e0257b9c5ee9fb125f145856e))

## [0.4.0](https://github.com/adawalli/cassette/compare/v0.3.2...v0.4.0) (2026-03-09)


### Features

* add --version flag and log version at startup ([e2234e3](https://github.com/adawalli/cassette/commit/e2234e3b692cdcf1ab1f5aa5ec015181f3ffe82c))
* add --version flag and log version at startup ([c98a87c](https://github.com/adawalli/cassette/commit/c98a87c58c6d96907623fa621f15dfd8f12a522f))

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

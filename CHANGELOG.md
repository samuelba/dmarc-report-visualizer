# Changelog

## [0.12.0](https://github.com/samuelba/dmarc-report-visualizer/compare/v0.11.0...v0.12.0) (2026-11-21)


### Features

* **auth:** add personal API tokens for MCP (disabled by default) ([47fe536](https://github.com/samuelba/dmarc-report-visualizer/commit/47fe536550647eddddd9ec86c5a063fdd30781dd))
* **frontend:** manage MCP API tokens in profile and settings ([9538a3f](https://github.com/samuelba/dmarc-report-visualizer/commit/9538a3ff8ba1378866bbb198d5df97523faaa8ec))
* mcp ([cfe73fe](https://github.com/samuelba/dmarc-report-visualizer/commit/cfe73fed1ca8dec1041db8e17a96c1351542d7a0))
* **mcp:** add read-only MCP server behind MCP_ENABLED ([96c5cb7](https://github.com/samuelba/dmarc-report-visualizer/commit/96c5cb74b80a9a59dd830dc0c8f3383776ad8ca3))


### Bug Fixes

* **auth:** answer bad SAML callbacks with 401 instead of 500 ([60a76f7](https://github.com/samuelba/dmarc-report-visualizer/commit/60a76f7ef35e897c2c170a6448f28b27ef3bb932))
* **auth:** answer bad SAML callbacks with 401 instead of 500 ([62ec9c8](https://github.com/samuelba/dmarc-report-visualizer/commit/62ec9c8dbec16df4f8d76d5e117bfc54a11ffb9b))
* **auth:** restore password login when SAML is disabled ([4e566d8](https://github.com/samuelba/dmarc-report-visualizer/commit/4e566d80b15fe19e11e707eebf833d983c22afb6))
* **backend:** correct SAML test URLs, cache flag parsing and backups ([f059e19](https://github.com/samuelba/dmarc-report-visualizer/commit/f059e1979e7a1c147b9ab5903a509b5f9875cb3c))
* **backend:** correct SAML test URLs, cache flag parsing and backups ([bac0dbd](https://github.com/samuelba/dmarc-report-visualizer/commit/bac0dbd4456bbbbec9ad5d7fdf5a8cf4e528c2ed))
* **mcp:** explain the DKIM/SPF missing filter and use it in prompts ([bc30ca4](https://github.com/samuelba/dmarc-report-visualizer/commit/bc30ca4603e33ff800acbb62c2736e1d77ea4eba))
* **mcp:** harden token management, rate limits and tool output ([8fc64ba](https://github.com/samuelba/dmarc-report-visualizer/commit/8fc64bae0cee15f72c05f1b60c2c28a12262821f))


### Performance Improvements

* **search:** stop loading raw report XML for every search row ([d9dc97c](https://github.com/samuelba/dmarc-report-visualizer/commit/d9dc97c8ff6faa8448a49919027b4cd5b9c0666f))

## [0.11.0](https://github.com/samuelba/dmarc-report-visualizer/compare/v0.10.1...v0.11.0) (2026-11-15)


### Features

* **reports:** badge every sender status and add unchecked (@samuelba) ([553be72](https://github.com/samuelba/dmarc-report-visualizer/commit/553be72b96b3686209af243f2c70f3e52d4de75c))
* **reports:** let admins trust unaligned report senders (@samuelba) ([25ab2cc](https://github.com/samuelba/dmarc-report-visualizer/commit/25ab2cc0616d7afb5ba829fea2b2181c151ffa56))
* **reports:** show sender verification status (@samuelba) ([d0b14a5](https://github.com/samuelba/dmarc-report-visualizer/commit/d0b14a5aa7198413e3ea76a03d8ef19b09e2f481))
* **reports:** show skeleton rows while loading and fix pagination URL (@samuelba) ([91c4db8](https://github.com/samuelba/dmarc-report-visualizer/commit/91c4db8b92cc7eaf5445479d4286a76224d31363))
* **security:** verify report senders with DKIM and ARC (@samuelba) ([f6f5cc5](https://github.com/samuelba/dmarc-report-visualizer/commit/f6f5cc5145c644b069b34f1084763a2d92079213))
* **settings:** persist selected tab in URL (@samuelba) ([66137d9](https://github.com/samuelba/dmarc-report-visualizer/commit/66137d9d7d2466d85c8a4d1b3d6a5be1ced1d36e))


### Bug Fixes

* **frontend:** revalidate index.html so new releases load (@samuelba) ([c6cf015](https://github.com/samuelba/dmarc-report-visualizer/commit/c6cf01540a0ff73aa50dd6d4db96ab20a3881243))
* **security:** bound report decompression size (@samuelba) ([29e0139](https://github.com/samuelba/dmarc-report-visualizer/commit/29e0139effb3a6aa34f9d226b731ecf577e8765f))
* **security:** enforce size limits on report ingestion paths (@samuelba) ([ba2375e](https://github.com/samuelba/dmarc-report-visualizer/commit/ba2375e2e2b2fce275f7833aca247a5481badc03))
* **security:** keep the first copy on report dedup collisions (@samuelba) ([1f5b7e4](https://github.com/samuelba/dmarc-report-visualizer/commit/1f5b7e43c2e8628dda514bb14a9bf5ff87bf8911))
* **security:** never name the relay as a report's sender (@samuelba) ([fcd1d5b](https://github.com/samuelba/dmarc-report-visualizer/commit/fcd1d5b82ad2e75b84b786dc4b6c346eba2c5412))
* **security:** only aligned copies replace stored reports (@samuelba) ([119506c](https://github.com/samuelba/dmarc-report-visualizer/commit/119506c1fde883cca10aa88e0df6a2afcd765d20))
* **security:** require admin for DMARC writes and hide IP lookup keys (@samuelba) ([d2fd23e](https://github.com/samuelba/dmarc-report-visualizer/commit/d2fd23e85d590a638ca7b7a3a851a60029ee19ed))
* **security:** require admin for report upload (@samuelba) ([2490973](https://github.com/samuelba/dmarc-report-visualizer/commit/24909731318cc6c2fc13d855b7f4c132e6a87587))
* **security:** trust one proxy hop and stop exposing postgres (@samuelba) ([2a2331b](https://github.com/samuelba/dmarc-report-visualizer/commit/2a2331bdeeea38bdf24107dd3fc443f38041d08c))


### Performance Improvements

* **reports:** cap records per report and insert in batches (@samuelba) ([f319b3a](https://github.com/samuelba/dmarc-report-visualizer/commit/f319b3abfc232a6e3041da8beedb705ca3f3f608))
* **reports:** skip records and raw XML in report list query (@samuelba) ([473e6d9](https://github.com/samuelba/dmarc-report-visualizer/commit/473e6d9de16c8d501b3a7b60f0a869fa135117d7))

## [0.10.1](https://github.com/samuelba/dmarc-report-visualizer/compare/v0.10.0...v0.10.1) (2026-11-13)


### Bug Fixes

* **auth:** separate JWT signing keys and reject wrong token types (@samuelba) ([93f3f9e](https://github.com/samuelba/dmarc-report-visualizer/commit/93f3f9e62da760a68d97b0ceb4405f990e19fb2a))
* **security:** decouple TOTP and SMTP encryption keys from JWT_SECRET (@samuelba) ([565d8bb](https://github.com/samuelba/dmarc-report-visualizer/commit/565d8bb10e970e478b16d4416b4538be7c56c413))

## [0.10.0](https://github.com/samuelba/dmarc-report-visualizer/compare/v0.9.0...v0.10.0) (2026-11-08)


### Features

* **imap:** add IMAP support for downloading DMARC reports (@samuelba) ([5a3fc4e](https://github.com/samuelba/dmarc-report-visualizer/commit/5a3fc4e6f0ede6b3546445772286fdda276169ec))


### Bug Fixes

* **imap:** keep one failure copy per attachment instead of one per attempt (@samuelba) ([f769d24](https://github.com/samuelba/dmarc-report-visualizer/commit/f769d2456fd36979295336a84b370d2806640034))
* **imap:** leave non-report mail untouched and harden folder handling (@samuelba) ([231a20d](https://github.com/samuelba/dmarc-report-visualizer/commit/231a20d52c6d2b0f41c49ed964f7ebc4e2b0f533))
* **migrations:** create uuid_generate_v7() before the email tracking table (@samuelba) ([83d90be](https://github.com/samuelba/dmarc-report-visualizer/commit/83d90be42b296b5f746e230d46d8ef996830c360))

## [0.9.0](https://github.com/samuelba/dmarc-report-visualizer/compare/v0.8.6...v0.9.0) (2026-11-07)


### Features

* add Buy Me a Coffee funding ([cc624a6](https://github.com/samuelba/dmarc-report-visualizer/commit/cc624a63c6b6a68c1b05a5ec12e1052c79194d93))
* add funding ([acbd316](https://github.com/samuelba/dmarc-report-visualizer/commit/acbd31612e7f28cb113c78a111fea843b686ed5e))

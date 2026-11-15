# Changelog

## [0.11.0](https://github.com/samuelba/dmarc-report-visualizer/compare/v0.10.1...v0.11.0) (2026-11-15)


### Features

* **reports:** badge every sender status and add unchecked ([280234a](https://github.com/samuelba/dmarc-report-visualizer/commit/280234aee757768d03ea9b93154a7a78b44dedbc))
* **reports:** badge every sender status and add unchecked ([553be72](https://github.com/samuelba/dmarc-report-visualizer/commit/553be72b96b3686209af243f2c70f3e52d4de75c))
* **reports:** let admins trust unaligned report senders ([25ab2cc](https://github.com/samuelba/dmarc-report-visualizer/commit/25ab2cc0616d7afb5ba829fea2b2181c151ffa56))
* **reports:** show sender verification status ([d0b14a5](https://github.com/samuelba/dmarc-report-visualizer/commit/d0b14a5aa7198413e3ea76a03d8ef19b09e2f481))
* **reports:** show skeleton rows while loading and fix pagination URL ([70bf468](https://github.com/samuelba/dmarc-report-visualizer/commit/70bf468025502f4894c016bf6c1379f4654584a3))
* **reports:** show skeleton rows while loading and fix pagination URL ([91c4db8](https://github.com/samuelba/dmarc-report-visualizer/commit/91c4db8b92cc7eaf5445479d4286a76224d31363))
* **security:** verify report senders with DKIM and ARC ([f6f5cc5](https://github.com/samuelba/dmarc-report-visualizer/commit/f6f5cc5145c644b069b34f1084763a2d92079213))
* **settings:** persist selected tab in URL ([160032c](https://github.com/samuelba/dmarc-report-visualizer/commit/160032cb6935e03043730235569fcaa08e7e5a7c))
* **settings:** persist selected tab in URL ([66137d9](https://github.com/samuelba/dmarc-report-visualizer/commit/66137d9d7d2466d85c8a4d1b3d6a5be1ced1d36e))


### Bug Fixes

* **frontend:** revalidate index.html so new releases load ([c6cf015](https://github.com/samuelba/dmarc-report-visualizer/commit/c6cf01540a0ff73aa50dd6d4db96ab20a3881243))
* **security:** bound report decompression size ([29e0139](https://github.com/samuelba/dmarc-report-visualizer/commit/29e0139effb3a6aa34f9d226b731ecf577e8765f))
* **security:** enforce size limits on report ingestion paths ([ba2375e](https://github.com/samuelba/dmarc-report-visualizer/commit/ba2375e2e2b2fce275f7833aca247a5481badc03))
* **security:** keep the first copy on report dedup collisions ([1f5b7e4](https://github.com/samuelba/dmarc-report-visualizer/commit/1f5b7e43c2e8628dda514bb14a9bf5ff87bf8911))
* **security:** never name the relay as a report's sender ([fcd1d5b](https://github.com/samuelba/dmarc-report-visualizer/commit/fcd1d5b82ad2e75b84b786dc4b6c346eba2c5412))
* **security:** only aligned copies replace stored reports ([119506c](https://github.com/samuelba/dmarc-report-visualizer/commit/119506c1fde883cca10aa88e0df6a2afcd765d20))
* **security:** require admin for DMARC writes and hide IP lookup keys ([d2fd23e](https://github.com/samuelba/dmarc-report-visualizer/commit/d2fd23e85d590a638ca7b7a3a851a60029ee19ed))
* **security:** require admin for report upload ([b8b22d4](https://github.com/samuelba/dmarc-report-visualizer/commit/b8b22d4f53d73e3bec6139456db85064c5a18ce0))
* **security:** require admin for report upload ([2490973](https://github.com/samuelba/dmarc-report-visualizer/commit/24909731318cc6c2fc13d855b7f4c132e6a87587))
* **security:** trust one proxy hop and stop exposing postgres ([2a2331b](https://github.com/samuelba/dmarc-report-visualizer/commit/2a2331bdeeea38bdf24107dd3fc443f38041d08c))


### Performance Improvements

* **reports:** cap records per report and insert in batches ([f319b3a](https://github.com/samuelba/dmarc-report-visualizer/commit/f319b3abfc232a6e3041da8beedb705ca3f3f608))
* **reports:** skip records and raw XML in report list query ([473e6d9](https://github.com/samuelba/dmarc-report-visualizer/commit/473e6d9de16c8d501b3a7b60f0a869fa135117d7))

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

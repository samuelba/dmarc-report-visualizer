# Changelog

## [0.10.1](https://github.com/samuelba/dmarc-report-visualizer/compare/v0.10.0...v0.10.1) (2026-11-13)


### Bug Fixes

* **auth:** separate JWT signing keys and reject wrong token types ([93f3f9e](https://github.com/samuelba/dmarc-report-visualizer/commit/93f3f9e62da760a68d97b0ceb4405f990e19fb2a))
* **security:** decouple TOTP and SMTP encryption keys from JWT_SECRET ([565d8bb](https://github.com/samuelba/dmarc-report-visualizer/commit/565d8bb10e970e478b16d4416b4538be7c56c413))

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

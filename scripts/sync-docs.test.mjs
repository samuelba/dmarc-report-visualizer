import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  DOCS_SITE_SEGMENT,
  EXAMPLES_SEGMENT,
  RELEASE_JSON_SEGMENT,
  releaseFromTag,
  syncDocs,
  withEditUrl,
} from './sync-docs.mjs'

test('withEditUrl inserts a link and replaces an existing one', () => {
  const once = withEditUrl('---\ntitle: Hi\n---\n\nBody\n', 'https://example.com/a')
  assert.match(once, /editUrl: https:\/\/example.com\/a/)
  const twice = withEditUrl(once, 'https://example.com/b')
  assert.equal(twice.match(/editUrl:/g)?.length, 1)
  assert.match(twice, /editUrl: https:\/\/example.com\/b/)
})

test('releaseFromTag reads the changelog date', () => {
  const release = releaseFromTag(
    'v1.2.3',
    '## [1.2.3](https://example.com) (2026-01-02)\n',
  )
  assert.equal(release.version, '1.2.3')
  assert.equal(release.tag, 'v1.2.3')
  assert.equal(release.date, '2026-01-02')
  assert.match(release.url, /\/releases\/tag\/v1\.2\.3$/)
})

test('syncDocs mirrors pages, drops stale files, and writes the changelog', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dmarc-src-'))
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'dmarc-site-'))
  fs.mkdirSync(path.join(root, 'docs', 'site', 'getting-started'), {
    recursive: true,
  })
  fs.writeFileSync(
    path.join(root, 'docs', 'site', 'getting-started', 'quick-start.md'),
    '---\ntitle: Quick start\n---\n\nHello\n',
  )
  fs.mkdirSync(path.join(root, 'examples', 'traefik'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'examples', 'traefik', 'compose.yml'),
    'services: {}\n',
  )
  fs.writeFileSync(
    path.join(root, 'CHANGELOG.md'),
    '# Changelog\n\n## [1.0.0](https://example.com) (2026-05-01)\n',
  )
  const stale = path.join(out, DOCS_SITE_SEGMENT, 'old.md')
  fs.mkdirSync(path.dirname(stale), { recursive: true })
  fs.writeFileSync(stale, 'gone')

  const withoutTag = syncDocs({ root, out })
  assert.equal(withoutTag.release, undefined)
  assert.equal(fs.existsSync(path.join(out, RELEASE_JSON_SEGMENT)), false)
  assert.equal(fs.existsSync(stale), false)
  const page = fs.readFileSync(
    path.join(out, DOCS_SITE_SEGMENT, 'getting-started', 'quick-start.md'),
    'utf8',
  )
  assert.match(page, /docs\/site\/getting-started\/quick-start\.md/)
  assert.match(
    fs.readFileSync(
      path.join(out, DOCS_SITE_SEGMENT, 'reference', 'changelog.md'),
      'utf8',
    ),
    /## \[1\.0\.0\]/,
  )
  assert.equal(
    fs.readFileSync(
      path.join(out, EXAMPLES_SEGMENT, 'traefik', 'compose.yml'),
      'utf8',
    ),
    'services: {}\n',
  )

  syncDocs({ root, out, tag: 'v1.0.0' })
  const json = JSON.parse(
    fs.readFileSync(path.join(out, RELEASE_JSON_SEGMENT), 'utf8'),
  )
  assert.equal(json.tag, 'v1.0.0')
  assert.equal(json.date, '2026-05-01')
})

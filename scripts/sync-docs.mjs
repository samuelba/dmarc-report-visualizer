import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO = 'https://github.com/samuelba/dmarc-report-visualizer'
const EDIT_BASE = `${REPO}/edit/main/`

export const DOCS_SITE_SEGMENT = path.join(
  'src',
  'content',
  'docs',
  'dmarc-visualizer',
  'docs',
)
export const EXAMPLES_SEGMENT = path.join(
  'src',
  'content',
  'docs',
  'dmarc-visualizer',
  'examples',
)
export const RELEASE_JSON_SEGMENT = path.join('src', 'data', 'dmarc-release.json')

/**
 * @param {string} tag
 * @param {string} changelog
 */
export function releaseFromTag(tag, changelog) {
  const version = tag.replace(/^v/, '')
  const normalized = tag.startsWith('v') ? tag : `v${tag}`
  const dated = changelog.match(
    new RegExp(
      `\\[${escapeRegExp(version)}\\][^\\n]*\\((\\d{4}-\\d{2}-\\d{2})\\)`,
    ),
  )
  return {
    version,
    tag: normalized,
    date: dated?.[1] ?? new Date().toISOString().slice(0, 10),
    url: `${REPO}/releases/tag/${normalized}`,
  }
}

/**
 * @param {string} source
 * @param {string} editUrl
 */
export function withEditUrl(source, editUrl) {
  const line = `editUrl: ${editUrl}`
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/)
  if (!match) return `---\n${line}\n---\n\n${source}`
  const frontmatter = match[1].replace(/^editUrl:.*\n?/m, '').trimEnd()
  const rest = source.slice(match[0].length)
  const lead = rest.startsWith('\n') ? '' : '\n'
  return `---\n${frontmatter}\n${line}\n---\n${lead}${rest}`
}

/**
 * @param {string} changelog
 */
export function changelogPage(changelog) {
  const body = changelog.replace(/^# Changelog\s*/, '')
  return `---
title: Changelog
description: Changes in each DMARC Report Visualizer release.
sidebar:
  order: 54
---

${body}`
}

/**
 * @param {{ root: string, out: string, tag?: string }} options
 */
export function syncDocs({ root, out, tag }) {
  const docsSrc = path.join(root, 'docs', 'site')
  if (!fs.existsSync(docsSrc)) {
    throw new Error(`Missing docs source: ${docsSrc}`)
  }
  const docsDest = path.join(out, DOCS_SITE_SEGMENT)
  const examplesDest = path.join(out, EXAMPLES_SEGMENT)
  fs.rmSync(docsDest, { recursive: true, force: true })
  fs.rmSync(examplesDest, { recursive: true, force: true })

  for (const file of walk(docsSrc)) {
    const relative = path.relative(docsSrc, file)
    const dest = path.join(docsDest, relative)
    if (isMarkdown(file)) {
      const editUrl = `${EDIT_BASE}docs/site/${toPosix(relative)}`
      writeFile(dest, withEditUrl(fs.readFileSync(file, 'utf8'), editUrl))
    } else {
      copyFile(file, dest)
    }
  }

  const examplesSrc = path.join(root, 'examples')
  if (fs.existsSync(examplesSrc)) {
    for (const file of walk(examplesSrc)) {
      const relative = path.relative(examplesSrc, file)
      copyFile(file, path.join(examplesDest, relative))
    }
  }

  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
  const changelogDest = path.join(docsDest, 'reference', 'changelog.md')
  writeFile(
    changelogDest,
    withEditUrl(changelogPage(changelog), `${EDIT_BASE}CHANGELOG.md`),
  )

  /** @type {ReturnType<typeof releaseFromTag> | undefined} */
  let release
  if (tag) {
    release = releaseFromTag(tag, changelog)
    const jsonPath = path.join(out, RELEASE_JSON_SEGMENT)
    writeFile(jsonPath, `${JSON.stringify(release, null, 2)}\n`)
  }
  return { docsDest, examplesDest, release }
}

/**
 * @param {string[]} argv
 * @param {string} defaultRoot
 */
export function parseSyncArgs(argv, defaultRoot) {
  /** @type {{ out: string, tag?: string, root: string }} */
  const args = { out: '', root: defaultRoot }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--out') args.out = path.resolve(argv[++i] ?? '')
    else if (arg === '--tag') args.tag = argv[++i]
    else if (arg === '--root') args.root = path.resolve(argv[++i] ?? '')
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!args.out) {
    throw new Error(
      'Usage: node scripts/sync-docs.mjs --out <website> [--tag vX.Y.Z] [--root dir]',
    )
  }
  return args
}

/**
 * @param {string} value
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * @param {string} file
 */
function isMarkdown(file) {
  return file.endsWith('.md') || file.endsWith('.mdx')
}

/**
 * @param {string} value
 */
function toPosix(value) {
  return value.split(path.sep).join('/')
}

/**
 * @param {string} src
 * @param {string} dest
 */
function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

/**
 * @param {string} dest
 * @param {string} contents
 */
function writeFile(dest, contents) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, contents)
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  /** @type {string[]} */
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(full))
    else if (entry.isFile()) files.push(full)
  }
  return files
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const args = parseSyncArgs(process.argv.slice(2), path.resolve(SCRIPT_DIR, '..'))
  const result = syncDocs(args)
  console.log(`Synced docs to ${result.docsDest}`)
}

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))

const ENV_NAME = '[A-Z][A-Z0-9_]*'
const GET_CALL = new RegExp(
  `\\.get(?:OrThrow)?(?:<[^>]+>)?\\(\\s*['"](${ENV_NAME})['"]`,
  'g',
)
const PROCESS_ENV = new RegExp(`process\\.env\\.(${ENV_NAME})`, 'g')
const PROCESS_ENV_INDEX = new RegExp(
  `process\\.env\\[\\s*['"](${ENV_NAME})['"]\\s*\\]`,
  'g',
)
const ENV_PROPERTY = new RegExp(`(?<![\\w.])env\\.(${ENV_NAME})`, 'g')
const COMPOSE_VAR = new RegExp(`\\$\\{(${ENV_NAME})`, 'g')
const DOC_NAME = new RegExp(`\`(${ENV_NAME})\``, 'g')

/**
 * Names the app sets for a child process, not settings a user provides.
 * @type {Set<string>}
 */
const IGNORED = new Set(['PGPASSWORD'])

/**
 * @param {string} root
 */
export function collectEnvNames(root) {
  /** @type {Set<string>} */
  const names = new Set()
  const sourceRoot = path.join(root, 'backend', 'src')
  for (const file of walk(sourceRoot)) {
    if (file.endsWith('.spec.ts')) continue
    const text = fs.readFileSync(file, 'utf8')
    collectMatches(text, PROCESS_ENV, names)
    collectMatches(text, PROCESS_ENV_INDEX, names)
    collectMatches(text, ENV_PROPERTY, names)
    collectMatches(text, GET_CALL, names)
  }
  const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8')
  collectMatches(compose, COMPOSE_VAR, names)
  for (const name of IGNORED) names.delete(name)
  return names
}

/**
 * @param {string} text
 * @param {RegExp} pattern
 * @param {Set<string>} names
 */
function collectMatches(text, pattern, names) {
  for (const match of text.matchAll(pattern)) names.add(match[1])
}

/**
 * @param {string} docs
 * @returns {Set<string>}
 */
export function documentedEnvNames(docs) {
  /** @type {Set<string>} */
  const names = new Set()
  for (const match of docs.matchAll(DOC_NAME)) {
    const name = match[1]
    if (name === 'PORT' || name.includes('_')) names.add(name)
  }
  return names
}

/**
 * @param {string} sample
 * @param {string} name
 */
export function sampleMentions(sample, name) {
  const pattern = new RegExp(`(?<![A-Z0-9_])${name}(?![A-Z0-9_])`)
  return pattern.test(sample)
}

/**
 * @param {string} root
 */
export function checkEnvDocs(root) {
  const names = collectEnvNames(root)
  const sample = fs.readFileSync(path.join(root, '.env.sample'), 'utf8')
  const docsPath = path.join(
    root,
    'docs',
    'site',
    'reference',
    'configuration.md',
  )
  const docs = fs.existsSync(docsPath) ? fs.readFileSync(docsPath, 'utf8') : ''
  const documented = documentedEnvNames(docs)
  const missingFromSample = [...names]
    .filter((name) => !sampleMentions(sample, name))
    .sort()
  const missingFromDocs = [...names]
    .filter((name) => !documented.has(name))
    .sort()
  const unknownInDocs = [...documented]
    .filter((name) => !names.has(name))
    .sort()
  return { missingFromSample, missingFromDocs, unknownInDocs }
}

/**
 * @param {string} root
 */
export function reportEnvDocs(root) {
  const result = checkEnvDocs(root)
  const lines = []
  if (result.missingFromSample.length > 0) {
    lines.push(
      `Missing from .env.sample:\n${result.missingFromSample.map((name) => `  ${name}`).join('\n')}`,
    )
  }
  if (result.missingFromDocs.length > 0) {
    lines.push(
      `Missing from docs/site/reference/configuration.md:\n${result.missingFromDocs.map((name) => `  ${name}`).join('\n')}`,
    )
  }
  if (result.unknownInDocs.length > 0) {
    lines.push(
      `Documented but not read by the backend or docker-compose.yml:\n${result.unknownInDocs.map((name) => `  ${name}`).join('\n')}`,
    )
  }
  return { ok: lines.length === 0, report: lines.join('\n\n') }
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  if (!fs.existsSync(dir)) return []
  /** @type {string[]} */
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(full))
    else if (entry.isFile()) files.push(full)
  }
  return files
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  let root = path.resolve(SCRIPT_DIR, '..')
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') root = path.resolve(argv[++i] ?? '')
    else throw new Error(`Unknown argument: ${argv[i]}`)
  }
  return root
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const { ok, report } = reportEnvDocs(parseArgs(process.argv.slice(2)))
  if (!ok) {
    console.error(report)
    process.exit(1)
  }
}

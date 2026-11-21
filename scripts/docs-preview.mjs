import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { syncDocs } from './sync-docs.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const site = process.argv[2]

if (!site) {
  console.error('Usage: npm run docs:preview -- <path-to-samuelba-website>')
  process.exit(1)
}

const version = fs.readFileSync(path.join(root, 'version.txt'), 'utf8').trim()
syncDocs({
  root,
  out: path.resolve(site),
  tag: version.startsWith('v') ? version : `v${version}`,
})

const child = spawn('npx', ['astro', 'dev', '--background'], {
  cwd: path.resolve(site),
  stdio: 'inherit',
})
child.on('exit', (code) => process.exit(code ?? 1))

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { checkEnvDocs, documentedEnvNames, sampleMentions } from './check-env-docs.mjs'

test('sampleMentions matches a name and not a longer name', () => {
  const sample = '# TOTP_ENCRYPTION_KEY=\nJWT_SECRET=x\n'
  assert.equal(sampleMentions(sample, 'TOTP_ENCRYPTION_KEY'), true)
  assert.equal(sampleMentions(sample, 'JWT_SECRET'), true)
  assert.equal(sampleMentions(sample, 'JWT'), false)
})

test('documentedEnvNames keeps env-shaped backticks', () => {
  const names = documentedEnvNames('Use `JWT_SECRET` and `PORT`. Ignore `HTTPS`.')
  assert.deepEqual([...names].sort(), ['JWT_SECRET', 'PORT'])
})

test('checkEnvDocs reports sample, docs, and stale names', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dmarc-env-'))
  fs.mkdirSync(path.join(root, 'backend', 'src'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'backend', 'src', 'main.ts'),
    "const port = process.env.PORT\nthis.config.get<string>('JWT_SECRET')\n",
  )
  fs.writeFileSync(
    path.join(root, 'backend', 'src', 'main.spec.ts'),
    'process.env.ONLY_IN_SPEC\n',
  )
  fs.writeFileSync(
    path.join(root, 'docker-compose.yml'),
    'image: db\n  password: ${POSTGRES_PASSWORD}\n',
  )
  fs.writeFileSync(path.join(root, '.env.sample'), 'PORT=3000\n')
  fs.mkdirSync(path.join(root, 'docs', 'site', 'reference'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'docs', 'site', 'reference', 'configuration.md'),
    '`PORT` and `OLD_SETTING`.\n',
  )

  const result = checkEnvDocs(root)
  assert.deepEqual(result.missingFromSample, ['JWT_SECRET', 'POSTGRES_PASSWORD'])
  assert.deepEqual(result.missingFromDocs, ['JWT_SECRET', 'POSTGRES_PASSWORD'])
  assert.deepEqual(result.unknownInDocs, ['OLD_SETTING'])
})

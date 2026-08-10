import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Profile } from '@shared/profiles'
import { ConfigService } from './ConfigService'
import { CredentialVault, type SafeStorageLike } from './CredentialVault'
import { ConnectionService } from './ConnectionService'

const fake: SafeStorageLike = {
  isAsyncEncryptionAvailable: async () => true,
  encryptStringAsync: async (plain) => Buffer.from('ENC:' + plain, 'utf8'),
  decryptStringAsync: async (buf) => ({
    shouldReEncrypt: false,
    result: buf.toString('utf8').replace(/^ENC:/, '')
  })
}

const profile = (over: Partial<Profile>): Profile => ({
  id: '88888888-8888-4888-8888-888888888888',
  name: 'p',
  method: 'claude-cli',
  env: {},
  binary: 'bundled',
  ...over
})

describe('ConnectionService.buildSessionOptions（F-7 環境変数の合成）', () => {
  let dir: string
  let config: ConfigService
  let vault: CredentialVault
  let service: ConnectionService

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nimbus-conn-'))
    config = new ConfigService(dir)
    vault = new CredentialVault(join(dir, 'vault.json'), fake, 'darwin')
    service = new ConnectionService(config, vault)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('プロファイルなし → 追加オプションなし（CLI ログイン状態をそのまま利用）', async () => {
    expect(await service.buildSessionOptions()).toEqual({})
  })

  it('claude-cli 方式 → env を渡さない（資格情報に一切触れない）', async () => {
    config.upsertProfile(profile({ method: 'claude-cli' }))
    const options = await service.buildSessionOptions()
    expect(options.env).toBeUndefined()
  })

  it('api-key 方式 → vault の鍵を ANTHROPIC_API_KEY として渡し、process.env をスプレッドする（§10 検証 7）', async () => {
    const p = profile({ method: 'api-key' })
    config.upsertProfile(p)
    await vault.setSecret(p.id, 'sk-test-key-1')
    const options = await service.buildSessionOptions()
    expect(options.env?.['ANTHROPIC_API_KEY']).toBe('sk-test-key-1')
    // env は「置換」なので親環境が含まれていなければならない
    expect(options.env?.['PATH']).toBe(process.env['PATH'])
  })

  it('bedrock 方式 → CLAUDE_CODE_USE_BEDROCK=1 ＋ プロファイル env がマージされる', async () => {
    config.upsertProfile(profile({ method: 'bedrock', env: { AWS_REGION: 'ap-northeast-1' } }))
    const options = await service.buildSessionOptions()
    expect(options.env?.['CLAUDE_CODE_USE_BEDROCK']).toBe('1')
    expect(options.env?.['AWS_REGION']).toBe('ap-northeast-1')
  })

  it('vertex 方式 → CLAUDE_CODE_USE_VERTEX=1', async () => {
    config.upsertProfile(profile({ method: 'vertex', env: { CLOUD_ML_REGION: 'global' } }))
    const options = await service.buildSessionOptions()
    expect(options.env?.['CLAUDE_CODE_USE_VERTEX']).toBe('1')
    expect(options.env?.['CLOUD_ML_REGION']).toBe('global')
  })

  it('foundry 方式 → CLAUDE_CODE_USE_FOUNDRY=1 ＋ vault の鍵が ANTHROPIC_FOUNDRY_API_KEY に入る', async () => {
    const p = profile({ method: 'foundry', env: { ANTHROPIC_FOUNDRY_RESOURCE: 'my-res' } })
    config.upsertProfile(p)
    await vault.setSecret(p.id, 'foundry-key-1')
    const options = await service.buildSessionOptions()
    expect(options.env?.['CLAUDE_CODE_USE_FOUNDRY']).toBe('1')
    expect(options.env?.['ANTHROPIC_FOUNDRY_API_KEY']).toBe('foundry-key-1')
    expect(options.env?.['ANTHROPIC_FOUNDRY_RESOURCE']).toBe('my-res')
  })

  it('binary=system + customBinaryPath → pathToClaudeCodeExecutable に渡る', async () => {
    config.upsertProfile(
      profile({ method: 'claude-cli', binary: 'system', customBinaryPath: '/opt/claude' })
    )
    const options = await service.buildSessionOptions()
    expect(options.pathToClaudeCodeExecutable).toBe('/opt/claude')
  })
})

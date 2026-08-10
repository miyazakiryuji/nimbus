import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CredentialVault, type SafeStorageLike } from './CredentialVault'

/** base64 を「暗号化」に見立てたフェイク（プレフィックスで暗号文であることを表現） */
function fakeSafeStorage(over: Partial<SafeStorageLike> = {}): SafeStorageLike {
  return {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (plain) => Buffer.from('ENC:' + plain, 'utf8'),
    decryptStringAsync: async (buf) => ({
      shouldReEncrypt: false,
      result: buf.toString('utf8').replace(/^ENC:/, '')
    }),
    ...over
  }
}

const PROFILE_ID = '77777777-7777-4777-8777-777777777777'

describe('CredentialVault', () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nimbus-vault-'))
    path = join(dir, 'credentials.enc.json')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('set → get roundtrip', async () => {
    const vault = new CredentialVault(path, fakeSafeStorage(), 'darwin')
    await vault.setSecret(PROFILE_ID, 'sk-test-abc')
    expect(await vault.getSecret(PROFILE_ID)).toBe('sk-test-abc')
    expect(vault.hasSecret(PROFILE_ID)).toBe(true)
  })

  it('§6-1: 平文がファイルに書かれない（暗号化後の base64 のみ）', async () => {
    const vault = new CredentialVault(path, fakeSafeStorage(), 'darwin')
    await vault.setSecret(PROFILE_ID, 'sk-test-abc')
    const raw = readFileSync(path, 'utf8')
    expect(raw).not.toContain('sk-test-abc')
  })

  it('暗号化不可の環境では保存を拒否する（§6-1: 平文フォールバック禁止）', async () => {
    const vault = new CredentialVault(
      path,
      fakeSafeStorage({ isAsyncEncryptionAvailable: async () => false }),
      'darwin'
    )
    expect(await vault.canPersistSecrets()).toBe(false)
    await expect(vault.setSecret(PROFILE_ID, 'x')).rejects.toThrow('refusing to persist')
  })

  it('Linux の basic_text バックエンド（実質平文）は保存不可扱い（§10 検証の罠対応）', async () => {
    const vault = new CredentialVault(
      path,
      fakeSafeStorage({ getSelectedStorageBackend: () => 'basic_text' }),
      'linux'
    )
    expect(await vault.canPersistSecrets()).toBe(false)
    // 正常なバックエンドなら可
    const okVault = new CredentialVault(
      path,
      fakeSafeStorage({ getSelectedStorageBackend: () => 'gnome_libsecret' }),
      'linux'
    )
    expect(await okVault.canPersistSecrets()).toBe(true)
  })

  it('shouldReEncrypt=true でキーローテーション時に再暗号化して保存し直す', async () => {
    let encryptCalls = 0
    const vault = new CredentialVault(
      path,
      fakeSafeStorage({
        encryptStringAsync: async (plain) => {
          encryptCalls++
          return Buffer.from('ENC:' + plain, 'utf8')
        },
        decryptStringAsync: async (buf) => ({
          shouldReEncrypt: true,
          result: buf.toString('utf8').replace(/^ENC:/, '')
        })
      }),
      'darwin'
    )
    await vault.setSecret(PROFILE_ID, 'rotate-me')
    expect(encryptCalls).toBe(1)
    expect(await vault.getSecret(PROFILE_ID)).toBe('rotate-me')
    expect(encryptCalls).toBe(2) // get 時に再暗号化された
  })

  it('delete で消える', async () => {
    const vault = new CredentialVault(path, fakeSafeStorage(), 'darwin')
    await vault.setSecret(PROFILE_ID, 'x')
    vault.deleteSecret(PROFILE_ID)
    expect(vault.hasSecret(PROFILE_ID)).toBe(false)
    expect(await vault.getSecret(PROFILE_ID)).toBeUndefined()
  })
})

import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

/**
 * safeStorage の注入用インターフェース（テストではフェイクを注入する）。
 * §10 検証: Electron 42+ の非同期 API が公式推奨。decryptStringAsync は
 * { shouldReEncrypt, result } を返し、キーローテーション時は再暗号化して保存し直す。
 */
export interface SafeStorageLike {
  isAsyncEncryptionAvailable: () => Promise<boolean>
  encryptStringAsync: (plainText: string) => Promise<Buffer>
  decryptStringAsync: (encrypted: Buffer) => Promise<{ shouldReEncrypt: boolean; result: string }>
  /** Linux のみ実装（他 OS は undefined を返す想定） */
  getSelectedStorageBackend?: () => string
}

interface VaultFile {
  version: 1
  /** profileId → base64(暗号化済みバイト列) */
  secrets: Record<string, string>
}

/**
 * §6-1: API キー等の機密は OS のセキュアストレージ（safeStorage）で暗号化して保存する。
 * 平文保存経路は存在しない。暗号化不可の環境では保存自体を拒否する
 * （Linux の basic_text は実質平文のため「不可」扱い — §10 検証の罠対応）。
 */
export class CredentialVault {
  constructor(
    private readonly filePath: string,
    private readonly safeStorage: SafeStorageLike,
    private readonly platform: NodeJS.Platform = process.platform
  ) {}

  async canPersistSecrets(): Promise<boolean> {
    if (!(await this.safeStorage.isAsyncEncryptionAvailable())) return false
    if (this.platform === 'linux') {
      const backend = this.safeStorage.getSelectedStorageBackend?.()
      if (backend === 'basic_text') return false
    }
    return true
  }

  async setSecret(profileId: string, value: string): Promise<void> {
    if (!(await this.canPersistSecrets())) {
      throw new Error(
        'Secure storage is unavailable on this system — refusing to persist the secret (§6-1)'
      )
    }
    const encrypted = await this.safeStorage.encryptStringAsync(value)
    const file = this.load()
    file.secrets[profileId] = encrypted.toString('base64')
    this.save(file)
  }

  async getSecret(profileId: string): Promise<string | undefined> {
    const file = this.load()
    const b64 = file.secrets[profileId]
    if (b64 === undefined) return undefined
    const { result, shouldReEncrypt } = await this.safeStorage.decryptStringAsync(
      Buffer.from(b64, 'base64')
    )
    if (shouldReEncrypt) {
      // キーローテーション: 再暗号化して保存し直す（§10 検証）
      const reEncrypted = await this.safeStorage.encryptStringAsync(result)
      file.secrets[profileId] = reEncrypted.toString('base64')
      this.save(file)
    }
    return result
  }

  deleteSecret(profileId: string): void {
    const file = this.load()
    delete file.secrets[profileId]
    this.save(file)
  }

  hasSecret(profileId: string): boolean {
    return this.load().secrets[profileId] !== undefined
  }

  listProfileIds(): string[] {
    return Object.keys(this.load().secrets)
  }

  private load(): VaultFile {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as VaultFile
      if (parsed.version === 1 && typeof parsed.secrets === 'object') return parsed
      return { version: 1, secrets: {} }
    } catch {
      return { version: 1, secrets: {} }
    }
  }

  private save(file: VaultFile): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(file, null, 2) + '\n')
  }
}

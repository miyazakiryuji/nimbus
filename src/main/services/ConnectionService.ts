import { execFile } from 'child_process'
import { promisify } from 'util'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { Options } from '@anthropic-ai/claude-agent-sdk'
import type { BinaryInfo, ConnectionTestResult } from '@shared/profiles'
import type { ConfigService } from './ConfigService'
import type { CredentialVault } from './CredentialVault'

const execFileAsync = promisify(execFile)

/**
 * F-7: 接続方式の合成。
 * 大原則: Nimbus は認証を代行しない・預からない。ここで組み立てるのは
 * 「ユーザーが用意した資格情報を SDK にどう渡すか」だけである。
 */
export class ConnectionService {
  constructor(
    private readonly config: ConfigService,
    private readonly vault: CredentialVault,
    /** パッケージ版で asar 外に展開された同梱 CLI のパス（開発時は undefined） */
    private readonly bundledExecutablePath?: string
  ) {}

  /**
   * アクティブプロファイルから query() の追加オプションを組み立てる。
   * §10 検証 7: env は「置換」なので必ず process.env をスプレッドする。
   */
  async buildSessionOptions(): Promise<Partial<Options>> {
    const profile = this.config.getActiveProfile()
    if (!profile) {
      return this.bundledExecutablePath
        ? { pathToClaudeCodeExecutable: this.bundledExecutablePath }
        : {}
    }

    const options: Partial<Options> = {}
    const env: Record<string, string | undefined> = { ...process.env, ...profile.env }

    switch (profile.method) {
      case 'claude-cli':
        // 既定: 追加の資格情報は一切渡さない（CLI ログイン状態に乗る）
        break
      case 'api-key': {
        const key = await this.vault.getSecret(profile.id)
        if (key !== undefined) env['ANTHROPIC_API_KEY'] = key
        break
      }
      case 'bedrock':
        env['CLAUDE_CODE_USE_BEDROCK'] = '1'
        break
      case 'vertex':
        env['CLAUDE_CODE_USE_VERTEX'] = '1'
        break
      case 'foundry': {
        env['CLAUDE_CODE_USE_FOUNDRY'] = '1'
        const key = await this.vault.getSecret(profile.id)
        if (key !== undefined) env['ANTHROPIC_FOUNDRY_API_KEY'] = key
        break
      }
    }

    if (Object.keys(profile.env).length > 0 || profile.method !== 'claude-cli') {
      options.env = env
    }
    if (profile.binary === 'system') {
      const path = profile.customBinaryPath ?? (await this.detectSystemBinary()).systemPath
      if (path) options.pathToClaudeCodeExecutable = path
    }
    if (!options.pathToClaudeCodeExecutable && this.bundledExecutablePath) {
      // パッケージ版: asar 内からは spawn できないため unpacked 側の実体を明示
      options.pathToClaudeCodeExecutable = this.bundledExecutablePath
    }
    return options
  }

  async detectSystemBinary(): Promise<BinaryInfo> {
    let systemPath: string | undefined
    let systemVersion: string | undefined
    try {
      const { stdout } = await execFileAsync('/usr/bin/which', ['claude'])
      systemPath = stdout.trim() || undefined
    } catch {
      systemPath = undefined
    }
    if (systemPath) {
      try {
        const { stdout } = await execFileAsync(systemPath, ['--version'], { timeout: 10_000 })
        systemVersion = stdout.trim() || undefined
      } catch {
        systemVersion = undefined
      }
    }
    return {
      systemPath,
      systemVersion,
      // SDK はネイティブバイナリを optionalDependencies として同梱（§10 検証 7）
      bundledAvailable: true
    }
  }

  /**
   * F-7-2: 接続テスト。軽量クエリを 1 回投げ、init イベントのメタデータを返す。
   */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const extra = await this.buildSessionOptions()
      const q = query({
        prompt: 'Reply with exactly: OK',
        options: { ...extra, maxTurns: 1, persistSession: false }
      })
      let result: ConnectionTestResult = { ok: false, error: 'no init event received' }
      for await (const msg of q) {
        if (msg.type === 'system' && msg.subtype === 'init') {
          result = {
            ok: true,
            model: msg.model,
            claudeCodeVersion: msg.claude_code_version,
            apiKeySource: msg.apiKeySource,
            mcpServers: msg.mcp_servers.map((s) => s.name),
            plugins: msg.plugins.map((p) => p.name)
          }
        }
        if (msg.type === 'result') break
      }
      return result
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}

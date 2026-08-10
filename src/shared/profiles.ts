import { z } from 'zod'

/**
 * 接続プロファイル（F-7）。~/.nimbus/profiles.json に保存される。
 * §5/§6: このファイルに機密（API キー等）を含めてはならない。
 * 機密は CredentialVault（safeStorage 暗号化）が profileId をキーに別管理する。
 */

export const connectionMethodSchema = z.enum([
  /** 既定: ユーザーが CLI でログイン済みの状態に乗る（Nimbus は資格情報に触れない） */
  'claude-cli',
  'api-key',
  'bedrock',
  'vertex',
  'foundry'
])
export type ConnectionMethod = z.infer<typeof connectionMethodSchema>

export const profileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  method: connectionMethodSchema,
  /**
   * 非機密の環境変数（リージョン・プロジェクト ID 等）。
   * 機密らしい名前のキーは保存時に拒否する（ConfigService 側で検証）
   */
  env: z.record(z.string(), z.string()).default({}),
  /** SDK 同梱バイナリ / システムの claude を切替 */
  binary: z.enum(['bundled', 'system']).default('bundled'),
  /** binary='system' のときの明示パス（省略時は自動検出） */
  customBinaryPath: z.string().optional()
})
export type Profile = z.infer<typeof profileSchema>

export const profilesFileSchema = z.object({
  version: z.literal(1),
  activeProfileId: z.string().uuid().nullable(),
  profiles: z.array(profileSchema)
})
export type ProfilesFile = z.infer<typeof profilesFileSchema>

export const DEFAULT_PROFILES_FILE: ProfilesFile = {
  version: 1,
  activeProfileId: null,
  profiles: []
}

/** 接続タブ表示用の状態 */
export const binaryInfoSchema = z.object({
  systemPath: z.string().optional(),
  systemVersion: z.string().optional(),
  bundledAvailable: z.boolean()
})
export type BinaryInfo = z.infer<typeof binaryInfoSchema>

export const connectionStateSchema = z.object({
  profiles: z.array(profileSchema),
  activeProfileId: z.string().uuid().nullable(),
  binaryInfo: binaryInfoSchema,
  /** safeStorage による安全な保存が可能か（Linux basic_text は false 扱い） */
  canPersistSecrets: z.boolean(),
  /** プロファイルごとに機密が保存済みか（値は返さない） */
  hasStoredSecret: z.record(z.string(), z.boolean())
})
export type ConnectionState = z.infer<typeof connectionStateSchema>

export const connectionTestResultSchema = z.object({
  ok: z.boolean(),
  model: z.string().optional(),
  claudeCodeVersion: z.string().optional(),
  apiKeySource: z.string().optional(),
  mcpServers: z.array(z.string()).optional(),
  plugins: z.array(z.string()).optional(),
  error: z.string().optional()
})
export type ConnectionTestResult = z.infer<typeof connectionTestResultSchema>

/** 課金モード表示（F-7-3。ユーザーが請求形態を誤認しないことが最重要） */
export function billingModeLabel(apiKeySource: string | undefined): string {
  if (apiKeySource === undefined) return '接続未確認'
  // §10 検証: apiKeySource は 'user' | 'project' | 'org' | 'temporary' | 'oauth'
  if (apiKeySource === 'oauth') return 'サブスク利用（利用上限を消費）'
  return 'API キー利用（従量課金）'
}

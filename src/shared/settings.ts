import { z } from 'zod'
import { fontSettingsSchema } from './theme'

/**
 * ~/.nimbus/settings.json（§5 ユーザー設定）。
 * GUI と JSON 直接編集の両方をサポートし、双方向に反映される。
 * 不正な設定は警告して既定値へフォールバックする。
 */
export const settingsSchema = z.object({
  /** テーマ id または 'system'（OS のダークモードに追従） */
  theme: z.string().default('system'),
  font: fontSettingsSchema.default({}),
  /** F-5: 同時実行セッション数の上限（コスト暴走防止） */
  maxConcurrentSessions: z.number().int().min(1).max(20).default(3)
})
export type Settings = z.infer<typeof settingsSchema>

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  font: {},
  maxConcurrentSessions: 3
}

import { z } from 'zod'

/**
 * テーマ定義（F-8）。色キーの命名は VS Code の workbench color key に寄せる。
 * ただし「VS Code テーマ JSON をそのまま読める」とは謳わない（§4 F-8 既知の制約）。
 */
export const themeSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['dark', 'light', 'highContrast']),
  author: z.string().optional(),
  colors: z.record(z.string(), z.string()),
  tokenColors: z.array(z.unknown()).optional()
})
export type Theme = z.infer<typeof themeSchema>

/** VS Code workbench color key → Nimbus CSS 変数の対応表 */
export const COLOR_VAR_MAP: Record<string, string> = {
  'editor.background': '--nimbus-color-background',
  'editor.foreground': '--nimbus-color-foreground',
  'sideBar.background': '--nimbus-color-background-soft',
  'statusBar.background': '--nimbus-color-background-soft',
  'panel.border': '--nimbus-color-border',
  descriptionForeground: '--nimbus-color-foreground-muted',
  errorForeground: '--nimbus-color-error',
  'nimbus.accent': '--nimbus-color-accent',
  'nimbus.userBubble': '--nimbus-color-user-bubble'
}

/** テーマ切替時に一度クリアすべき変数の全リスト（前テーマの残留を防ぐ） */
export const ALL_NIMBUS_CSS_VARS = [
  ...new Set(Object.values(COLOR_VAR_MAP)),
  '--nimbus-font-family',
  '--nimbus-font-size',
  '--nimbus-line-height'
]

export const fontSettingsSchema = z.object({
  fontFamily: z.string().optional(),
  fontSize: z.number().min(8).max(32).optional(),
  lineHeight: z.number().min(1).max(3).optional()
})
export type FontSettings = z.infer<typeof fontSettingsSchema>

/** テーマ＋フォント設定 → :root に流し込む CSS 変数群 */
export function buildCssVars(theme: Theme, font: FontSettings = {}): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [key, value] of Object.entries(theme.colors)) {
    const cssVar = COLOR_VAR_MAP[key]
    if (cssVar) vars[cssVar] = value
  }
  if (font.fontFamily) vars['--nimbus-font-family'] = font.fontFamily
  if (font.fontSize !== undefined) vars['--nimbus-font-size'] = `${font.fontSize}px`
  if (font.lineHeight !== undefined) vars['--nimbus-line-height'] = String(font.lineHeight)
  return vars
}

export const themeInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: themeSchema.shape.type,
  source: z.enum(['builtin', 'user'])
})
export type ThemeInfo = z.infer<typeof themeInfoSchema>

/** IPC で renderer へ渡すテーマ状態 */
export const themeStateSchema = z.object({
  themes: z.array(themeInfoSchema),
  /** settings 上の選択値（'system' あり） */
  selected: z.string(),
  /** 実際に適用されたテーマ id（system 解決後） */
  activeThemeId: z.string(),
  cssVars: z.record(z.string(), z.string()),
  font: fontSettingsSchema
})
export type ThemeState = z.infer<typeof themeStateSchema>

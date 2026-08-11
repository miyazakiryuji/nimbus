import type { ThemeState } from '@shared/theme'

/**
 * Nimbus テーマの type（dark/light/highContrast）から Monaco の組み込みテーマを選ぶ。
 * §4 F-8 の制約どおり、TextMate 相当の完全移植は行わない（背景/前景の系統だけ合わせる）。
 */
export function monacoThemeFor(themeState: ThemeState | null): string {
  const active = themeState?.themes.find((t) => t.id === themeState.activeThemeId)
  if (active?.type === 'light') return 'vs'
  if (active?.type === 'highContrast') return 'hc-black'
  return 'vs-dark'
}

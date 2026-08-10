import { useEffect } from 'react'
import { ALL_NIMBUS_CSS_VARS, themeStateSchema } from '@shared/theme'
import { useUiStore } from '../stores/uiStore'

/**
 * F-8: main から届くテーマ状態を :root の CSS 変数へ反映する。
 * テーマ切替は変数差し替えのみ＝再起動不要の即時反映。
 */
export function useThemeSync(): void {
  const setThemeState = useUiStore((s) => s.setThemeState)

  useEffect(() => {
    const apply = (raw: unknown): void => {
      const parsed = themeStateSchema.safeParse(raw)
      if (!parsed.success) {
        console.error('[nimbus:renderer] invalid theme state', parsed.error)
        return
      }
      const root = document.documentElement
      // 前テーマの残留変数をクリアしてから適用（main.css の既定値にフォールバック）
      for (const name of ALL_NIMBUS_CSS_VARS) {
        root.style.removeProperty(name)
      }
      for (const [name, value] of Object.entries(parsed.data.cssVars)) {
        root.style.setProperty(name, value)
      }
      setThemeState(parsed.data)
      if (import.meta.env.DEV) {
        console.log(`[nimbus:renderer] theme applied id=${parsed.data.activeThemeId}`)
      }
    }

    void window.nimbus.theme.getState().then(apply)
    return window.nimbus.theme.onChanged(apply)
  }, [setThemeState])
}

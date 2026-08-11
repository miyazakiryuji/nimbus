import { useEffect } from 'react'
import { z } from 'zod'
import { nimbusEventSchema, sessionSummarySchema } from '@shared/events'
import { useSessionStore } from '../stores/sessionStore'
import { useUiStore } from '../stores/uiStore'

const sessionListSchema = z.array(sessionSummarySchema)

/**
 * セッションイベントの購読と、既存セッションへの再アタッチ。
 *
 * アプリ全体で 1 箇所（App）だけが呼ぶ。以前はチャット画面の中で購読していたため、
 * コックピット以外のビューを開いているとイベントが届かず、エクスプローラーの対象
 * ディレクトリや課金モード表示が空のままになる不具合があった。
 */
export function useSessionSync(): void {
  const ingest = useSessionStore((s) => s.ingest)
  const hydrate = useSessionStore((s) => s.hydrate)

  useEffect(() => {
    const unsubscribe = window.nimbus.sessions.onEvent((raw) => {
      // Renderer 側でも受信イベントを検証する（§3 設計原則 2）
      const parsed = nimbusEventSchema.safeParse(raw)
      if (!parsed.success) {
        console.error('[nimbus:renderer] invalid event', parsed.error)
        return
      }
      if (import.meta.env.DEV) {
        console.log(
          `[nimbus:renderer] event kind=${parsed.data.kind} session=${parsed.data.sessionId.slice(0, 8)}`
        )
      }
      if (parsed.data.kind === 'session-init') {
        // 課金モード表示（F-7-3）用に直近の認証ソースを記録
        useUiStore.getState().setLastApiKeySource(parsed.data.apiKeySource)
      }
      ingest(parsed.data)
    })

    // リロード/ウィンドウ再作成時に main の既存セッションへ再アタッチする
    void window.nimbus.sessions
      .list()
      .then((raw) => {
        const parsed = sessionListSchema.safeParse(raw)
        if (parsed.success) {
          hydrate(parsed.data)
        } else {
          console.error('[nimbus:renderer] invalid session list', parsed.error)
          hydrate([])
        }
      })
      .catch((error) => {
        console.error('[nimbus:renderer] session list failed', error)
        hydrate([])
      })

    return unsubscribe
  }, [ingest, hydrate])
}

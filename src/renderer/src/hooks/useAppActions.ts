import { useCallback, useEffect, useMemo } from 'react'
import { menuActionSchema, NIMBUS_REPO_URL, type MenuAction } from '@shared/menu'
import { useUiStore } from '../stores/uiStore'

export interface AppActions {
  openFolder: () => Promise<void>
  save: () => void
  newTask: () => void
  showView: (view: MenuAction extends never ? never : string) => void
  openRepo: () => void
  run: (action: MenuAction) => void
}

/**
 * メニュー（アプリ内バー／ネイティブ）から呼ばれる操作を 1 箇所に集約する。
 * ネイティブメニューのショートカットも同じ関数へ流し込む。
 */
export function useAppActions(): AppActions {
  const setView = useUiStore((s) => s.setView)
  const setWorkspace = useUiStore((s) => s.setWorkspace)
  const requestSave = useUiStore((s) => s.requestSave)
  const setBoardFormOpen = useUiStore((s) => s.setBoardFormOpen)
  const requestNewTask = useCallback((): void => {
    setView('board')
    setBoardFormOpen(true)
  }, [setView, setBoardFormOpen])

  const openFolder = useCallback(async (): Promise<void> => {
    try {
      const result = await window.nimbus.workspace.open()
      if (result.path) setWorkspace(result.path)
    } catch (error) {
      console.error('[nimbus:renderer] workspace open failed', error)
    }
  }, [setWorkspace])

  const openRepo = useCallback((): void => {
    // window.open は main の setWindowOpenHandler が openExternal に振り替える
    window.open(NIMBUS_REPO_URL, '_blank')
  }, [])

  const run = useCallback(
    (action: MenuAction): void => {
      if (action === 'open-folder') {
        void openFolder()
      } else if (action === 'save') {
        requestSave()
      } else if (action === 'new-task') {
        requestNewTask()
      } else if (action.startsWith('view:')) {
        const view = action.slice('view:'.length)
        setView(view as Parameters<typeof setView>[0])
      }
    },
    [openFolder, requestSave, requestNewTask, setView]
  )

  // ネイティブメニュー（ショートカット）からのアクションを受ける
  useEffect(() => {
    return window.nimbus.ui.onMenuAction((raw) => {
      const parsed = menuActionSchema.safeParse(raw)
      if (parsed.success) run(parsed.data)
    })
  }, [run])

  return useMemo(
    () => ({
      openFolder,
      save: requestSave,
      newTask: requestNewTask,
      showView: (view: string) => setView(view as Parameters<typeof setView>[0]),
      openRepo,
      run
    }),
    [openFolder, requestSave, requestNewTask, setView, openRepo, run]
  )
}

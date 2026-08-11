import type { MenuItemConstructorOptions } from 'electron'
import type { MenuAction } from '@shared/menu'

export interface MenuHandlers {
  send: (action: MenuAction) => void
  openRepo: () => void
}

/**
 * ネイティブメニューのテンプレート（ショートカット担当）。
 * アプリ内の上部メニューバー（VS Code 風）と同じアクション体系を共有する。
 * Electron に依存しない純粋なデータなのでテスト可能。
 */
export function buildMenuTemplate(
  handlers: MenuHandlers,
  options: { isMac: boolean; appName?: string }
): MenuItemConstructorOptions[] {
  const { send, openRepo } = handlers
  const appName = options.appName ?? 'Nimbus'

  const macAppMenu: MenuItemConstructorOptions[] = options.isMac
    ? [
        {
          label: appName,
          submenu: [
            { role: 'about', label: `${appName} について` },
            { type: 'separator' },
            { role: 'hide', label: `${appName} を隠す` },
            { role: 'hideOthers', label: 'ほかを隠す' },
            { role: 'unhide', label: 'すべて表示' },
            { type: 'separator' },
            { role: 'quit', label: `${appName} を終了` }
          ]
        }
      ]
    : []

  return [
    ...macAppMenu,
    {
      label: 'ファイル',
      submenu: [
        {
          label: 'フォルダを開く…',
          accelerator: 'CmdOrCtrl+O',
          click: () => send('open-folder')
        },
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => send('save')
        },
        { type: 'separator' },
        {
          label: '新しいタスク',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => send('new-task')
        },
        { type: 'separator' },
        options.isMac
          ? { role: 'close', label: 'ウィンドウを閉じる' }
          : { role: 'quit', label: '終了' }
      ]
    },
    {
      label: '編集',
      submenu: [
        { role: 'undo', label: '元に戻す' },
        { role: 'redo', label: 'やり直す' },
        { type: 'separator' },
        { role: 'cut', label: '切り取り' },
        { role: 'copy', label: 'コピー' },
        { role: 'paste', label: '貼り付け' },
        { role: 'selectAll', label: 'すべて選択' }
      ]
    },
    {
      label: '表示',
      submenu: [
        { label: 'コックピット', accelerator: 'CmdOrCtrl+1', click: () => send('view:cockpit') },
        { label: 'エディタ', accelerator: 'CmdOrCtrl+2', click: () => send('view:explorer') },
        { label: 'ボード', accelerator: 'CmdOrCtrl+3', click: () => send('view:board') },
        { label: 'レビュー', accelerator: 'CmdOrCtrl+4', click: () => send('view:review') },
        { label: '診断', accelerator: 'CmdOrCtrl+5', click: () => send('view:diagnostics') },
        { label: '設定', accelerator: 'CmdOrCtrl+,', click: () => send('view:settings') },
        { type: 'separator' },
        { role: 'reload', label: '再読み込み' },
        { role: 'toggleDevTools', label: '開発者ツール' },
        { type: 'separator' },
        { role: 'resetZoom', label: '拡大率をリセット' },
        { role: 'zoomIn', label: '拡大' },
        { role: 'zoomOut', label: '縮小' },
        { role: 'togglefullscreen', label: '全画面表示' }
      ]
    },
    {
      label: 'ヘルプ',
      submenu: [
        { label: 'GitHub リポジトリを開く', click: () => openRepo() },
        { label: '診断（不具合調査）', click: () => send('view:diagnostics') }
      ]
    }
  ]
}

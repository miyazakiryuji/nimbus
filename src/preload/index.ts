import { contextBridge } from 'electron'

// Renderer へ公開する Nimbus API（§3: raw な ipcRenderer は公開しない。
// 型付きのホワイトリスト API のみをここに追加していく。Step 2 で拡張）
const nimbus = {
  platform: process.platform
} as const

export type NimbusApi = typeof nimbus

if (import.meta.env.DEV) {
  // 起動確認チェックリスト用: sandbox / contextIsolation の実効値を出力する
  console.log(
    `[nimbus:preload] sandboxed=${process.sandboxed} contextIsolated=${process.contextIsolated}`
  )
}

if (!process.contextIsolated) {
  throw new Error('contextIsolation must be enabled (NIMBUS_SPEC §6-5)')
}

contextBridge.exposeInMainWorld('nimbus', nimbus)

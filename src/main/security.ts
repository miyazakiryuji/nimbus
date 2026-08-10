// NIMBUS_SPEC.md §6-5: 妥協不可のセキュリティフラグ。
// createMainWindow の webPreferences に必ずスプレッドする。
export const SECURITY_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
} as const

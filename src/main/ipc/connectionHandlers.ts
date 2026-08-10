import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import {
  connectionStateSchema,
  connectionTestResultSchema,
  profileSchema,
  type ConnectionState
} from '@shared/profiles'
import {
  connectionProfileIdRequestSchema,
  connectionSaveProfileRequestSchema,
  connectionSetActiveRequestSchema
} from '@shared/ipc-schemas'
import type { ConfigService } from '../services/ConfigService'
import type { ConnectionService } from '../services/ConnectionService'
import type { CredentialVault } from '../services/CredentialVault'

/** 接続設定（F-7）関連 IPC。機密の値は一切 renderer に返さない。 */
export function registerConnectionIpc(
  config: ConfigService,
  vault: CredentialVault,
  connection: ConnectionService
): void {
  const buildState = async (): Promise<ConnectionState> => {
    const file = config.loadProfiles()
    const hasStoredSecret: Record<string, boolean> = {}
    for (const p of file.profiles) {
      hasStoredSecret[p.id] = vault.hasSecret(p.id)
    }
    return connectionStateSchema.parse({
      profiles: file.profiles,
      activeProfileId: file.activeProfileId,
      binaryInfo: await connection.detectSystemBinary(),
      canPersistSecrets: await vault.canPersistSecrets(),
      hasStoredSecret
    })
  }

  ipcMain.handle(IPC_CHANNELS.connectionState, () => buildState())

  ipcMain.handle(IPC_CHANNELS.connectionSaveProfile, async (_event, raw: unknown) => {
    const req = connectionSaveProfileRequestSchema.parse(raw)
    const profile = profileSchema.parse(req.profile)
    config.upsertProfile(profile)
    if (req.secret !== undefined) {
      await vault.setSecret(profile.id, req.secret)
    }
    return buildState()
  })

  ipcMain.handle(IPC_CHANNELS.connectionDeleteProfile, async (_event, raw: unknown) => {
    const req = connectionProfileIdRequestSchema.parse(raw)
    config.deleteProfile(req.profileId)
    vault.deleteSecret(req.profileId)
    return buildState()
  })

  ipcMain.handle(IPC_CHANNELS.connectionSetActive, async (_event, raw: unknown) => {
    const req = connectionSetActiveRequestSchema.parse(raw)
    config.setActiveProfile(req.profileId)
    return buildState()
  })

  ipcMain.handle(IPC_CHANNELS.connectionTest, async () =>
    connectionTestResultSchema.parse(await connection.testConnection())
  )
}

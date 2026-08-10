import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import {
  DEFAULT_PROFILES_FILE,
  profilesFileSchema,
  type Profile,
  type ProfilesFile
} from '@shared/profiles'

/** 機密らしい名前の env キーは profiles.json に保存させない（§5/§6） */
const FORBIDDEN_ENV_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)/i

/**
 * ~/.nimbus/ 配下の設定ファイルの読み書き（§5）。
 * 不正な内容は警告して既定値へフォールバックする。
 */
export class ConfigService {
  private readonly dir: string
  private readonly profilesPath: string

  constructor(baseDir: string = join(homedir(), '.nimbus')) {
    this.dir = baseDir
    this.profilesPath = join(baseDir, 'profiles.json')
  }

  loadProfiles(): ProfilesFile {
    try {
      const raw = readFileSync(this.profilesPath, 'utf8')
      const parsed = profilesFileSchema.safeParse(JSON.parse(raw))
      if (parsed.success) return parsed.data
      console.warn('[nimbus:config] invalid profiles.json — falling back to defaults')
      // 共有既定オブジェクトを呼び出し側の変更から守るため必ず deep copy を返す
      return structuredClone(DEFAULT_PROFILES_FILE)
    } catch {
      return structuredClone(DEFAULT_PROFILES_FILE)
    }
  }

  saveProfiles(file: ProfilesFile): void {
    for (const profile of file.profiles) {
      this.assertNoSecretsInEnv(profile)
    }
    mkdirSync(this.dir, { recursive: true })
    writeFileSync(this.profilesPath, JSON.stringify(file, null, 2) + '\n')
  }

  upsertProfile(profile: Profile): ProfilesFile {
    this.assertNoSecretsInEnv(profile)
    const file = this.loadProfiles()
    const index = file.profiles.findIndex((p) => p.id === profile.id)
    if (index >= 0) {
      file.profiles[index] = profile
    } else {
      file.profiles.push(profile)
    }
    if (file.activeProfileId === null) {
      file.activeProfileId = profile.id
    }
    this.saveProfiles(file)
    return file
  }

  deleteProfile(profileId: string): ProfilesFile {
    const file = this.loadProfiles()
    file.profiles = file.profiles.filter((p) => p.id !== profileId)
    if (file.activeProfileId === profileId) {
      file.activeProfileId = file.profiles[0]?.id ?? null
    }
    this.saveProfiles(file)
    return file
  }

  setActiveProfile(profileId: string | null): ProfilesFile {
    const file = this.loadProfiles()
    if (profileId !== null && !file.profiles.some((p) => p.id === profileId)) {
      throw new Error(`Unknown profile: ${profileId}`)
    }
    file.activeProfileId = profileId
    this.saveProfiles(file)
    return file
  }

  getActiveProfile(): Profile | undefined {
    const file = this.loadProfiles()
    return file.profiles.find((p) => p.id === file.activeProfileId)
  }

  private assertNoSecretsInEnv(profile: Profile): void {
    for (const name of Object.keys(profile.env)) {
      if (FORBIDDEN_ENV_NAME.test(name)) {
        throw new Error(
          `Profile env must not contain secrets (${name}). Use the credential vault instead. (§5/§6)`
        )
      }
    }
  }
}

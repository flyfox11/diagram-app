import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppSettings, RepoConfig, StorageProvider, ProviderConfig } from '@/types/diagram'

const isDev = import.meta.env.DEV

const EMPTY_CONFIG: ProviderConfig = { token: '', owner: '', repo: '', branch: '' }

const DEV_GITHUB: ProviderConfig = {
  token: 'github_pat_dev_mode_fake_token',
  owner: 'flyfox11',
  repo: 'diagram-app',
  branch: 'main',
}

/** 根据当前 settings 计算激活的 token / repoConfig / isConfigured */
function computeActive(settings: AppSettings) {
  const config = settings[settings.provider]
  return {
    activeToken: config.token,
    activeRepoConfig: {
      provider: settings.provider,
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
    } as RepoConfig,
    isConfigured: !!(config.token && config.owner && config.repo),
  }
}

interface SettingsState {
  settings: AppSettings
  isConfigured: boolean
  activeToken: string
  activeRepoConfig: RepoConfig
  setProvider: (provider: StorageProvider) => void
  setProviderConfig: (provider: StorageProvider, config: Partial<ProviderConfig>) => void
  setAutoSave: (enabled: boolean) => void
  clearSettings: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: {
        provider: 'github',
        github: isDev ? DEV_GITHUB : EMPTY_CONFIG,
        gitee: EMPTY_CONFIG,
        autoSave: false,
      },
      isConfigured: isDev,
      activeToken: isDev ? DEV_GITHUB.token : '',
      activeRepoConfig: {
        provider: 'github',
        ...(isDev ? DEV_GITHUB : EMPTY_CONFIG),
      },

      setProvider: (provider) =>
        set((state) => {
          const settings = { ...state.settings, provider }
          return { settings, ...computeActive(settings) }
        }),

      setProviderConfig: (provider, config) =>
        set((state) => {
          const newProviderConfig = { ...state.settings[provider], ...config }
          const settings = { ...state.settings, [provider]: newProviderConfig }
          return { settings, ...computeActive(settings) }
        }),

      setAutoSave: (enabled) =>
        set((state) => ({
          settings: { ...state.settings, autoSave: enabled },
        })),

      clearSettings: () =>
        set({
          settings: { provider: 'github', github: EMPTY_CONFIG, gitee: EMPTY_CONFIG, autoSave: false },
          isConfigured: false,
          activeToken: '',
          activeRepoConfig: { provider: 'github', ...EMPTY_CONFIG },
        }),
    }),
    {
      name: 'diagram-app-settings',
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        if (version < 2) {
          const old = persistedState as { settings?: { token?: string; repoConfig?: { provider?: StorageProvider; owner?: string; repo?: string; branch?: string }; autoSave?: boolean } }
          if (old?.settings?.repoConfig) {
            const rc = old.settings.repoConfig
            const providerConfig: ProviderConfig = {
              token: old.settings.token || '',
              owner: rc.owner || '',
              repo: rc.repo || '',
              branch: rc.branch || '',
            }
            const newSettings: AppSettings = {
              provider: rc.provider || 'github',
              github: rc.provider === 'github' ? providerConfig : EMPTY_CONFIG,
              gitee: rc.provider === 'gitee' ? providerConfig : EMPTY_CONFIG,
              autoSave: old.settings.autoSave ?? false,
            }
            return { settings: newSettings, ...computeActive(newSettings) }
          }
        }
        return persistedState as SettingsState
      },
    }
  )
)

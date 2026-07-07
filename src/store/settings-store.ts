import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppSettings, RepoConfig, StorageProvider } from '@/types/diagram'

const DEFAULT_REPO: RepoConfig = {
  provider: 'github',
  owner: '',
  repo: '',
  branch: 'main',
}

interface SettingsState {
  settings: AppSettings
  isConfigured: boolean
  setToken: (token: string) => void
  setRepoConfig: (config: Partial<RepoConfig>) => void
  setProvider: (provider: StorageProvider) => void
  setAutoSave: (enabled: boolean) => void
  clearSettings: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: {
        token: '',
        repoConfig: { ...DEFAULT_REPO },
        autoSave: false,
      },
      isConfigured: false,

      setToken: (token: string) =>
        set((state) => {
          const newSettings = {
            ...state.settings,
            token,
          }
          return {
            settings: newSettings,
            isConfigured: !!(token && newSettings.repoConfig.owner && newSettings.repoConfig.repo),
          }
        }),

      setRepoConfig: (config: Partial<RepoConfig>) =>
        set((state) => {
          const newConfig = { ...state.settings.repoConfig, ...config }
          const newSettings = { ...state.settings, repoConfig: newConfig }
          return {
            settings: newSettings,
            isConfigured: !!(newSettings.token && newConfig.owner && newConfig.repo),
          }
        }),

      setProvider: (provider: StorageProvider) =>
        set((state) => {
          const newConfig = { ...state.settings.repoConfig, provider }
          const newSettings = { ...state.settings, repoConfig: newConfig }
          return {
            settings: newSettings,
            isConfigured: !!(newSettings.token && newConfig.owner && newConfig.repo),
          }
        }),

      setAutoSave: (enabled: boolean) =>
        set((state) => ({
          settings: { ...state.settings, autoSave: enabled },
        })),

      clearSettings: () =>
        set({
          settings: { token: '', repoConfig: { ...DEFAULT_REPO }, autoSave: false },
          isConfigured: false,
        }),
    }),
    {
      name: 'diagram-app-settings',
    }
  )
)

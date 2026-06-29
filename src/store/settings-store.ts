import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppSettings, RepoConfig } from '@/types/diagram'

const DEFAULT_REPO: RepoConfig = {
  owner: '',
  repo: '',
  branch: 'main',
}

interface SettingsState {
  settings: AppSettings
  isConfigured: boolean
  setToken: (token: string) => void
  setRepoConfig: (config: Partial<RepoConfig>) => void
  clearSettings: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: {
        githubToken: '',
        repoConfig: { ...DEFAULT_REPO },
      },
      isConfigured: false,

      setToken: (token: string) =>
        set((state) => {
          const newSettings = {
            ...state.settings,
            githubToken: token,
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
            isConfigured: !!(newSettings.githubToken && newConfig.owner && newConfig.repo),
          }
        }),

      clearSettings: () =>
        set({
          settings: { githubToken: '', repoConfig: { ...DEFAULT_REPO } },
          isConfigured: false,
        }),
    }),
    {
      name: 'diagram-app-settings',
    }
  )
)

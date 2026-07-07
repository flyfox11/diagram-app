/**
 * 统一 API 层：开发模式走本地 Vite 中间件，生产模式按 provider 走 GitHub/Gitee REST API。
 * import.meta.env.DEV 是 Vite 编译时常量，未使用的分支会被 tree-shake。
 */

import type { DiagramData, DiagramMeta, RepoConfig } from '@/types/diagram'
import * as githubApi from './github-api'
import * as giteeApi from './gitee-api'
import * as localApi from './local-storage'

function getRemoteApi(config: RepoConfig) {
  return config.provider === 'gitee' ? giteeApi : githubApi
}

export async function listDiagrams(
  token?: string,
  config?: RepoConfig
): Promise<DiagramMeta[]> {
  if (import.meta.env.DEV) {
    return localApi.listDiagrams()
  }
  return getRemoteApi(config!).listDiagrams(token!, config!)
}

export async function getDiagram(
  token: string | undefined,
  config: RepoConfig | undefined,
  filename: string
): Promise<DiagramData> {
  if (import.meta.env.DEV) {
    return localApi.getDiagram(filename)
  }
  return getRemoteApi(config!).getDiagram(token!, config!, filename)
}

export async function saveDiagram(
  token: string | undefined,
  config: RepoConfig | undefined,
  filename: string,
  data: DiagramData
): Promise<void> {
  if (import.meta.env.DEV) {
    return localApi.saveDiagram(filename, data)
  }
  return getRemoteApi(config!).saveDiagram(token!, config!, filename, data)
}

export async function deleteDiagram(
  token: string | undefined,
  config: RepoConfig | undefined,
  filename: string
): Promise<void> {
  if (import.meta.env.DEV) {
    return localApi.deleteDiagram(filename)
  }
  return getRemoteApi(config!).deleteDiagram(token!, config!, filename)
}

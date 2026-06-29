/**
 * 统一 API 层：开发模式走本地 Vite 中间件，生产模式走 GitHub REST API。
 * import.meta.env.DEV 是 Vite 编译时常量，未使用的分支会被 tree-shake。
 */

import type { DiagramData, DiagramMeta, RepoConfig } from '@/types/diagram'
import * as githubApi from './github-api'
import * as localApi from './local-storage'

// 开发模式下是否需要 GitHub 配置？不需要，直接走本地文件。
// 但为了保持接口一致，这里仍接收可选参数（生产模式必需）。

export async function listDiagrams(
  token?: string,
  config?: RepoConfig
): Promise<DiagramMeta[]> {
  if (import.meta.env.DEV) {
    return localApi.listDiagrams()
  }
  return githubApi.listDiagrams(token!, config!)
}

export async function getDiagram(
  token: string | undefined,
  config: RepoConfig | undefined,
  filename: string
): Promise<DiagramData> {
  if (import.meta.env.DEV) {
    return localApi.getDiagram(filename)
  }
  return githubApi.getDiagram(token!, config!, filename)
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
  return githubApi.saveDiagram(token!, config!, filename, data)
}

export async function deleteDiagram(
  token: string | undefined,
  config: RepoConfig | undefined,
  filename: string
): Promise<void> {
  if (import.meta.env.DEV) {
    return localApi.deleteDiagram(filename)
  }
  return githubApi.deleteDiagram(token!, config!, filename)
}

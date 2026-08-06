import type { Node, Edge } from '@xyflow/react'

/** 流程图文件元信息 */
export interface DiagramMeta {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

/** 完整的流程图数据 */
export interface DiagramData extends DiagramMeta {
  nodes: Node[]
  edges: Edge[]
  viewport: {
    x: number
    y: number
    zoom: number
  }
  diagramType?: 'flowchart' | 'mindmap'
}

/** Markdown 文档条目 */
export interface MarkdownEntry {
  content: string
  updatedAt: string
}

/** Markdown 文档集合（按 nodeId 索引） */
export type MarkdownData = Record<string, MarkdownEntry>

/** 存储平台 */
export type StorageProvider = 'github' | 'gitee'

/** 仓库配置（API 层使用） */
export interface RepoConfig {
  provider: StorageProvider
  owner: string
  repo: string
  branch: string
}

/** 单个平台的连接配置 */
export interface ProviderConfig {
  token: string
  owner: string
  repo: string
  branch: string
}

/** 应用全局设置 */
export interface AppSettings {
  provider: StorageProvider
  github: ProviderConfig
  gitee: ProviderConfig
  autoSave: boolean
}


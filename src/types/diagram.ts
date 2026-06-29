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

/** GitHub 仓库配置 */
export interface RepoConfig {
  owner: string
  repo: string
  branch: string
}

/** 应用全局设置 */
export interface AppSettings {
  githubToken: string
  repoConfig: RepoConfig
}

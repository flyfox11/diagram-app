import type { DiagramData, DiagramMeta } from '@/types/diagram'

const API_BASE = '/api/local'

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `${res.status}` }))
    throw new Error((err as { error?: string }).error || `请求失败: ${res.status}`)
  }
  return res.json()
}

/** 获取本地文件列表 */
export async function listDiagrams(): Promise<DiagramMeta[]> {
  return request<DiagramMeta[]>('/list')
}

/** 读取单个流程图 */
export async function getDiagram(filename: string): Promise<DiagramData> {
  return request<DiagramData>(`/file/${encodeURIComponent(filename)}`)
}

/** 保存流程图 */
export async function saveDiagram(
  filename: string,
  data: DiagramData
): Promise<void> {
  await request('/file/' + encodeURIComponent(filename), {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/** 删除流程图 */
export async function deleteDiagram(filename: string): Promise<void> {
  await request('/file/' + encodeURIComponent(filename), {
    method: 'DELETE',
  })
}

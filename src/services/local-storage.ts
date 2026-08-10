import type { DiagramData, DiagramMeta, MarkdownData } from '@/types/diagram'

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

/** 读取 Markdown 文档集合（文件不存在时返回空对象） */
export async function getMarkdown(filename: string): Promise<MarkdownData> {
  try {
    return await request<MarkdownData>(`/file/${encodeURIComponent(filename)}`)
  } catch {
    return {}
  }
}

/** 保存 Markdown 文档集合 */
export async function saveMarkdown(
  filename: string,
  data: MarkdownData
): Promise<void> {
  await request('/file/' + encodeURIComponent(filename), {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

/** 删除 Markdown 文档集合 */
export async function deleteMarkdown(filename: string): Promise<void> {
  try {
    await request('/file/' + encodeURIComponent(filename), {
      method: 'DELETE',
    })
  } catch {
    // 文件不存在时静略忽略
  }
}

// ---- 图片文件 CRUD ----

/** 上传图片（base64 内容写入 json/imgs/ 下的二进制文件） */
export async function uploadImage(
  filename: string,
  base64Data: string
): Promise<void> {
  await request('/img/' + encodeURIComponent(filename), {
    method: 'PUT',
    body: JSON.stringify({ content: base64Data }),
  })
}

/** 获取图片可直接访问的 URL（本地直连中间件端点） */
export function resolveImageUrl(filename: string): string {
  return `${API_BASE}/img/${encodeURIComponent(filename)}`
}

import type { DiagramData, DiagramMeta, RepoConfig } from '@/types/diagram'

const API_BASE = 'https://api.github.com'

function getHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

/** Base64 编码（Unicode 安全） */
function toBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
}

/** Base64 解码（Unicode 安全） */
function fromBase64(str: string): string {
  return decodeURIComponent(escape(atob(str)))
}

/** 获取 json/ 目录下的文件列表 */
export async function listDiagrams(
  token: string,
  config: RepoConfig
): Promise<DiagramMeta[]> {
  const url = `${API_BASE}/repos/${config.owner}/${config.repo}/contents/json?ref=${config.branch}`
  const res = await fetch(url, { headers: getHeaders(token) })

  if (res.status === 404) return []

  if (!res.ok) {
    throw new Error(`获取文件列表失败: ${res.status} ${res.statusText}`)
  }

  const files: Array<{ name: string; download_url: string }> = await res.json()

  // 并发获取每个 JSON 文件的元信息
  const metas = await Promise.all(
    files
      .filter((f) => f.name.endsWith('.json'))
      .map(async (file) => {
        const data = await fetch(file.download_url).then((r) => r.json())
        return {
          id: data.id || file.name.replace('.json', ''),
          name: data.name || '未命名',
          createdAt: data.createdAt || '',
          updatedAt: data.updatedAt || '',
        }
      })
  )

  return metas.sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
}

/** 读取单个流程图 */
export async function getDiagram(
  token: string,
  config: RepoConfig,
  filename: string
): Promise<DiagramData> {
  const url = `${API_BASE}/repos/${config.owner}/${config.repo}/contents/json/${filename}?ref=${config.branch}`
  const res = await fetch(url, { headers: getHeaders(token) })

  if (!res.ok) {
    throw new Error(`读取文件失败: ${res.status}`)
  }

  const file: { content: string } = await res.json()
  return JSON.parse(fromBase64(file.content))
}

/** 保存/更新流程图 */
export async function saveDiagram(
  token: string,
  config: RepoConfig,
  filename: string,
  data: DiagramData
): Promise<void> {
  const path = `json/${filename}`
  const url = `${API_BASE}/repos/${config.owner}/${config.repo}/contents/${path}`

  // 先尝试获取 sha（更新时需要）
  let sha: string | undefined
  try {
    const checkRes = await fetch(url, { headers: getHeaders(token) })
    if (checkRes.ok) {
      const existing: { sha: string } = await checkRes.json()
      sha = existing.sha
    }
  } catch {
    // 文件不存在，是新建
  }

  const content = JSON.stringify(data, null, 2)
  const body: Record<string, unknown> = {
    message: `Update ${filename}`,
    content: toBase64(content),
    branch: config.branch,
  }
  if (sha) body.sha = sha

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      ...getHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      `保存失败: ${res.status} ${(err as { message?: string }).message || ''}`
    )
  }
}

/** 删除流程图 */
export async function deleteDiagram(
  token: string,
  config: RepoConfig,
  filename: string
): Promise<void> {
  const path = `json/${filename}`
  const url = `${API_BASE}/repos/${config.owner}/${config.repo}/contents/${path}`

  // 必须先获取 sha
  const checkRes = await fetch(url, { headers: getHeaders(token) })
  if (!checkRes.ok) throw new Error(`文件不存在: ${checkRes.status}`)

  const { sha } = await checkRes.json()

  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      ...getHeaders(token),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Delete ${filename}`,
      sha,
      branch: config.branch,
    }),
  })

  if (!res.ok) {
    throw new Error(`删除失败: ${res.status}`)
  }
}

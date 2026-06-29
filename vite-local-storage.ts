import fs from 'fs'
import path from 'path'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import type { Plugin, ViteDevServer } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const JSON_DIR = path.resolve(__dirname, 'json')

// 确保 json/ 目录存在
if (!fs.existsSync(JSON_DIR)) {
  fs.mkdirSync(JSON_DIR, { recursive: true })
}

function parseBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk: string) => (body += chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(body))
      } catch {
        resolve(null)
      }
    })
  })
}

function jsonResponse(
  res: any,
  status: number,
  data: unknown
) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

export default function viteLocalStorage(): Plugin {
  return {
    name: 'vite-local-storage',
    configureServer(server: ViteDevServer) {
      // 处理 /api/local/* 请求
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/local/')) {
          return next()
        }

        const url = new URL(req.url, 'http://localhost')

        try {
          // GET /api/local/list
          if (req.method === 'GET' && url.pathname === '/api/local/list') {
            if (!fs.existsSync(JSON_DIR)) {
              return jsonResponse(res, 200, [])
            }
            const files = fs
              .readdirSync(JSON_DIR)
              .filter((f) => f.endsWith('.json'))
            const metas = files.map((f) => {
              const content = JSON.parse(
                fs.readFileSync(path.join(JSON_DIR, f), 'utf-8')
              )
              return {
                id: content.id || f.replace('.json', ''),
                name: content.name || '未命名',
                createdAt: content.createdAt || '',
                updatedAt: content.updatedAt || '',
              }
            })
            metas.sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime()
            )
            return jsonResponse(res, 200, metas)
          }

          // GET /api/local/file/:filename
          const fileMatch = url.pathname.match(/^\/api\/local\/file\/(.+)$/)
          if (req.method === 'GET' && fileMatch) {
            const filename = decodeURIComponent(fileMatch[1])
            const filePath = path.join(JSON_DIR, filename)
            if (!fs.existsSync(filePath)) {
              return jsonResponse(res, 404, { error: '文件不存在' })
            }
            const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
            return jsonResponse(res, 200, content)
          }

          // PUT /api/local/file/:filename
          if (req.method === 'PUT' && fileMatch) {
            const filename = decodeURIComponent(fileMatch[1])
            const filePath = path.join(JSON_DIR, filename)
            const data = await parseBody(req)
            if (!data) {
              return jsonResponse(res, 400, { error: '无效的 JSON 数据' })
            }
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
            return jsonResponse(res, 200, { ok: true })
          }

          // DELETE /api/local/file/:filename
          if (req.method === 'DELETE' && fileMatch) {
            const filename = decodeURIComponent(fileMatch[1])
            const filePath = path.join(JSON_DIR, filename)
            if (!fs.existsSync(filePath)) {
              return jsonResponse(res, 404, { error: '文件不存在' })
            }
            fs.unlinkSync(filePath)
            return jsonResponse(res, 200, { ok: true })
          }

          jsonResponse(res, 404, { error: '未知的本地 API 路径' })
        } catch (e) {
          jsonResponse(res, 500, { error: (e as Error).message })
        }
      })
    },
  }
}

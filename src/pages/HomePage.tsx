import { useNavigate } from 'react-router-dom'
import {
  Plus,
  FolderOpen,
  Settings,
  RefreshCw,
  Trash2,
  Workflow,
  Brain,
  Upload,
  Download,
  AlertTriangle,
  PackageCheck,
} from 'lucide-react'
import JSZip from 'jszip'
import { useDiagramStore } from '@/store/diagram-store'
import { useSettingsStore } from '@/store/settings-store'
import { listDiagrams, deleteDiagram, getDiagram, saveDiagram } from '@/services/api'
import type { DiagramData } from '@/types/diagram'
import { useEffect, useState, useRef } from 'react'

interface HomePageProps {
  onOpenSettings: () => void
}

export default function HomePage({ onOpenSettings }: HomePageProps) {
  const navigate = useNavigate()
  const {
    fileList,
    fileListLoading,
    fileListError,
    setFileList,
    setFileListLoading,
    setFileListError,
  } = useDiagramStore()
  const { settings, isConfigured } = useSettingsStore()

  const [deleting, setDeleting] = useState<string | null>(null)
  const [showNewMenu, setShowNewMenu] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [exportingAll, setExportingAll] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ filename: string; displayName: string } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 点击外部关闭新建菜单
  useEffect(() => {
    if (!showNewMenu) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowNewMenu(false)
      }
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [showNewMenu])

  const handleNew = (type: 'flowchart' | 'mindmap') => {
    setShowNewMenu(false)
    navigate(`/editor/new?type=${type}`)
  }

  // 导出单个流程图为 JSON 文件
  const handleExport = async (file: { id: string; name: string }) => {
    setExporting(file.id)
    try {
      const data = await getDiagram(
        settings.githubToken,
        settings.repoConfig,
        `${file.id}.json`
      )
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${file.name || file.id}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`导出失败: ${(e as Error).message}`)
    } finally {
      setExporting(null)
    }
  }

  // 导入 JSON 文件（支持单个、多个、ZIP）
  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  // 导入单个 JSON 数据到存储
  const importOne = async (jsonText: string, fallbackName: string): Promise<boolean> => {
    try {
      const data = JSON.parse(jsonText) as DiagramData
      if (!data.nodes || !data.edges) return false

      const newId = `imported-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const newName = data.name || fallbackName
      const now = new Date().toISOString()
      const diagramData: DiagramData = {
        ...data,
        id: newId,
        name: newName,
        createdAt: data.createdAt || now,
        updatedAt: now,
      }
      await saveDiagram(
        settings.githubToken,
        settings.repoConfig,
        `${newId}.json`,
        diagramData
      )
      return true
    } catch {
      return false
    }
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    setImporting(true)
    let success = 0
    let failed = 0

    try {
      for (const file of files) {
        if (file.name.toLowerCase().endsWith('.zip')) {
          // ZIP 文件：解压并导入所有 JSON
          const zip = await JSZip.loadAsync(file)
          const jsonEntries = Object.values(zip.files).filter(
            (f) => !f.dir && f.name.toLowerCase().endsWith('.json')
          )
          for (const entry of jsonEntries) {
            const text = await entry.async('string')
            const name = entry.name.replace(/\.json$/i, '').split('/').pop() || '导入'
            const ok = await importOne(text, name)
            ok ? success++ : failed++
          }
        } else if (file.name.toLowerCase().endsWith('.json')) {
          // JSON 文件
          const text = await file.text()
          const name = file.name.replace(/\.json$/i, '')
          const ok = await importOne(text, name)
          ok ? success++ : failed++
        } else {
          failed++
        }
      }
      await fetchList()

      if (success > 0 && failed === 0) {
        // 全部成功
      } else if (success > 0 && failed > 0) {
        alert(`导入完成：成功 ${success} 个，失败 ${failed} 个`)
      } else if (success === 0) {
        alert('导入失败：文件格式不正确')
      }
    } catch (e) {
      alert(`导入失败: ${(e as Error).message}`)
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  // 一键导出全部为 ZIP
  const handleExportAll = async () => {
    if (fileList.length === 0) return
    setExportingAll(true)
    try {
      const zip = new JSZip()
      for (const file of fileList) {
        const data = await getDiagram(
          settings.githubToken,
          settings.repoConfig,
          `${file.id}.json`
        )
        const name = (file.name || file.id).replace(/[\\/:*?"<>|]/g, '_')
        zip.file(`${name}.json`, JSON.stringify(data, null, 2))
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const date = new Date().toISOString().slice(0, 10)
      a.download = `diagrams-${date}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`导出失败: ${(e as Error).message}`)
    } finally {
      setExportingAll(false)
    }
  }

  const fetchList = async () => {
    if (!import.meta.env.DEV && !isConfigured) return
    setFileListLoading(true)
    setFileListError(null)
    try {
      const list = await listDiagrams(
        settings.githubToken,
        settings.repoConfig
      )
      setFileList(list)
    } catch (e) {
      setFileListError((e as Error).message)
    } finally {
      setFileListLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
  }, [isConfigured])

  const handleDeleteClick = (filename: string, displayName: string) => {
    setDeleteConfirm({ filename, displayName })
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    const filename = deleteConfirm.filename
    setDeleteConfirm(null)
    setDeleting(filename)
    try {
      await deleteDiagram(
        settings.githubToken,
        settings.repoConfig,
        filename
      )
      await fetchList()
    } catch (e) {
      alert(`删除失败: ${(e as Error).message}`)
    } finally {
      setDeleting(null)
    }
  }

  if (!import.meta.env.DEV && !isConfigured) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Settings className="w-16 h-16 mx-auto mb-4 text-gray-500" />
          <h1 className="text-2xl font-bold mb-2 text-gray-200">欢迎使用流程图编辑器</h1>
          <p className="text-gray-400 mb-6">请先配置 GitHub Token 和仓库信息</p>
          <button
            onClick={onOpenSettings}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            开始配置
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">流程图编辑器</h1>
          <p className="text-gray-400 text-sm mt-1">
            {settings.repoConfig.owner}/{settings.repoConfig.repo} /json/
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleImportClick}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {importing ? '导入中...' : '导入'}
          </button>
          <button
            onClick={handleExportAll}
            disabled={exportingAll || fileList.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <PackageCheck className="w-4 h-4" />
            {exportingAll ? '导出中...' : '导出全部'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.zip"
            multiple
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={fetchList}
            disabled={fileListLoading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-4 h-4 ${fileListLoading ? 'animate-spin' : ''}`}
            />
            刷新
          </button>
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors"
          >
            <Settings className="w-4 h-4" />
            设置
          </button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowNewMenu(!showNewMenu)}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              新建
            </button>
            {showNewMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[150px]">
                <button
                  onClick={() => handleNew('flowchart')}
                  className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                >
                  <Workflow className="w-4 h-4 text-blue-400" />
                  流程图
                </button>
                <button
                  onClick={() => handleNew('mindmap')}
                  className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                >
                  <Brain className="w-4 h-4 text-purple-400" />
                  思维导图
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {fileListError && (
        <div className="mb-4 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
          {fileListError}
        </div>
      )}

      {/* File List */}
      {fileListLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-500" />
        </div>
      ) : fileList.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FolderOpen className="w-16 h-16 mx-auto mb-4 text-gray-600" />
            <p className="text-gray-500 mb-4">暂无流程图文件</p>
            <button
              onClick={() => setShowNewMenu(true)}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              + 新建
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {fileList.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-gray-700 transition-colors cursor-pointer group"
              onClick={() => navigate(`/editor/${file.id}`)}
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-200 truncate">
                  {file.name}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  更新于 {new Date(file.updatedAt).toLocaleString('zh-CN')}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleExport(file)
                }}
                disabled={exporting === file.id}
                className="p-2 text-gray-600 hover:text-blue-400 hover:bg-blue-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                title="导出 JSON"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteClick(`${file.id}.json`, file.name)
                }}
                disabled={deleting === `${file.id}.json`}
                className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="w-80 bg-gray-800 border border-gray-600 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center px-6 pt-6 pb-4">
              <div className="w-12 h-12 rounded-full bg-red-900/40 flex items-center justify-center mb-3">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-gray-100 font-semibold text-base mb-1">确认删除</h3>
              <p className="text-gray-400 text-sm text-center">
                确定要删除「<span className="text-gray-200 font-medium">{deleteConfirm.displayName}</span>」吗？
              </p>
              <p className="text-gray-600 text-xs mt-1">删除后不可恢复</p>
            </div>
            <div className="flex gap-0 border-t border-gray-700">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 text-gray-300 hover:bg-gray-700/50 transition-colors text-sm font-medium"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-3 text-red-400 hover:bg-red-900/40 transition-colors text-sm font-medium border-l border-gray-700"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Save,
  Settings,
  CheckCircle,
  XCircle,
  Network,
  List,
  Undo2,
  Redo2,
  Download,
  FileJson,
  Image as ImageIcon,
  ChevronDown,
} from 'lucide-react'
import {
  ReactFlowProvider,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  useReactFlow,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
} from '@xyflow/react'
import { useDiagramStore } from '@/store/diagram-store'
import { useSettingsStore } from '@/store/settings-store'
import { saveDiagram, getDiagram } from '@/services/api'
import { exportElementAsPng } from '@/utils/export-png'
import Canvas from '@/components/Editor/Canvas'
import NodePalette from '@/components/Editor/NodePalette'
import OutlineView from '@/components/Editor/OutlineView'
import { useEffect, useCallback, useState, useRef } from 'react'

interface EditorPageProps {
  onOpenSettings: () => void
}

export default function EditorPage({ onOpenSettings }: EditorPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { settings, isConfigured } = useSettingsStore()

  const {
    currentFile,
    currentName,
    createdAt,
    nodes,
    edges,
    viewport,
    isDirty,
    saving,
    saveError,
    diagramType,
    loadDiagram,
    setName,
    updateNodes,
    updateEdges,
    setSaving,
    setSaveError,
    markClean,
    resetEditor,
    setDiagramType,
    viewMode,
    setViewMode,
    undo,
    redo,
    _past,
    _future,
    pushHistory,
  } = useDiagramStore()

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  // 加载已有文件（dev 模式不需要 isConfigured）
  const [diagramLoading, setDiagramLoading] = useState(false)

  useEffect(() => {
    if (!id || id === 'new') {
      resetEditor()
      const type = searchParams.get('type')
      if (type === 'mindmap' || type === 'flowchart') {
        setDiagramType(type)
      }
      return
    }
    if (!import.meta.env.DEV && !isConfigured) {
      resetEditor()
      return
    }

    // 立即清空旧数据，避免显示上一个图的内容
    resetEditor()
    setDiagramLoading(true)

    const filename = `${id}.json`
    getDiagram(settings.githubToken, settings.repoConfig, filename)
      .then((data) => {
        loadDiagram(data)
        setDiagramLoading(false)
      })
      .catch((e) => {
        setSaveError(`加载失败: ${(e as Error).message}`)
        setDiagramLoading(false)
      })
  }, [id, isConfigured, searchParams, setDiagramType])

  const handleSave = useCallback(async () => {
    if (!import.meta.env.DEV && !isConfigured) return
    setSaving(true)
    setSaveError(null)

    const fileId = currentFile || `flow-${Date.now()}`
    const filename = `${fileId}.json`

    try {
      await saveDiagram(settings.githubToken, settings.repoConfig, filename, {
        id: fileId,
        name: currentName || '未命名',
        createdAt: createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        nodes,
        edges,
        viewport,
        diagramType,
      })
      markClean()
      showToast('success', '保存成功')
      if (!currentFile) {
        navigate(`/editor/${fileId}`, { replace: true })
      }
    } catch (e) {
      const errMsg = (e as Error).message
      setSaveError(errMsg)
      showToast('error', `保存失败: ${errMsg}`)
    } finally {
      setSaving(false)
    }
  }, [
    currentFile,
    currentName,
    nodes,
    edges,
    viewport,
    diagramType,
    isConfigured,
    settings,
  ])

  // Ctrl+S 保存 / Ctrl+Z 撤销 / Ctrl+Shift+Z 恢复
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave, undo, redo])

  // 导出 JSON
  const handleExportJson = useCallback(() => {
    setShowExportMenu(false)
    const fileId = currentFile || `flow-${Date.now()}`
    const data = {
      id: fileId,
      name: currentName || '未命名',
      createdAt: createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes,
      edges,
      viewport,
      diagramType,
    }
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentName || fileId}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('success', 'JSON 已导出')
  }, [currentFile, currentName, createdAt, nodes, edges, viewport, diagramType])

  // PNG 导出（由 PngExportBridge 注入函数，用 ref 避免 useState 把函数当 updater 执行）
  const exportPngRef = useRef<(() => Promise<void>) | null>(null)
  const [pngReady, setPngReady] = useState(false)
  const [exportingPng, setExportingPng] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  const handleExportPng = useCallback(async () => {
    const fn = exportPngRef.current
    if (!fn) return
    setShowExportMenu(false)
    setExportingPng(true)
    try {
      await fn()
      showToast('success', 'PNG 已导出')
    } catch (e) {
      showToast('error', `导出失败: ${(e as Error).message}`)
    } finally {
      setExportingPng(false)
    }
  }, [])

  // 点击外部关闭导出菜单
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false)
      }
    }
    if (showExportMenu) {
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }
  }, [showExportMenu])

  // React Flow 变更处理
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      // 删除操作推入历史
      if (changes.some((c) => c.type === 'remove')) {
        pushHistory()
      }
      updateNodes((nds) => applyNodeChanges(changes, nds))
    },
    [updateNodes, pushHistory]
  )

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      if (changes.some((c) => c.type === 'remove')) {
        pushHistory()
      }
      updateEdges((eds) => applyEdgeChanges(changes, eds))
    },
    [updateEdges, pushHistory]
  )

  const onConnect: OnConnect = useCallback(
    (connection) => {
      pushHistory()
      updateEdges((eds) => addEdge(connection, eds))
    },
    [updateEdges, pushHistory]
  )

  return (
    <div className="flex-1 flex flex-col">
      {/* Toolbar */}
      <div className="relative flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={currentName}
            onChange={(e) => setName(e.target.value)}
            placeholder={diagramType === 'mindmap' ? '思维导图名称' : '流程图名称'}
            className="bg-transparent text-gray-200 text-lg font-medium outline-none border-b border-transparent hover:border-gray-600 focus:border-blue-500 px-1"
          />
          {isDirty && (
            <span className="text-xs text-yellow-500">● 未保存</span>
          )}
        </div>

        {/* 顶部居中: 类型标识 or 模式切换 */}
        <div className="absolute left-1/2 -translate-x-1/2">
          {diagramType === 'mindmap' ? (
            <div className="flex items-center bg-gray-800 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('graph')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'graph'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Network className="w-3.5 h-3.5" />
                思维导图
              </button>
              <button
                onClick={() => setViewMode('outline')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'outline'
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                目录
              </button>
            </div>
          ) : (
            <span className="text-sm font-medium text-blue-400">📊 流程图</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={_past.length === 0}
            title="撤销 (Ctrl+Z)"
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={_future.length === 0}
            title="恢复 (Ctrl+Shift+Z)"
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          {saveError && (
            <span className="text-xs text-red-400 mr-2">{saveError}</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || (!import.meta.env.DEV && !isConfigured)}
            className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors text-sm"
          >
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '保存'}
          </button>

          {/* 导出下拉菜单 */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors text-sm"
            >
              <Download className="w-4 h-4" />
              导出
              <ChevronDown className="w-3 h-3" />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50">
                <button
                  onClick={handleExportJson}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
                >
                  <FileJson className="w-4 h-4 text-blue-400" />
                  导出 JSON
                </button>
                <div className="border-t border-gray-700" />
                <button
                  onClick={handleExportPng}
                  disabled={!pngReady || exportingPng}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ImageIcon className="w-4 h-4 text-green-400" />
                  {exportingPng ? '导出中...' : '导出 PNG'}
                </button>
              </div>
            )}
          </div>

          <button
            onClick={onOpenSettings}
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 flex overflow-hidden">
        {diagramType === 'mindmap' && viewMode === 'outline' ? (
          /* 目录模式 */
          <OutlineView />
        ) : (
          <ReactFlowProvider>
            {/* 左侧节点面板（仅流程图模式） */}
            {diagramType === 'flowchart' && <NodePalette />}

            {/* 画布 */}
            <div className="flex-1 relative">
              <Canvas
                nodes={nodes}
                edges={edges}
                defaultViewport={viewport}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
              />
              {/* PNG 导出桥接：在 ReactFlowProvider 内部获取 fitView */}
              <PngExportBridge onReady={(fn) => { exportPngRef.current = fn; setPngReady(!!fn) }} />
              {/* 数据异步加载完成后自动 fitView */}
              <FitViewOnLoad fileKey={currentFile} nodeCount={nodes.length} />
              {/* 加载遮罩：避免显示上一个图的残留内容 */}
              {diagramLoading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-950">
                  <div className="flex flex-col items-center gap-2 text-gray-500">
                    <div className="w-6 h-6 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
                    <span className="text-xs">加载中…</span>
                  </div>
                </div>
              )}
              {/* 思维导图快捷键提示 */}
              {diagramType === 'mindmap' && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 px-4 py-2 bg-gray-900/90 border border-gray-700 rounded-lg text-xs text-gray-400 backdrop-blur-sm">
                  <span><kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-600 text-gray-300">Tab</kbd> 添加子节点</span>
                  <span><kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-600 text-gray-300">Enter</kbd> 添加兄弟节点</span>
                  <span><kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-600 text-gray-300">Delete</kbd> 删除子树</span>
                  <span><kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-600 text-gray-300">双击</kbd> 编辑文字</span>
                </div>
              )}
            </div>
          </ReactFlowProvider>
        )}
      </div>

      {/* Toast 提示 */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-[fadeIn_0.2s_ease-out] ${
            toast.type === 'success'
              ? 'bg-green-800 text-green-100 border border-green-600'
              : 'bg-red-800 text-red-100 border border-red-600'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          {toast.message}
        </div>
      )}
    </div>
  )
}

/** 数据加载后自动 fitView（解决异步加载时 fitView 对空节点执行的问题） */
function FitViewOnLoad({ fileKey, nodeCount }: { fileKey: string | null; nodeCount: number }) {
  const { fitView, getNodes } = useReactFlow()
  const fittedKey = useRef<string | null>(null)

  useEffect(() => {
    // 只在 fileKey 变化且节点已加载时执行
    if (fileKey === fittedKey.current) return
    if (nodeCount === 0) return

    fittedKey.current = fileKey
    // 等 React Flow 渲染完节点再 fitView
    const timer = setTimeout(() => {
      if (getNodes().length > 0) {
        fitView({ padding: 0.1, duration: 300 })
      }
    }, 80)
    return () => clearTimeout(timer)
  }, [fileKey, nodeCount, fitView, getNodes])

  return null
}

/** PNG 导出桥接组件：在 ReactFlowProvider 内部使用 useReactFlow */
function PngExportBridge({ onReady }: { onReady: (fn: (() => Promise<void>) | null) => void }) {
  const { setViewport, getNodes, getNodesBounds, getEdges, fitView } = useReactFlow()
  const currentName = useDiagramStore((s) => s.currentName)

  useEffect(() => {
    onReady(async () => {
      const el = document.querySelector('.react-flow') as HTMLElement
      if (!el) return

      const allNodes = getNodes()
      if (allNodes.length === 0) return

      // 1. 计算节点边界框（flow 坐标）
      const nodeBounds = getNodesBounds(allNodes)

      // 2. 扩展边界：把连线的弯折点也纳入（流程图回环箭头会超出节点范围）
      let minX = nodeBounds.x
      let minY = nodeBounds.y
      let maxX = nodeBounds.x + nodeBounds.width
      let maxY = nodeBounds.y + nodeBounds.height

      const allEdges = getEdges()
      for (const edge of allEdges) {
        const bp = edge.data?.bendPoint as { x: number; y: number } | undefined
        if (bp) {
          minX = Math.min(minX, bp.x)
          minY = Math.min(minY, bp.y)
          maxX = Math.max(maxX, bp.x)
          maxY = Math.max(maxY, bp.y)
        }
      }

      const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }

      // 3. 计算合适的 zoom（限制图片尺寸不超过 2400px）
      const padding = 50
      const maxDim = 2400
      const zoom = Math.min(
        maxDim / (bounds.width + padding * 2),
        maxDim / (bounds.height + padding * 2),
        2 // 最大 2 倍
      )

      // 4. 直接设置 viewport，让节点左上角对齐到 (padding, padding)
      setViewport({
        x: -bounds.x * zoom + padding,
        y: -bounds.y * zoom + padding,
        zoom,
      }, { duration: 0 })

      // 5. 等待一帧渲染
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

      // 6. 直接隐藏背景圆点和控件
      const hideSelectors = [
        '.react-flow__background',
        '.react-flow__controls',
        '.react-flow__minimap',
        '.react-flow__attribution',
        '.react-flow__panel',
      ]
      const hidden: HTMLElement[] = []
      for (const sel of hideSelectors) {
        const e = el.querySelector(sel) as HTMLElement | null
        if (e) {
          hidden.push(e)
          e.style.visibility = 'hidden'
        }
      }

      // 7. 精确截图
      const captureWidth = bounds.width * zoom + padding * 2
      const captureHeight = bounds.height * zoom + padding * 2

      try {
        await exportElementAsPng(el, currentName || '导出', {
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          width: captureWidth,
          height: captureHeight,
        })
      } finally {
        // 8. 恢复
        for (const e of hidden) {
          e.style.visibility = ''
        }
        fitView({ padding: 0.1, duration: 300 })
      }
    })
    return () => onReady(null)
  }, [setViewport, getNodes, getNodesBounds, getEdges, fitView, currentName, onReady])

  return null
}

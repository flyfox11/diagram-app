import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Save,
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
import SettingsDropdown from '@/components/Settings/SettingsDropdown'
import { getDescendantIds } from '@/utils/mindmap-layout'
import { useEffect, useCallback, useState, useRef } from 'react'

interface EditorPageProps {
  onOpenStorageConfig: () => void
}

export default function EditorPage({ onOpenStorageConfig }: EditorPageProps) {
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
    updateNodesSilent,
    updateEdgesSilent,
    setSaving,
    setSaveError,
    markClean,
    setCurrentFile,
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
  // 刷新已有图表时首帧即显示遮罩，避免画布在 {x:0,y:0,zoom:1} 闪现
  const [diagramLoading, setDiagramLoading] = useState(() => !!id && id !== 'new')

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
    getDiagram(settings.token, settings.repoConfig, filename)
      .then((data) => {
        loadDiagram(data)
        setDiagramLoading(false)
      })
      .catch((e) => {
        setSaveError(`加载失败: ${(e as Error).message}`)
        setDiagramLoading(false)
      })
  }, [id, isConfigured, searchParams, setDiagramType])

  const handleSave = useCallback(async (silent = false) => {
    if (!import.meta.env.DEV && !isConfigured) return
    setSaving(true)
    setSaveError(null)

    const fileId = currentFile || `flow-${Date.now()}`
    const filename = `${fileId}.json`

    try {
      await saveDiagram(settings.token, settings.repoConfig, filename, {
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
      if (!silent) {
        showToast('success', '保存成功')
      }
      if (!currentFile) {
        if (silent) {
          // 自动保存：直接设置 currentFile，不触发导航重新加载
          setCurrentFile(fileId)
        } else {
          navigate(`/editor/${fileId}`, { replace: true })
        }
      }
    } catch (e) {
      const errMsg = (e as Error).message
      setSaveError(errMsg)
      if (!silent) {
        showToast('error', `保存失败: ${errMsg}`)
      }
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

  // 自动保存：开启后 isDirty 变化时延迟 2 秒自动保存
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    if (!settings.autoSave || !isDirty) return
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      handleSave(true)
    }, 2000)
    return () => clearTimeout(autoSaveTimer.current)
  }, [isDirty, settings.autoSave, handleSave])

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

  // 稳定化 onReady，避免 PngExportBridge 的 useEffect 每次渲染都执行
  const handlePngReady = useCallback((fn: (() => Promise<void>) | null) => {
    exportPngRef.current = fn
    setPngReady(!!fn)
  }, [])

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
  // dimensions/select 变化用 silent 更新（不标记 isDirty），避免加载后即触发自动保存
  // 思维导图模式：拖动节点时整个子树联动跟随
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      if (changes.some((c) => c.type === 'remove')) {
        pushHistory()
      }

      let allChanges = changes

      // 思维导图模式：子树联动——拖动节点时后代同步平移
      const { diagramType: dt, nodes: curNodes, edges: curEdges } = useDiagramStore.getState()
      if (dt === 'mindmap') {
        const movedIds = new Set(changes.filter((c) => c.type === 'position').map((c) => (c as { id: string }).id))
        const extraChanges: typeof changes = []
        for (const c of changes) {
          if (c.type !== 'position' || !c.position) continue
          const oldNode = curNodes.find((n) => n.id === c.id)
          if (!oldNode) continue
          const dx = c.position.x - oldNode.position.x
          const dy = c.position.y - oldNode.position.y
          if (dx === 0 && dy === 0) continue

          // 获取所有后代，为每个后代注入同步位移
          const descendantIds = getDescendantIds(c.id, curEdges)
          for (const descId of descendantIds) {
            if (descId === c.id) continue
            if (movedIds.has(descId)) continue // 已被直接拖动，跳过
            const descNode = curNodes.find((n) => n.id === descId)
            if (!descNode) continue
            extraChanges.push({
              ...c,
              id: descId,
              position: { x: descNode.position.x + dx, y: descNode.position.y + dy },
            } as typeof c)
          }
        }
        if (extraChanges.length > 0) {
          allChanges = [...changes, ...extraChanges]
        }
      }

      const hasUserEdit = allChanges.some((c) => c.type === 'position' || c.type === 'remove' || c.type === 'add')
      if (hasUserEdit) {
        updateNodes((nds) => applyNodeChanges(allChanges, nds))
      } else {
        updateNodesSilent((nds) => applyNodeChanges(allChanges, nds))
      }
    },
    [updateNodes, updateNodesSilent, pushHistory]
  )

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      if (changes.some((c) => c.type === 'remove')) {
        pushHistory()
      }
      const hasUserEdit = changes.some((c) => c.type === 'remove')
      if (hasUserEdit) {
        updateEdges((eds) => applyEdgeChanges(changes, eds))
      } else {
        updateEdgesSilent((eds) => applyEdgeChanges(changes, eds))
      }
    },
    [updateEdges, updateEdgesSilent, pushHistory]
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
          {/* 保存按钮（手动保存模式时显示） */}
          {!settings.autoSave && (
            <button
              onClick={() => handleSave()}
              disabled={saving || (!import.meta.env.DEV && !isConfigured)}
              className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors text-sm"
            >
              <Save className="w-4 h-4" />
              {saving ? '保存中...' : '保存'}
            </button>
          )}
          {settings.autoSave && isDirty && (
            <span className="text-xs text-amber-400 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
              自动保存中...
            </span>
          )}

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

          <SettingsDropdown onOpenStorageConfig={onOpenStorageConfig} />
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 flex overflow-hidden">
        {diagramType === 'mindmap' && viewMode === 'outline' ? (
          /* 目录模式 */
          <OutlineView />
        ) : (
          <ReactFlowProvider key={id}>
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
              <PngExportBridge onReady={handlePngReady} />
              {/* 数据异步加载完成后自动 fitView */}
              <FitViewOnLoad nodeCount={nodes.length} />
              {/* 加载遮罩：避免显示上一个图的残留内容 */}
              {diagramLoading && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-950">
                  <div className="flex flex-col items-center gap-2 text-gray-500">
                    <div className="w-6 h-6 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
                    <span className="text-xs">加载中…</span>
                  </div>
                </div>
              )}
              {/* PNG 导出遮罩：隐藏导出时的视口变化 */}
              {exportingPng && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-gray-950/90">
                  <div className="flex flex-col items-center gap-2 text-gray-400">
                    <div className="w-6 h-6 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
                    <span className="text-xs">导出中…</span>
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

/** 数据加载后自动 fitView（仅在 ReactFlowProvider 因 key={id} 变化而 remount 时触发一次） */
function FitViewOnLoad({ nodeCount }: { nodeCount: number }) {
  const { fitView, getNodes } = useReactFlow()
  const hasFitted = useRef(false)

  useEffect(() => {
    if (hasFitted.current) return
    if (nodeCount === 0) return
    hasFitted.current = true

    const timer = setTimeout(() => {
      if (getNodes().length > 0) {
        fitView({ padding: 0.1, duration: 300 })
      }
    }, 80)
    return () => clearTimeout(timer)
  }, [nodeCount, fitView, getNodes])

  return null
}

/** PNG 导出桥接组件：在 ReactFlowProvider 内部使用 useReactFlow */
function PngExportBridge({ onReady }: { onReady: (fn: (() => Promise<void>) | null) => void }) {
  const { setViewport, getViewport, getNodes, getNodesBounds, getEdges } = useReactFlow()
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

      // 4. 保存原始 viewport，然后设置导出 viewport
      const originalViewport = getViewport()
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
        // 8. 恢复原始 viewport（不用 fitView，避免画布偏移）
        for (const e of hidden) {
          e.style.visibility = ''
        }
        setViewport(originalViewport, { duration: 0 })
      }
    })
    return () => onReady(null)
  }, [setViewport, getViewport, getNodes, getNodesBounds, getEdges, currentName, onReady])

  return null
}

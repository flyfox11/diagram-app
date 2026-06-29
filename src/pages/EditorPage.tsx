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
} from 'lucide-react'
import {
  ReactFlowProvider,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
} from '@xyflow/react'
import { useDiagramStore } from '@/store/diagram-store'
import { useSettingsStore } from '@/store/settings-store'
import { saveDiagram, getDiagram } from '@/services/api'
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
  } = useDiagramStore()

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  // 加载已有文件（dev 模式不需要 isConfigured）
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

    const filename = `${id}.json`
    getDiagram(settings.githubToken, settings.repoConfig, filename)
      .then((data) => loadDiagram(data))
      .catch((e) => setSaveError(`加载失败: ${(e as Error).message}`))
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

  // React Flow 变更处理 —— 使用内置 applyNodeChanges / applyEdgeChanges
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => updateNodes((nds) => applyNodeChanges(changes, nds)),
    [updateNodes]
  )

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => updateEdges((eds) => applyEdgeChanges(changes, eds)),
    [updateEdges]
  )

  const onConnect: OnConnect = useCallback(
    (connection) => updateEdges((eds) => addEdge(connection, eds)),
    [updateEdges]
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

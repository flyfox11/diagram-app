import { useDiagramStore } from '@/store/diagram-store'
import { buildChildrenMap, findRoots, getVisibleNodeIds, getParentId } from '@/utils/mindmap-layout'
import { ChevronRight, ChevronDown, FileText, Flag, Search, X, Link2 } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import type React from 'react'

/** 高亮匹配文字（仅命中部分） */
function renderHighlighted(
  text: string,
  search: string,
  type: 'bg' | 'color'
): React.ReactNode {
  if (!search || !text) return text
  const lower = text.toLowerCase()
  const parts: React.ReactNode[] = []
  let lastIdx = 0
  let idx = lower.indexOf(search, lastIdx)
  let key = 0

  while (idx !== -1) {
    if (idx > lastIdx) parts.push(text.slice(lastIdx, idx))
    const markStyle =
      type === 'bg'
        ? { backgroundColor: 'rgba(251, 146, 60, 0.6)', borderRadius: '2px', color: 'inherit' }
        : { color: '#fbbf24', background: 'transparent' }
    parts.push(
      <mark key={key++} style={markStyle}>
        {text.slice(idx, idx + search.length)}
      </mark>
    )
    lastIdx = idx + search.length
    idx = lower.indexOf(search, lastIdx)
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx))

  return parts.length > 0 ? parts : text
}

/** 可编辑 + 搜索高亮的文本组件 */
function HighlightableText({
  value,
  onChange,
  search,
  placeholder,
  inputClassName,
  highlightType,
}: {
  value: string
  onChange: (v: string) => void
  search: string
  placeholder?: string
  inputClassName: string
  highlightType: 'bg' | 'color'
}) {
  const [editing, setEditing] = useState(false)
  const pushHistory = useDiagramStore((s) => s.pushHistory)
  
  // 无搜索 或 正在编辑 → 用 input
  if (!search || editing) {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { pushHistory(); setEditing(true) }}
        onBlur={() => setEditing(false)}
        placeholder={placeholder}
        className={inputClassName}
      />
    )
  }

  // 搜索中且未编辑 → 用 span 展示高亮
  return (
    <span
      className={inputClassName}
      onClick={() => { pushHistory(); setEditing(true) }}
      style={{ cursor: 'text', display: 'block', minHeight: '1.25rem' }}
    >
      {value ? renderHighlighted(value, search, highlightType) : <span className="placeholder-gray-700">{placeholder}</span>}
    </span>
  )
}

/** 目录模式视图 */
export default function OutlineView() {
  const nodes = useDiagramStore((s) => s.nodes)
  const edges = useDiagramStore((s) => s.edges)
  const updateNodeData = useDiagramStore((s) => s.updateNodeData)
  const toggleNodeExpanded = useDiagramStore((s) => s.toggleNodeExpanded)

  const [showSearch, setShowSearch] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Ctrl+F 打开搜索，Esc 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' && target !== searchInputRef.current && (e.ctrlKey || e.metaKey) && e.key === 'f') {
        // 在其他 input 中按 Ctrl+F，先让默认行为或跳到搜索
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setShowSearch(true)
        setTimeout(() => searchInputRef.current?.focus(), 0)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const closeSearch = () => {
    setShowSearch(false)
    setSearchTerm('')
  }

  const childrenMap = buildChildrenMap(nodes, edges)
  const roots = findRoots(nodes, edges)

  const search = searchTerm.trim().toLowerCase()

  // 搜索时：仅显示命中节点 + 其祖先链；否则尊重折叠状态
  const visibleIds = (() => {
    if (!search) return getVisibleNodeIds(nodes, edges)
    const result = new Set<string>()
    for (const n of nodes) {
      const label = ((n.data?.label as string) || '').toLowerCase()
      const note = ((n.data?.note as string) || '').toLowerCase()
      if (label.includes(search) || note.includes(search)) {
        result.add(n.id)
        let pid = getParentId(n.id, edges)
        while (pid) {
          result.add(pid)
          pid = getParentId(pid, edges)
        }
      }
    }
    return result
  })()

  const hasMatch = (id: string) => {
    if (!search) return false
    const n = nodes.find((nm) => nm.id === id)
    const label = ((n?.data?.label as string) || '').toLowerCase()
    const note = ((n?.data?.note as string) || '').toLowerCase()
    return label.includes(search) || note.includes(search)
  }

  const renderNode = (nodeId: string, depth: number): React.ReactNode => {
    const node = nodes.find((n) => n.id === nodeId)
    if (!node || !visibleIds.has(nodeId)) return null

    const hasChildren = !!childrenMap[nodeId]?.length
    const expanded = node.data?.expanded !== false
    const flagColor = node.data?.flag as string | undefined
    const note = (node.data?.note as string) || ''
    const link = node.data?.link as { url: string; title?: string } | undefined

    const flagColors: Record<string, string> = { red: 'text-red-500', green: 'text-green-500', blue: 'text-blue-500' }

    return (
      <div key={nodeId}>
        {/* 节点行 */}
        <div
          className="flex items-center gap-2 py-1 px-2 rounded group transition-colors hover:bg-gray-800/30"
          style={{ paddingLeft: depth * 24 + 8 }}
        >
          {/* 展开/折叠 */}
          {hasChildren ? (
            <button
              onClick={() => toggleNodeExpanded(nodeId)}
              className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-200 shrink-0"
            >
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          {/* 绿色图标 */}
          <FileText className="w-3.5 h-3.5 text-green-500 shrink-0" />

          {/* 旗帜标记 */}
          {flagColor && <Flag className={`w-3 h-3 shrink-0 ${flagColors[flagColor] || 'text-red-500'}`} fill="currentColor" />}

          {/* 标题 + 链接 */}
          <div className="flex items-center min-w-0 flex-1">
            <HighlightableText
              value={node.data?.label as string}
              onChange={(v) => updateNodeData(nodeId, { label: v })}
              search={search}
              placeholder="节点标题"
              inputClassName="min-w-0 bg-transparent text-gray-200 text-sm outline-none border-b border-transparent focus:border-blue-500 py-0.5"
              highlightType="bg"
            />

            {/* 链接图标 */}
            {link && (
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 ml-1 text-blue-400 hover:text-blue-300"
                title={link.title || link.url}
              >
                <Link2 className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* 备注行（在节点下方，缩进对齐） */}
        <div
          className="flex items-center gap-2 py-0.5 px-2"
          style={{ paddingLeft: depth * 24 + 40 }}
        >
          <span className="text-xs shrink-0 opacity-60">📝</span>
          <HighlightableText
            value={note}
            onChange={(v) => updateNodeData(nodeId, { note: v || undefined })}
            search={search}
            placeholder="添加备注..."
            inputClassName="flex-1 min-w-0 bg-transparent text-xs outline-none border-b border-transparent focus:border-amber-500 py-0.5 placeholder-gray-700"
            highlightType="color"
          />
        </div>

        {/* 递归渲染子节点 */}
        {hasChildren &&
          (expanded || !!search) &&
          childrenMap[nodeId].map((childId) => renderNode(childId, depth + 1))}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-950">
      {/* 搜索栏（Ctrl+F 触发） */}
      {showSearch && (
        <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800 px-4 py-2">
          <div className="max-w-4xl mx-auto relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              ref={searchInputRef}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  closeSearch()
                }
              }}
              placeholder="搜索节点标题或备注..."
              className="w-full pl-9 pr-9 py-1.5 bg-gray-800 text-gray-200 text-sm rounded-lg outline-none border border-gray-700 focus:border-blue-500"
            />
            <button
              onClick={closeSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="p-4">
        <div className="max-w-4xl mx-auto">
          {/* 搜索提示 */}
          {search && (
            <div className="text-xs text-gray-600 mb-2 px-2">
              {nodes.filter((n) => hasMatch(n.id)).length} 个匹配结果 · 按 <kbd className="px-1 bg-gray-800 rounded border border-gray-700">Esc</kbd> 退出搜索
            </div>
          )}
          {roots.map((rootId) => renderNode(rootId, 0))}
        </div>
      </div>
    </div>
  )
}

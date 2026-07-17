import { memo, useCallback, useState, useRef, useEffect, type DragEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  ReactFlow,
  Background,
  MiniMap,
  Handle,
  Position,
  useReactFlow,
  ConnectionLineType,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  getBezierPath,
  type Node,
  type Edge,
  type EdgeProps,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react'
import { useDiagramStore } from '@/store/diagram-store'
import { getVisibleNodeIds } from '@/utils/mindmap-layout'
import { ExternalLink, Copy, Pencil, Trash2, Link2, Flag as FlagIcon, StickyNote, Image as ImageIcon, X, Palette, AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal } from 'lucide-react'

/** ---- 工具函数 ---- */

/**
 * 将连线端点向节点内部偏移，使路径延伸进节点背景下方，消除 handle 隐藏时的空隙
 */
function offsetIntoNode(x: number, y: number, pos: Position, offset = 3) {
  switch (pos) {
    case Position.Right: return { x: x - offset, y }
    case Position.Left: return { x: x + offset, y }
    case Position.Top: return { x, y: y + offset }
    case Position.Bottom: return { x, y: y - offset }
    default: return { x, y }
  }
}

/**
 * 将一组折线点转为带圆角的 SVG path（拐角用二次贝塞尔 Q 替代 L 硬折角）
 */
function roundedPath(points: Array<{ x: number; y: number }>, radius = 8): string {
  if (points.length < 2) return ''
  if (points.length === 2) return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`

  let d = `M ${points[0].x},${points[0].y}`

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const next = points[i + 1]

    const dist1 = Math.hypot(curr.x - prev.x, curr.y - prev.y)
    const dist2 = Math.hypot(next.x - curr.x, next.y - curr.y)
    const r = Math.min(radius, dist1 / 2, dist2 / 2)

    if (r < 1) {
      d += ` L ${curr.x},${curr.y}`
      continue
    }

    const dx1 = (curr.x - prev.x) / dist1
    const dy1 = (curr.y - prev.y) / dist1
    const dx2 = (next.x - curr.x) / dist2
    const dy2 = (next.y - curr.y) / dist2

    d += ` L ${curr.x - dx1 * r},${curr.y - dy1 * r} Q ${curr.x},${curr.y} ${curr.x + dx2 * r},${curr.y + dy2 * r}`
  }

  const last = points[points.length - 1]
  d += ` L ${last.x},${last.y}`
  return d
}

/**
 * 正交路径穿过弯折点（横平竖直 + 圆角）
 * 参考 draw.io：路径实际经过弯折点，bx 和 by 两个坐标都生效
 */
function getOrthogonalBentPath(
  sx: number, sy: number, sourcePos: Position,
  bx: number, by: number,
  tx: number, ty: number, targetPos: Position
): string {
  const srcV = sourcePos === Position.Top || sourcePos === Position.Bottom
  const tgtV = targetPos === Position.Top || targetPos === Position.Bottom

  let pts: Array<{ x: number; y: number }>

  if (srcV && tgtV) {
    // 都垂直：5 段，路径经过弯折点
    const midY = (by + ty) / 2
    pts = [
      { x: sx, y: sy },
      { x: sx, y: by },
      { x: bx, y: by },
      { x: bx, y: midY },
      { x: tx, y: midY },
      { x: tx, y: ty },
    ]
  } else if (!srcV && !tgtV) {
    // 都水平：5 段，路径经过弯折点
    const midX = (bx + tx) / 2
    pts = [
      { x: sx, y: sy },
      { x: bx, y: sy },
      { x: bx, y: by },
      { x: midX, y: by },
      { x: midX, y: ty },
      { x: tx, y: ty },
    ]
  } else if (srcV && !tgtV) {
    // 源垂直 → 目标水平：4 段，路径经过弯折点
    pts = [
      { x: sx, y: sy },
      { x: sx, y: by },
      { x: bx, y: by },
      { x: bx, y: ty },
      { x: tx, y: ty },
    ]
  } else {
    // 源水平 → 目标垂直：4 段，路径经过弯折点
    pts = [
      { x: sx, y: sy },
      { x: bx, y: sy },
      { x: bx, y: by },
      { x: tx, y: by },
      { x: tx, y: ty },
    ]
  }

  return roundedPath(pts)
}

/** ---- 自定义连线组件（可拖拽弯折点） ---- */

type BendPoint = { x: number; y: number }

function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
  selected,
}: EdgeProps) {
  const updateEdgeData = useDiagramStore((s) => s.updateEdgeData)
  const { screenToFlowPosition } = useReactFlow()
  const [dragging, setDragging] = useState(false)
  const [dragPos, setDragPos] = useState<BendPoint | null>(null)
  const dragPosRef = useRef<BendPoint | null>(null)

  const bend = (data?.bendPoint as BendPoint | undefined) ?? null
  const activeBend = dragPos ?? bend

  // 端点向节点内部偏移，消除 handle 隐藏时的空隙
  const src = offsetIntoNode(sourceX, sourceY, sourcePosition)
  const tgt = offsetIntoNode(targetX, targetY, targetPosition)

  // 计算路径
  let path: string
  let handleX: number
  let handleY: number

  if (activeBend) {
    // 正交路径穿过弯折点（draw.io 风格）
    path = getOrthogonalBentPath(
      src.x, src.y, sourcePosition,
      activeBend.x, activeBend.y,
      tgt.x, tgt.y, targetPosition
    )
    handleX = activeBend.x
    handleY = activeBend.y
  } else {
    // 默认 smoothstep，把手放在路径中点
    const [defaultPath, labelX, labelY] = getSmoothStepPath({
      sourceX: src.x, sourceY: src.y, sourcePosition,
      targetX: tgt.x, targetY: tgt.y, targetPosition,
    })
    path = defaultPath
    handleX = labelX
    handleY = labelY
  }

  // 拖拽逻辑
  const onPointerDown = (e: ReactPointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setDragging(true)
    setDragPos(activeBend ?? { x: handleX, y: handleY })
    dragPosRef.current = activeBend ?? { x: handleX, y: handleY }

    const onMove = (ev: PointerEvent) => {
      const flowPos = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
      dragPosRef.current = flowPos
      setDragPos(flowPos)
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragging(false)
      if (dragPosRef.current) {
        updateEdgeData(id, { bendPoint: dragPosRef.current })
      }
      dragPosRef.current = null
      setDragPos(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // 双击重置弯折点
  const onDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (bend) {
      updateEdgeData(id, { bendPoint: undefined })
    }
  }

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {(selected || dragging) && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${handleX}px, ${handleY}px)`,
              pointerEvents: 'all',
            }}
          >
            <div
              onPointerDown={onPointerDown}
              onDoubleClick={onDoubleClick}
              className={`rounded-full border-2 border-white cursor-move transition-transform ${
                dragging ? 'bg-blue-400 scale-150' : bend ? 'bg-blue-500 scale-110' : 'bg-blue-600/60 hover:bg-blue-500 hover:scale-125'
              } ${bend ? 'w-3 h-3' : 'w-2.5 h-2.5'}`}
              title={bend ? '拖拽移动 · 双击重置' : '拖拽创建弯折点'}
            />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

/** 对外导出的连线类型映射 */
export const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
  mindmap: MindMapEdge,
}

/** ---- 双击编辑标签组件 ---- */

// 字体预设
const FONT_FAMILIES = [
  { label: '默认', value: '' },
  { label: '微软雅黑', value: '"Microsoft YaHei", sans-serif' },
  { label: '宋体', value: '"SimSun", serif' },
  { label: '黑体', value: '"SimHei", sans-serif' },
  { label: '楷体', value: '"KaiTi", serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
]

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20, 24, 28, 32]

const PRESET_COLORS = [
  '#ffffff', '#fde68a', '#fca5a5', '#f9a8d4', '#c4b5fd', '#93c5fd',
  '#6ee7b7', '#fcd34d', '#fb923c', '#f87171', '#a3e635', '#22d3ee',
]

// labelStyle → inline CSS
function labelStyleToCSS(style?: LabelStyle): React.CSSProperties {
  if (!style) return {}
  return {
    fontFamily: style.fontFamily || undefined,
    fontSize: style.fontSize ? `${style.fontSize}px` : undefined,
    fontWeight: style.bold ? 'bold' : undefined,
    fontStyle: style.italic ? 'italic' : undefined,
    color: style.color || undefined,
  }
}

function EditableLabel({
  nodeId,
  value,
  className,
  placeholder,
}: {
  nodeId: string
  value: string
  className?: string
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value)
  const [showToolbar, setShowToolbar] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const colorInputRef = useRef<HTMLInputElement>(null)
  const updateNodeData = useDiagramStore((s) => s.updateNodeData)
  const updateEdgeData = useDiagramStore((s) => s.updateEdgeData)
  const updateNodes = useDiagramStore((s) => s.updateNodes)
  const updateEdges = useDiagramStore((s) => s.updateEdges)
  const pushHistory = useDiagramStore((s) => s.pushHistory)
  const diagramType = useDiagramStore((s) => s.diagramType)
  const relayoutMindMap = useDiagramStore((s) => s.relayoutMindMap)

  // 从 store 读取当前节点的 labelStyle
  const labelStyle = useDiagramStore((s) => {
    const node = s.nodes.find((n) => n.id === nodeId)
    return (node?.data as NodeData)?.labelStyle
  })

  useEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
      setShowToolbar(true)
    }
  }, [editing])

  // 点击外部退出编辑（替代 onBlur，避免工具栏交互触发提交）
  const commitRef = useRef<() => void>(() => {})
  useEffect(() => {
    if (!editing) return
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as unknown as globalThis.Node)) {
        commitRef.current()
      }
    }
    // 用 mousedown + 延迟，让 select 等控件先响应
    window.addEventListener('mousedown', onPointerDown, true)
    return () => window.removeEventListener('mousedown', onPointerDown, true)
  }, [editing])

  const commit = () => {
    const trimmed = text.trim()
    if (trimmed && trimmed !== value) {
      updateNodeData(nodeId, { label: trimmed })
    }
    setEditing(false)
    setShowToolbar(false)
  }
  commitRef.current = commit

  const cancel = () => {
    setText(value)
    setEditing(false)
    setShowToolbar(false)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') cancel()
  }

  // 更新 labelStyle 中某个字段
  const updateStyle = (patch: Partial<LabelStyle>) => {
    const current = labelStyle || {}
    const isFontSizeChange = patch.fontSize !== undefined

    if (isFontSizeChange) {
      pushHistory()
    }

    updateNodeData(nodeId, { labelStyle: { ...current, ...patch } })

    // 字号变更后：流程图模式级联推开，思维导图模式重新布局
    if (isFontSizeChange) {
      if (diagramType === 'flowchart') {
      setTimeout(() => {
        const nodes = useDiagramStore.getState().nodes
        const edges = useDiagramStore.getState().edges

        // 找到变大的节点
        const grown = nodes.find((n) => n.id === nodeId)
        if (!grown) return
        const gw = grown.measured?.width ?? 0
        const gh = grown.measured?.height ?? 0
        if (gw === 0 || gh === 0) return

        // 级联推开：BFS
        const positionUpdates: Record<string, number> = {}
        const minGap = 40

        const queue: { id: string; bottom: number; left: number; right: number }[] = [{
          id: nodeId,
          bottom: grown.position.y + gh,
          left: grown.position.x,
          right: grown.position.x + gw,
        }]

        while (queue.length > 0) {
          const current = queue.shift()!

          for (const other of nodes) {
            if (other.id === current.id) continue

            const ow = other.measured?.width ?? 0
            const oh = other.measured?.height ?? 0
            const oy = positionUpdates[other.id] ?? other.position.y
            const ox = other.position.x

            // 水平方向重叠
            const hOverlap = ox < current.right && (ox + ow) > current.left
            if (!hOverlap) continue

            // 在下方且间距不足
            const isBelow = oy >= current.bottom - oh
            const gap = oy - current.bottom
            if (!isBelow || gap >= minGap) continue

            // 推开
            const newY = current.bottom + minGap
            if (positionUpdates[other.id] !== undefined) {
              positionUpdates[other.id] = newY
            } else {
              positionUpdates[other.id] = newY
            }
            queue.push({ id: other.id, bottom: newY + oh, left: ox, right: ox + ow })
          }
        }

        // 应用位置变更
        if (Object.keys(positionUpdates).length > 0) {
          updateNodes((nds) =>
            nds.map((n) => {
              const newY = positionUpdates[n.id]
              return newY !== undefined ? { ...n, position: { x: n.position.x, y: newY } } : n
            })
          )
        }

        // 清除关联边的 bendPoint
        const allMovedIds = new Set([nodeId, ...Object.keys(positionUpdates)])
        updateEdges((eds) =>
          eds.map((e) => {
            if (allMovedIds.has(e.source) || allMovedIds.has(e.target)) {
              const data = e.data as { bendPoint?: unknown } | undefined
              if (data?.bendPoint) {
                return { ...e, data: { ...e.data, bendPoint: undefined } }
              }
            }
            return e
          })
        )
      }, 50)
      } else {
        // 思维导图模式：等待 React Flow 重新测量后重新布局
        setTimeout(() => {
          relayoutMindMap()
        }, 50)
      }
    }
  }

  if (editing) {
    return (
      <div ref={containerRef} className="relative inline-flex flex-col items-center">
        {/* mini 工具栏 */}
        {showToolbar && (
          <div
            className="nodrag nopan absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-gray-800 border border-gray-600 rounded-lg px-1.5 py-1 shadow-xl whitespace-nowrap"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* 字体 */}
            <select
              value={labelStyle?.fontFamily ?? ''}
              onChange={(e) => updateStyle({ fontFamily: e.target.value || undefined })}
              className="bg-gray-700 text-gray-200 text-xs rounded px-1 py-0.5 border border-gray-600 outline-none cursor-pointer"
              title="字体"
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            {/* 字号 */}
            <select
              value={labelStyle?.fontSize ?? 14}
              onChange={(e) => updateStyle({ fontSize: Number(e.target.value) })}
              className="bg-gray-700 text-gray-200 text-xs rounded px-1 py-0.5 border border-gray-600 outline-none cursor-pointer"
              title="字号"
            >
              {FONT_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {/* 加粗 */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => updateStyle({ bold: !labelStyle?.bold })}
              className={`w-6 h-6 flex items-center justify-center rounded text-xs font-bold border border-gray-600 transition-colors ${labelStyle?.bold ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              title="加粗"
            >
              B
            </button>
            {/* 倾斜 */}
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => updateStyle({ italic: !labelStyle?.italic })}
              className={`w-6 h-6 flex items-center justify-center rounded text-xs italic border border-gray-600 transition-colors ${labelStyle?.italic ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              title="倾斜"
            >
              I
            </button>
            {/* 颜色 — 点击直接唤起系统原生选色器 */}
            <div className="relative">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => colorInputRef.current?.click()}
                className="w-6 h-6 flex items-center justify-center rounded-md border border-gray-500 bg-gray-700 hover:ring-2 hover:ring-blue-400 transition-all"
                title="文字颜色"
              >
                <span
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: labelStyle?.color ?? '#ffffff' }}
                />
              </button>
              <input
                ref={colorInputRef}
                type="color"
                value={labelStyle?.color ?? '#ffffff'}
                onChange={(e) => updateStyle({ color: e.target.value })}
                className="sr-only"
              />
            </div>
          </div>
        )}
        {/* 输入框 */}
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          className={`bg-gray-700 border border-blue-500 rounded px-1 py-0.5 text-center outline-none ${className || ''}`}
          style={{
            width: Math.max(text.length * 10 + 20, 60),
            ...labelStyleToCSS(labelStyle),
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    )
  }

  return (
    <span
      className={`cursor-text ${className || ''}`}
      style={labelStyleToCSS(labelStyle)}
      onDoubleClick={() => { pushHistory(); setEditing(true) }}
      title="双击编辑"
    >
      {value || placeholder || '节点'}
    </span>
  )
}

/** ---- 节点辅助组件：红旗 + 备注图标 ---- */

export type LabelStyle = {
  fontFamily?: string
  fontSize?: number
  bold?: boolean
  italic?: boolean
  color?: string
}

type NodeData = { label: string; flag?: 'red' | 'green' | 'blue'; note?: string; level?: number; expanded?: boolean; link?: { url: string; title?: string }; image?: string; labelStyle?: LabelStyle }

const flagColors: Record<string, string> = { red: 'text-red-500', green: 'text-green-500', blue: 'text-blue-500' }

function NodeFlag({ data }: { data: NodeData }) {
  const flag = data?.flag as string | undefined
  if (!flag) return null
  return <FlagIcon className={`w-3.5 h-3.5 shrink-0 ${flagColors[flag] || 'text-red-500'}`} fill="currentColor" />
}

function NodeLinkIcon({ id, data }: { id: string; data: NodeData }) {
  const updateNodeData = useDiagramStore((s) => s.updateNodeData)
  const pushHistory = useDiagramStore((s) => s.pushHistory)
  const setLinkEditing = useDiagramStore((s) => s.setLinkEditingNodeId)
  const link = data?.link as { url: string; title?: string } | undefined
  const [showTooltip, setShowTooltip] = useState(false)
  const [copied, setCopied] = useState(false)
  const iconRef = useRef<HTMLSpanElement>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null)

  if (!link) return null

  const handleMouseEnter = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect()
      setTooltipPos({ top: rect.bottom + 4, left: rect.left })
    }
    setShowTooltip(true)
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(link.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    pushHistory()
    updateNodeData(id, { link: undefined })
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setLinkEditing(id)
  }

  return (
    <span
      ref={iconRef}
      className="relative cursor-pointer text-blue-400 hover:text-blue-300"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={(e) => { e.stopPropagation(); setShowTooltip(false) }}
      onClick={(e) => e.stopPropagation()}
    >
      <Link2 className="w-3.5 h-3.5" />
      {showTooltip && tooltipPos && createPortal(
        <div
          className="fixed z-[9999] bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-2 min-w-[200px]"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
          onClick={(e) => e.stopPropagation()}
          onMouseLeave={(e) => { e.stopPropagation(); setShowTooltip(false) }}
        >
          <div className="text-xs text-gray-300 mb-1.5 truncate max-w-[180px]">
            {link.title || link.url}
          </div>
          <div className="flex items-center gap-1">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-gray-700 rounded transition-colors"
              title="打开链接"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={handleCopy}
              className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded transition-colors"
              title={copied ? '已复制!' : '复制链接'}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleEdit}
              className="p-1.5 text-gray-400 hover:text-amber-400 hover:bg-gray-700 rounded transition-colors"
              title="编辑链接"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDelete}
              className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
              title="删除链接"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          {copied && <div className="text-xs text-green-400 mt-1">已复制到剪贴板</div>}
        </div>,
        document.body
      )}
    </span>
  )
}

function NodeNoteIcon({ id, data }: { id: string; data: NodeData }) {
  const setNoteEditingNodeId = useDiagramStore((s) => s.setNoteEditingNodeId)
  const note = data?.note as string | undefined
  if (!note) return null
  return (
    <span
      className="cursor-pointer text-amber-400 hover:text-amber-300"
      title={note.length > 100 ? note.slice(0, 100) + '...' : note}
      onClick={(e) => {
        e.stopPropagation()
        setNoteEditingNodeId(id)
      }}
    >
      <StickyNote className="w-3.5 h-3.5" />
    </span>
  )
}

/** ---- 自定义节点组件 ---- */

function DefaultNode({ id, data }: { id: string; data: NodeData }) {
  return (
    <div className="custom-node flex items-center justify-center gap-1 px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-gray-100 text-sm min-w-[120px] text-center cursor-pointer hover:border-blue-500 transition-colors">
      <Handle type="target" position={Position.Top} className="!bg-gray-500 !w-2.5 !h-2.5" />
      <Handle type="target" position={Position.Left} className="!bg-gray-500 !w-2.5 !h-2.5" />
      <NodeFlag data={data} />
      <EditableLabel nodeId={id} value={data.label} placeholder="处理过程" />
      <NodeNoteIcon id={id} data={data} />
      <NodeLinkIcon id={id} data={data} />
      <Handle type="source" position={Position.Right} className="!bg-gray-500 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Bottom} className="!bg-gray-500 !w-2.5 !h-2.5" />
    </div>
  )
}

function StartNode({ id, data }: { id: string; data: NodeData }) {
  return (
    <div className="custom-node flex items-center justify-center gap-1 px-6 py-2 bg-green-900 border border-green-600 rounded-full text-green-100 text-sm min-w-[100px] text-center cursor-pointer hover:border-green-400 transition-colors">
      <NodeFlag data={data} />
      <EditableLabel nodeId={id} value={data.label} placeholder="开始" />
      <NodeNoteIcon id={id} data={data} />
      <NodeLinkIcon id={id} data={data} />
      <Handle type="source" position={Position.Bottom} className="!bg-green-500 !w-2.5 !h-2.5" />
    </div>
  )
}

function EndNode({ id, data }: { id: string; data: NodeData }) {
  return (
    <div className="custom-node flex items-center justify-center gap-1 px-6 py-2 bg-red-900 border border-red-600 rounded-full text-red-100 text-sm min-w-[100px] text-center cursor-pointer hover:border-red-400 transition-colors">
      <Handle type="target" position={Position.Top} className="!bg-red-500 !w-2.5 !h-2.5" />
      <NodeFlag data={data} />
      <EditableLabel nodeId={id} value={data.label} placeholder="结束" />
      <NodeNoteIcon id={id} data={data} />
      <NodeLinkIcon id={id} data={data} />
    </div>
  )
}

// 菱形 SVG 转 data URI 背景（避免 clip-path 裁文字 / inline SVG 在 html-to-image 中异常）
const diamondBg =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='70'%3E%3Cpolygon points='50,1 99,35 50,69 1,35' fill='%23fbbf24' fill-opacity='0.15' stroke='%23ca8a04' stroke-width='2'/%3E%3C/svg%3E\")"

function DiamondNode({ id, data }: { id: string; data: NodeData }) {
  return (
    <div
      className="custom-node relative flex items-center justify-center cursor-pointer transition-colors"
      style={{
        width: 100,
        height: 70,
        backgroundImage: diamondBg,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-yellow-500 !w-2.5 !h-2.5" />
      <span className="relative z-10 flex items-center gap-1">
        <NodeFlag data={data} />
        <EditableLabel nodeId={id} value={data.label} className="text-xs text-yellow-100 font-medium" placeholder="判断" />
        <NodeNoteIcon id={id} data={data} />
        <NodeLinkIcon id={id} data={data} />
      </span>
      <Handle type="source" position={Position.Bottom} className="!bg-yellow-500 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Left} className="!bg-yellow-500 !w-2.5 !h-2.5" id="left" />
      <Handle type="source" position={Position.Right} className="!bg-yellow-500 !w-2.5 !h-2.5" id="right" />
    </div>
  )
}

/* ---- 思维导图节点 ---- */

function MindMapNode({ id, data }: { id: string; data: NodeData }) {
  const edges = useDiagramStore((s) => s.edges)
  const toggleNodeExpanded = useDiagramStore((s) => s.toggleNodeExpanded)
  const updateNodeData = useDiagramStore((s) => s.updateNodeData)
  const pushHistory = useDiagramStore((s) => s.pushHistory)
  const selected = useDiagramStore((s) => s.nodes.find((n) => n.id === id)?.selected) ?? false
  const hasChildren = edges.some((e) => e.source === id)
  const expanded = data.expanded !== false
  const level = (data.level as number) ?? 0
  const image = data.image as string | undefined

  const colors = [
    'bg-green-800 border-green-500 text-green-100',
    'bg-blue-800 border-blue-500 text-blue-100',
    'bg-purple-800 border-purple-500 text-purple-100',
    'bg-gray-700 border-gray-500 text-gray-100',
  ]
  const colorClass = colors[level] || colors[3]

  const handleRemoveImage = (e: React.MouseEvent) => {
    e.stopPropagation()
    pushHistory()
    updateNodeData(id, { image: undefined })
  }

  // 有图片时的布局：图片在上，文字旗帜下左，链接备注下右
  if (image) {
    return (
      <div className={`custom-node relative ${colorClass} border rounded-lg text-sm cursor-pointer hover:brightness-125 transition-all overflow-visible`}>
        <Handle type="target" position={Position.Left} className="!w-0 !h-0 !border-0 !opacity-0" />

        {/* 选中时右上角删除图片按钮 */}
        {selected && (
          <button
            onClick={handleRemoveImage}
            className="absolute -top-2 -right-2 z-20 w-5 h-5 bg-red-600 hover:bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg"
            title="删除图片"
          >
            <X className="w-3 h-3" />
          </button>
        )}

        {/* 图片 */}
        <img
          src={image}
          alt=""
          className="w-full max-w-[200px] max-h-[140px] object-cover rounded-t-lg"
          draggable={false}
        />

        {/* 底部行：左=旗帜+文字，右=链接+备注 */}
        <div className="flex items-center justify-between gap-1 px-2 py-1">
          <div className="flex items-center gap-1 min-w-0">
            <NodeFlag data={data} />
            <span className="font-medium whitespace-nowrap">
              <EditableLabel nodeId={id} value={data.label} placeholder="分支" />
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <NodeLinkIcon id={id} data={data} />
            <NodeNoteIcon id={id} data={data} />
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleNodeExpanded(id)
                }}
                className="flex items-center justify-center w-5 h-5 rounded-full bg-black/30 hover:bg-black/50 text-xs font-bold transition-colors"
                title={expanded ? '收起' : '展开'}
              >
                {expanded ? '−' : '+'}
              </button>
            )}
          </div>
        </div>

        <Handle type="source" position={Position.Right} className="!w-0 !h-0 !border-0 !opacity-0" />
      </div>
    )
  }

  // 无图片时保持原有布局
  return (
    <div className={`custom-node flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 ${colorClass} border rounded-lg text-sm min-w-[80px] cursor-pointer hover:brightness-125 transition-all`}>
      <Handle type="target" position={Position.Left} className="!w-0 !h-0 !border-0 !opacity-0" />
      <NodeFlag data={data} />
      <span className="font-medium whitespace-nowrap">
        <EditableLabel nodeId={id} value={data.label} placeholder="分支" />
      </span>
      <NodeNoteIcon id={id} data={data} />
      <NodeLinkIcon id={id} data={data} />
      {hasChildren && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleNodeExpanded(id)
          }}
          className="flex items-center justify-center w-5 h-5 rounded-full bg-black/30 hover:bg-black/50 text-xs font-bold transition-colors"
          title={expanded ? '收起' : '展开'}
        >
          {expanded ? '−' : '+'}
        </button>
      )}
      <Handle type="source" position={Position.Right} className="!w-0 !h-0 !border-0 !opacity-0" />
    </div>
  )
}

/* ---- 思维导图连线 ---- */

function MindMapEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
}: EdgeProps) {
  const src = offsetIntoNode(sourceX, sourceY, sourcePosition)
  const tgt = offsetIntoNode(targetX, targetY, targetPosition)
  const [path] = getBezierPath({
    sourceX: src.x, sourceY: src.y, sourcePosition,
    targetX: tgt.x, targetY: tgt.y, targetPosition,
  })

  return (
    <BaseEdge
      path={path}
      style={{ stroke: '#6b7280', strokeWidth: 2, ...style }}
    />
  )
}

/** 对外导出的节点类型映射 */
export const nodeTypes: NodeTypes = {
  default: DefaultNode,
  start: StartNode,
  end: EndNode,
  diamond: DiamondNode,
  mindmap: MindMapNode,
}

/** ---- 链接编辑弹窗 ---- */

function LinkDialog({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const nodes = useDiagramStore((s) => s.nodes)
  const updateNodeData = useDiagramStore((s) => s.updateNodeData)
  const pushHistory = useDiagramStore((s) => s.pushHistory)
  const node = nodes.find((n) => n.id === nodeId)
  const existingLink = node?.data?.link as { url: string; title?: string } | undefined
  const [url, setUrl] = useState(existingLink?.url || '')
  const [title, setTitle] = useState(existingLink?.title || '')

  const handleSave = () => {
    if (!url.trim()) return
    pushHistory()
    updateNodeData(nodeId, { link: { url: url.trim(), title: title.trim() || undefined } })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-80 bg-gray-800 border border-gray-600 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-gray-100 font-semibold text-base mb-4 flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-400" />
            {existingLink ? '编辑链接' : '添加链接'}
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">链接地址</label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
                placeholder="https://..."
                className="w-full px-3 py-2 bg-gray-900 text-gray-200 text-sm rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                  if (e.key === 'Escape') onClose()
                }}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">标题（非必填）</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="输入文本..."
                className="w-full px-3 py-2 bg-gray-900 text-gray-200 text-sm rounded-lg border border-gray-700 focus:border-blue-500 outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                  if (e.key === 'Escape') onClose()
                }}
              />
            </div>
          </div>
        </div>
        <div className="flex gap-0 border-t border-gray-700">
          <button
            onClick={onClose}
            className="flex-1 py-3 text-gray-300 hover:bg-gray-700/50 transition-colors text-sm font-medium"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!url.trim()}
            className="flex-1 py-3 text-blue-400 hover:bg-blue-900/40 transition-colors text-sm font-medium border-l border-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

/** ---- 备注抽屉组件 ---- */

function NoteDrawer({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const nodes = useDiagramStore((s) => s.nodes)
  const updateNodeData = useDiagramStore((s) => s.updateNodeData)
  const pushHistory = useDiagramStore((s) => s.pushHistory)
  const node = nodes.find((n) => n.id === nodeId)
  const existingNote = (node?.data?.note as string) || ''
  const [text, setText] = useState(existingNote)

  const handleSave = () => {
    pushHistory()
    updateNodeData(nodeId, { note: text.trim() || undefined })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={handleSave}>
      <div
        className="w-96 h-full bg-gray-900 border-l border-gray-700 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="text-gray-200 font-medium text-sm flex items-center gap-2">
            📝 备注
          </h3>
          <button
            onClick={handleSave}
            className="text-gray-400 hover:text-gray-200 text-lg leading-none"
          >
            ✕
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          className="flex-1 p-4 bg-gray-800 text-gray-200 text-sm resize-none outline-none border-none"
          placeholder="输入备注内容..."
        />
        <div className="px-4 py-3 border-t border-gray-700 flex justify-end">
          <button
            onClick={handleSave}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

/** ---- Canvas Props ---- */

export interface CanvasProps {
  nodes: Node[]
  edges: Edge[]
  defaultViewport: { x: number; y: number; zoom: number }
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
}

/** ---- Canvas 组件 ---- */

export default memo(function Canvas({
  nodes,
  edges,
  defaultViewport,
  onNodesChange,
  onEdgesChange,
  onConnect,
}: CanvasProps) {
  const { screenToFlowPosition, setNodes, setViewport: rfSetViewport, getViewport: rfGetViewport, fitView } = useReactFlow()
  // 视口安全网：vpRef 始终跟踪最新视口，每次渲染后检测并纠正偏移
  const setStoreViewport = useDiagramStore((s) => s.setViewport)
  const isFitting = useDiagramStore((s) => s.isFitting)
  const setIsFitting = useDiagramStore((s) => s.setIsFitting)
  const vpRef = useRef(defaultViewport)
  useEffect(() => { vpRef.current = defaultViewport }, [defaultViewport])
  // 每次渲染后检查：如果 ReactFlow 内部视口与 vpRef 不一致（被重渲染重置），立即恢复
  // fitView 期间跳过，避免与动画竞态
  useEffect(() => {
    if (isFitting) return
    const cur = rfGetViewport()
    const tgt = vpRef.current
    if (cur.x !== tgt.x || cur.y !== tgt.y || cur.zoom !== tgt.zoom) {
      rfSetViewport(tgt, { duration: 0 })
    }
  })
  const diagramType = useDiagramStore((s) => s.diagramType)
  const addChildNode = useDiagramStore((s) => s.addChildNode)
  const addSiblingNode = useDiagramStore((s) => s.addSiblingNode)
  const deleteNodeSubtree = useDiagramStore((s) => s.deleteNodeSubtree)
  const storeNodes = useDiagramStore((s) => s.nodes)
  const storeEdges = useDiagramStore((s) => s.edges)
  const updateNodeData = useDiagramStore((s) => s.updateNodeData)
  const updateEdgeData = useDiagramStore((s) => s.updateEdgeData)
  const noteEditingNodeId = useDiagramStore((s) => s.noteEditingNodeId)
  const setNoteEditingNodeId = useDiagramStore((s) => s.setNoteEditingNodeId)
  const pushHistory = useDiagramStore((s) => s.pushHistory)
  const linkEditingNodeId = useDiagramStore((s) => s.linkEditingNodeId)
  const setLinkEditingNodeId = useDiagramStore((s) => s.setLinkEditingNodeId)

  // 思维导图节点增删后重新居中：等 relayoutMindMap（2帧）+ 渲染完成（1帧）
  const refitAfterLayout = useCallback(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
      setIsFitting(true)
      fitView({ padding: 0.1, duration: 0 })
      requestAnimationFrame(() => setIsFitting(false))
    })))
  }, [fitView, setIsFitting])

  const isMindMap = diagramType === 'mindmap'

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number; flag: string | undefined; hasNote: boolean; hasLink: boolean; hasImage: boolean } | null>(null)
  const [showFlagSubmenu, setShowFlagSubmenu] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imageNodeIdRef = useRef<string | null>(null)

  const onNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault()
    setContextMenu({
      nodeId: node.id,
      x: event.clientX,
      y: event.clientY,
      flag: node.data?.flag as string | undefined,
      hasNote: !!node.data?.note,
      hasLink: !!node.data?.link,
      hasImage: !!node.data?.image,
    })
    setShowFlagSubmenu(false)
  }, [])

  // 点击外部关闭右键菜单
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  // 图片上传处理
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const nodeId = imageNodeIdRef.current
    if (!file || !nodeId) return

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      // 通过 canvas 压缩图片
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const maxW = 400
        const maxH = 300
        let { width, height } = img
        if (width > maxW) { height = height * (maxW / width); width = maxW }
        if (height > maxH) { width = width * (maxH / height); height = maxH }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, width, height)
        const compressed = canvas.toDataURL('image/jpeg', 0.8)
        pushHistory()
        updateNodeData(nodeId, { image: compressed })
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // 思维导图模式：过滤可见节点/连线
  const visibleNodes = isMindMap
    ? (() => {
        const visibleIds = getVisibleNodeIds(storeNodes, storeEdges)
        return nodes.filter((n) => visibleIds.has(n.id))
      })()
    : nodes

  const visibleEdges = isMindMap
    ? (() => {
        const visibleIds = getVisibleNodeIds(storeNodes, storeEdges)
        return edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
      })()
    : edges

  // 键盘快捷键（仅思维导图模式）
  useEffect(() => {
    if (!isMindMap) return
    const handler = (e: globalThis.KeyboardEvent) => {
      // 输入框中不触发
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      const selectedNode = storeNodes.find((n) => n.selected)
      if (!selectedNode) return

      if (e.key === 'Tab') {
        e.preventDefault()
        const newId = addChildNode(selectedNode.id)
        if (newId) {
 // 选中新节点
          setTimeout(() => {
            setNodes((nds) =>
              nds.map((n) => ({ ...n, selected: n.id === newId }))
            )
          }, 0)
          // relayoutMindMap 在 2 帧后执行，等 3 帧后重新居中
          refitAfterLayout()
        }
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const newId = addSiblingNode(selectedNode.id)
        if (newId) {
          setTimeout(() => {
            setNodes((nds) =>
              nds.map((n) => ({ ...n, selected: n.id === newId }))
            )
          }, 0)
          refitAfterLayout()
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        deleteNodeSubtree(selectedNode.id)
        refitAfterLayout()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isMindMap, storeNodes, addChildNode, addSiblingNode, deleteNodeSubtree, setNodes, refitAfterLayout])

  /** 从侧边栏拖放节点到画布（仅流程图模式） */
  const onDragOver = useCallback((event: DragEvent) => {
    if (isMindMap) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [isMindMap])

  const onDrop = useCallback(
    (event: DragEvent) => {
      if (isMindMap) return
      event.preventDefault()
      const raw = event.dataTransfer.getData('application/reactflow')
      if (!raw) return

      const { type, label } = JSON.parse(raw) as { type: string; label: string }
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const newNode: Node = {
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type,
        position,
        data: { label },
      }

      // 通过 onNodesChange 的 'add' change 来添加节点
      onNodesChange([{ type: 'add', item: newNode }])
    },
    [screenToFlowPosition, onNodesChange, isMindMap]
  )

  // 节点对齐
  const selectedNodes = visibleNodes.filter((n) => n.selected)
  const canAlign = selectedNodes.length >= 2

  const alignNodes = useCallback((dir: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom') => {
    if (selectedNodes.length < 2) return
    pushHistory()

    // 带宽高的节点信息
    const bounds = selectedNodes.map((n) => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      w: n.measured?.width ?? n.width ?? 0,
      h: n.measured?.height ?? n.height ?? 0,
    }))

    const leftEdges = bounds.map((b) => b.x)
    const rightEdges = bounds.map((b) => b.x + b.w)
    const topEdges = bounds.map((b) => b.y)
    const bottomEdges = bounds.map((b) => b.y + b.h)

    const minLeft = Math.min(...leftEdges)
    const maxRight = Math.max(...rightEdges)
    const minTop = Math.min(...topEdges)
    const maxBottom = Math.max(...bottomEdges)

    const centerH = (minLeft + maxRight) / 2
    const centerV = (minTop + maxBottom) / 2

    const changes = bounds.map((b) => {
      let { x, y } = b
      if (dir === 'left') x = minLeft
      else if (dir === 'right') x = maxRight - b.w
      else if (dir === 'centerH') x = centerH - b.w / 2
      else if (dir === 'top') y = minTop
      else if (dir === 'bottom') y = maxBottom - b.h
      else if (dir === 'centerV') y = centerV - b.h / 2
      return { id: b.id, type: 'position' as const, position: { x, y } }
    })
    onNodesChange(changes)

    // 清除与选中节点相关的连线弯折点（节点移动后旧 bendPoint 会错位）
    const selectedIds = new Set(bounds.map((b) => b.id))
    storeEdges.forEach((e) => {
      if (selectedIds.has(e.source) || selectedIds.has(e.target)) {
        const data = e.data as { bendPoint?: unknown } | undefined
        if (data?.bendPoint) {
          updateEdgeData(e.id, { bendPoint: undefined })
        }
      }
    })
  }, [selectedNodes, pushHistory, onNodesChange, storeEdges, updateEdgeData])

  return (
    <>
    <ReactFlow
      nodes={visibleNodes}
      edges={visibleEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeContextMenu={isMindMap ? onNodeContextMenu : undefined}
      onDragOver={onDragOver}
      onDrop={onDrop}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      defaultViewport={defaultViewport}
      onViewportChange={(vp) => { vpRef.current = vp; setStoreViewport(vp) }}
      className="bg-gray-950"
      connectionLineStyle={isMindMap ? { display: 'none' } : { stroke: '#6b7280', strokeWidth: 2 }}
      connectionLineType={ConnectionLineType.SmoothStep}
      defaultEdgeOptions={isMindMap
        ? { type: 'mindmap', style: { stroke: '#6b7280', strokeWidth: 2 } }
        : { type: 'custom', style: { stroke: '#94a3b8', strokeWidth: 1.5 }, markerEnd: { type: 'arrowclosed', color: '#94a3b8', width: 16, height: 16 } }
      }
      nodesDraggable={true}
      nodesConnectable={!isMindMap}
      elementsSelectable={true}
      deleteKeyCode={isMindMap ? null : 'Backspace'}
      selectionKeyCode="Shift"
      multiSelectionKeyCode={['Meta', 'Control']}
    >
      <Background color="#333" gap={20} />
      <MiniMap
        nodeColor="#374151"
        maskColor="rgba(0,0,0,0.7)"
        className="!bg-gray-900 !border-gray-700"
      />
    </ReactFlow>

    {/* 节点对齐工具栏（仅流程图模式，选中 ≥2 节点时浮现） */}
    {canAlign && !isMindMap && (
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-gray-800 border border-gray-600 rounded-lg px-1.5 py-1 shadow-xl">
        <span className="text-xs text-gray-500 px-1">对齐</span>
        <button onClick={() => alignNodes('left')} title="左对齐" className="p-1.5 hover:bg-gray-700 rounded text-gray-300 transition-colors">
          <AlignStartVertical className="w-4 h-4" />
        </button>
        <button onClick={() => alignNodes('centerH')} title="水平居中" className="p-1.5 hover:bg-gray-700 rounded text-gray-300 transition-colors">
          <AlignCenterVertical className="w-4 h-4" />
        </button>
        <button onClick={() => alignNodes('right')} title="右对齐" className="p-1.5 hover:bg-gray-700 rounded text-gray-300 transition-colors">
          <AlignEndVertical className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-gray-600 mx-0.5" />
        <button onClick={() => alignNodes('top')} title="顶对齐" className="p-1.5 hover:bg-gray-700 rounded text-gray-300 transition-colors">
          <AlignStartHorizontal className="w-4 h-4" />
        </button>
        <button onClick={() => alignNodes('centerV')} title="垂直居中" className="p-1.5 hover:bg-gray-700 rounded text-gray-300 transition-colors">
          <AlignCenterHorizontal className="w-4 h-4" />
        </button>
        <button onClick={() => alignNodes('bottom')} title="底对齐" className="p-1.5 hover:bg-gray-700 rounded text-gray-300 transition-colors">
          <AlignEndHorizontal className="w-4 h-4" />
        </button>
      </div>
    )}

    {/* 右键菜单 */}
    {contextMenu && (
      <div
        className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[130px]"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 新增旗帜（子菜单） */}
        <div
          className="relative"
          onMouseEnter={() => setShowFlagSubmenu(true)}
          onMouseLeave={() => setShowFlagSubmenu(false)}
        >
          <button
            className="w-full px-3 py-1.5 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2">
              <FlagIcon className={`w-3.5 h-3.5 ${contextMenu.flag ? flagColors[contextMenu.flag] : 'text-gray-400'}`} fill={contextMenu.flag ? 'currentColor' : 'none'} />
              {contextMenu.flag ? '更换旗帜' : '新增旗帜'}
            </span>
            <span className="text-gray-500 text-xs">▶</span>
          </button>
          {showFlagSubmenu && (
            <div className="absolute left-full top-0 ml-0.5 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[120px]">
              {(['red', 'green', 'blue'] as const).map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    pushHistory()
                    updateNodeData(contextMenu.nodeId, { flag: color })
                    setContextMenu(null)
                  }}
                  className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-700 flex items-center gap-2 ${contextMenu.flag === color ? 'text-gray-100 font-medium' : 'text-gray-300'}`}
                >
                  <FlagIcon className={`w-3.5 h-3.5 ${flagColors[color]}`} fill="currentColor" />
                  {color === 'red' ? '小红旗' : color === 'green' ? '小绿旗' : '小蓝旗'}
                  {contextMenu.flag === color && <span className="ml-auto text-green-400">✓</span>}
                </button>
              ))}
              {contextMenu.flag && (
                <>
                  <div className="border-t border-gray-700 my-0.5" />
                  <button
                    onClick={() => {
                      pushHistory()
                      updateNodeData(contextMenu.nodeId, { flag: undefined })
                      setContextMenu(null)
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2"
                  >
                    🚫 取消旗帜
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-700 my-0.5" />

        {/* 添加/编辑链接 */}
        <button
          onClick={() => {
            setLinkEditingNodeId(contextMenu.nodeId)
            setContextMenu(null)
          }}
          className="w-full px-3 py-1.5 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
        >
          🔗 {contextMenu.hasLink ? '编辑链接' : '添加链接'}
        </button>

        {/* 备注 */}
        <button
          onClick={() => {
            setNoteEditingNodeId(contextMenu.nodeId)
            setContextMenu(null)
          }}
          className="w-full px-3 py-1.5 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
        >
          <StickyNote className="w-3.5 h-3.5" />
          {contextMenu.hasNote ? '编辑备注' : '插入备注'}
        </button>

        <div className="border-t border-gray-700 my-0.5" />

        {/* 添加/更换图片 */}
        <button
          onClick={() => {
            imageNodeIdRef.current = contextMenu.nodeId
            setContextMenu(null)
            setTimeout(() => imageInputRef.current?.click(), 0)
          }}
          className="w-full px-3 py-1.5 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          {contextMenu.hasImage ? '更换图片' : '添加图片'}
        </button>
      </div>
    )}

    {/* 图片上传 */}
    <input
      ref={imageInputRef}
      type="file"
      accept="image/*"
      onChange={handleImageUpload}
      className="hidden"
    />

    {/* 链接弹窗 */}
    {linkEditingNodeId && (
      <LinkDialog nodeId={linkEditingNodeId} onClose={() => setLinkEditingNodeId(null)} />
    )}

    {/* 备注抽屉 */}
    {noteEditingNodeId && (
      <NoteDrawer nodeId={noteEditingNodeId} onClose={() => setNoteEditingNodeId(null)} />
    )}
    </>
  )
})


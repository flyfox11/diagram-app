import { type DragEvent } from 'react'
import { Square, Play, Flag, Diamond } from 'lucide-react'

interface NodeTemplate {
  type: string
  label: string
  icon: React.ReactNode
  color: string
}

const NODE_TEMPLATES: NodeTemplate[] = [
  {
    type: 'start',
    label: '开始 / 结束',
    icon: <Play className="w-4 h-4" />,
    color: 'border-green-600 bg-green-900/30',
  },
  {
    type: 'default',
    label: '处理过程',
    icon: <Square className="w-4 h-4" />,
    color: 'border-blue-600 bg-blue-900/30',
  },
  {
    type: 'diamond',
    label: '判断条件',
    icon: <Diamond className="w-4 h-4" />,
    color: 'border-yellow-600 bg-yellow-900/30',
  },
  {
    type: 'end',
    label: '终止节点',
    icon: <Flag className="w-4 h-4" />,
    color: 'border-red-600 bg-red-900/30',
  },
]

export default function NodePalette() {
  const onDragStart = (event: DragEvent, template: NodeTemplate) => {
    event.dataTransfer.setData(
      'application/reactflow',
      JSON.stringify({ type: template.type, label: template.label })
    )
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-52 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-gray-300">节点面板</h3>
        <p className="text-xs text-gray-500 mt-0.5">拖拽到画布添加</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {NODE_TEMPLATES.map((tpl) => (
          <div
            key={tpl.type}
            draggable
            onDragStart={(e) => onDragStart(e, tpl)}
            className={`flex items-center gap-3 px-3 py-2.5 border rounded-lg cursor-grab active:cursor-grabbing hover:border-gray-500 transition-colors select-none ${tpl.color}`}
          >
            <span className="text-gray-300 shrink-0">{tpl.icon}</span>
            <span className="text-sm text-gray-200">{tpl.label}</span>
          </div>
        ))}
      </div>

      <div className="px-3 py-2 border-t border-gray-800 text-xs text-gray-600">
        💡 拖拽节点到画布 · 节点间拖拽连线<br />
        Ctrl+点击多选 · Shift+拖拽框选
      </div>
    </div>
  )
}

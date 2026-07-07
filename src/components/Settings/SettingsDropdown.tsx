import { useState, useRef, useEffect } from 'react'
import { Settings, ChevronRight, Github, Cloud, Zap, ZapOff } from 'lucide-react'
import { useSettingsStore } from '@/store/settings-store'

interface SettingsDropdownProps {
  onOpenStorageConfig: () => void
  mode: 'home' | 'editor'
}

export default function SettingsDropdown({ onOpenStorageConfig, mode }: SettingsDropdownProps) {
  const { settings, setAutoSave } = useSettingsStore()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleStorageClick = () => {
    setOpen(false)
    onOpenStorageConfig()
  }

  const handleAutoSaveToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    setAutoSave(!settings.autoSave)
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
        title="设置"
      >
        <Settings className="w-5 h-5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-visible z-50 py-1">
          {mode === 'home' && (
            <>
              {/* 存储位置 - 点击直接打开配置弹窗 */}
              <button
                onClick={handleStorageClick}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
              >
                <span className="flex items-center gap-2">
                  {settings.provider === 'gitee' ? (
                    <Cloud className="w-4 h-4 text-orange-400" />
                  ) : (
                    <Github className="w-4 h-4 text-blue-400" />
                  )}
                  存储位置
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500">
                    {settings.provider === 'gitee' ? 'Gitee' : 'GitHub'}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                </div>
              </button>
            </>
          )}
          
          {mode === 'editor' && (
            <>
              {/* 自动保存 */}
              <button
                onClick={handleAutoSaveToggle}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
              >
                <span className="flex items-center gap-2">
                  {settings.autoSave ? (
                    <Zap className="w-4 h-4 text-amber-400" />
                  ) : (
                    <ZapOff className="w-4 h-4 text-gray-500" />
                  )}
                  自动保存
                </span>
                {/* Toggle switch */}
                <div
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    settings.autoSave ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      settings.autoSave ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

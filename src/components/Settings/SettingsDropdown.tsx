import { useState, useRef, useEffect } from 'react'
import { Settings, ChevronRight, Github, Cloud, Zap, ZapOff, Check } from 'lucide-react'
import { useSettingsStore } from '@/store/settings-store'
import type { StorageProvider } from '@/types/diagram'

interface SettingsDropdownProps {
  onOpenStorageConfig: () => void
}

export default function SettingsDropdown({ onOpenStorageConfig }: SettingsDropdownProps) {
  const { settings, setProvider, setAutoSave } = useSettingsStore()
  const [open, setOpen] = useState(false)
  const [hoverStorage, setHoverStorage] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const storageTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setHoverStorage(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleProviderClick = (provider: StorageProvider) => {
    setProvider(provider)
    setHoverStorage(false)
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
          {/* 存储位置 */}
          <div
            className="relative"
            onMouseEnter={() => {
              clearTimeout(storageTimeoutRef.current)
              setHoverStorage(true)
            }}
            onMouseLeave={() => {
              storageTimeoutRef.current = setTimeout(() => setHoverStorage(false), 200)
            }}
          >
            <div className="flex items-center justify-between px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer">
              <span className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-blue-400" />
                存储位置
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">
                  {settings.repoConfig.provider === 'gitee' ? 'Gitee' : 'GitHub'}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              </div>
            </div>

            {/* 子菜单 - 向左展开避免被屏幕右侧裁剪 */}
            {hoverStorage && (
              <div className="absolute right-full top-0 mr-0.5 w-40 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 py-1">
                <button
                  onClick={() => handleProviderClick('github')}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Github className="w-4 h-4" />
                    GitHub
                  </span>
                  {settings.repoConfig.provider === 'github' && (
                    <Check className="w-3.5 h-3.5 text-blue-400" />
                  )}
                </button>
                <button
                  onClick={() => handleProviderClick('gitee')}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-orange-400" />
                    Gitee
                  </span>
                  {settings.repoConfig.provider === 'gitee' && (
                    <Check className="w-3.5 h-3.5 text-blue-400" />
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-gray-700 my-1" />

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
        </div>
      )}
    </div>
  )
}

import { HashRouter, Routes, Route } from 'react-router-dom'
import { useSettingsStore } from '@/store/settings-store'
import HomePage from '@/pages/HomePage'
import EditorPage from '@/pages/EditorPage'
import SettingsDialog from '@/components/Settings/TokenDialog'
import { useState, useEffect } from 'react'

export default function App() {
  const isConfigured = useSettingsStore((s) => s.isConfigured)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    // dev 模式下不强制弹出设置
    if (!import.meta.env.DEV && !isConfigured) {
      setShowSettings(true)
    }
  }, [isConfigured])

  return (
    <HashRouter>
      <div className="h-screen flex flex-col bg-gray-950">
        <Routes>
          <Route
            path="/"
            element={
              <HomePage onOpenSettings={() => setShowSettings(true)} />
            }
          />
          <Route
            path="/editor/:id"
            element={
              <EditorPage onOpenSettings={() => setShowSettings(true)} />
            }
          />
          <Route path="/editor/new" element={<EditorPage onOpenSettings={() => setShowSettings(true)} />} />
        </Routes>

        {showSettings && (
          <SettingsDialog
            onClose={() => {
              setShowSettings(false)
            }}
          />
        )}
      </div>
    </HashRouter>
  )
}

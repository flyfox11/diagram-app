import { HashRouter, Routes, Route } from 'react-router-dom'
import { useState } from 'react'
import { useSettingsStore } from '@/store/settings-store'
import TokenDialog from '@/components/Settings/TokenDialog'
import HomePage from '@/pages/HomePage'
import EditorPage from '@/pages/EditorPage'

export default function App() {
  const isConfigured = useSettingsStore((s) => s.isConfigured)
  const [showStorageConfig, setShowStorageConfig] = useState(false)

  return (
    <HashRouter>
      <div className="h-screen flex flex-col bg-gray-950">
        <Routes>
          <Route
            path="/"
            element={
              <HomePage onOpenStorageConfig={() => setShowStorageConfig(true)} />
            }
          />
          <Route
            path="/editor/:id"
            element={
              <EditorPage onOpenStorageConfig={() => setShowStorageConfig(true)} />
            }
          />
          <Route path="/editor/new" element={<EditorPage onOpenStorageConfig={() => setShowStorageConfig(true)} />} />
        </Routes>

        {showStorageConfig && (
          <TokenDialog
            onClose={() => {
              setShowStorageConfig(false)
            }}
          />
        )}
      </div>
    </HashRouter>
  )
}

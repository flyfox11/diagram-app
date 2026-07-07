import { useState } from 'react'
import { X, Key, FolderGit2, FlaskConical, Github, Cloud } from 'lucide-react'
import { useSettingsStore } from '@/store/settings-store'

const isDev = import.meta.env.DEV

const DEV_DEFAULTS = {
  token: 'github_pat_dev_mode_fake_token',
  owner: 'flyfox11',
  repo: 'diagram-app',
  branch: 'main',
}

interface TokenDialogProps {
  onClose: () => void
}

export default function TokenDialog({ onClose }: TokenDialogProps) {
  const { settings, setToken, setRepoConfig } = useSettingsStore()
  const provider = settings.repoConfig.provider
  const isGitee = provider === 'gitee'

  const [token, setTokenLocal] = useState(settings.token || (isDev ? DEV_DEFAULTS.token : ''))
  const [owner, setOwner] = useState(settings.repoConfig.owner || (isDev ? DEV_DEFAULTS.owner : ''))
  const [repo, setRepo] = useState(settings.repoConfig.repo || (isDev ? DEV_DEFAULTS.repo : ''))
  const [branch, setBranch] = useState(settings.repoConfig.branch || (isDev ? DEV_DEFAULTS.branch : ''))
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setToken(token.trim() || (isDev ? DEV_DEFAULTS.token : ''))
    setRepoConfig({
      owner: owner.trim() || (isDev ? DEV_DEFAULTS.owner : ''),
      repo: repo.trim() || (isDev ? DEV_DEFAULTS.repo : ''),
      branch: branch.trim() || DEV_DEFAULTS.branch,
    })
    setSaved(true)
    setTimeout(() => {
      setSaved(false)
      onClose()
    }, 800)
  }

  const providerLabel = isGitee ? 'Gitee' : 'GitHub'
  const tokenLabel = isGitee ? 'Gitee 私人令牌' : 'GitHub Personal Access Token'
  const tokenPlaceholder = isGitee ? 'xxxxxxxxxxxxxxxx' : 'ghp_xxxxxxxxxxxx'
  const tokenHint = isGitee
    ? '在 Gitee 设置 → 私人令牌 中生成'
    : '需要 Fine-grained token，权限选择 Contents: Read and Write'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
              {isGitee ? (
                <Cloud className="w-5 h-5 text-orange-400" />
              ) : (
                <Github className="w-5 h-5 text-blue-400" />
              )}
              配置 {providerLabel} 连接
            </h2>
            {isDev && (
              <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-amber-900/40 border border-amber-700/50 text-amber-300 rounded-md">
                <FlaskConical className="w-3 h-3" />
                开发模式
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Token */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {tokenLabel}
            </label>
            <input
              type={isDev ? 'text' : 'password'}
              value={token}
              onChange={(e) => setTokenLocal(e.target.value)}
              placeholder={tokenPlaceholder}
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {isDev ? (
              <p className="mt-1.5 text-xs text-amber-400">
                🔧 开发模式：已预填虚假 Token，任意值均可保存
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-gray-500">
                {tokenHint}
              </p>
            )}
          </div>

          {/* Repo Info */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-1.5">
              <FolderGit2 className="w-4 h-4" />
              仓库信息
            </label>
            <div className="grid grid-cols-7 gap-2">
              <input
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="用户名"
                className="col-span-3 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <span className="flex items-center justify-center text-gray-600">/</span>
              <input
                type="text"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="仓库名"
                className="col-span-3 px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          {/* Branch */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              分支
            </label>
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800">
          <p className="text-xs text-gray-500">
            Token 仅存储在浏览器本地
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saved}
              className={`px-5 py-2 text-sm rounded-lg transition-colors font-medium ${
                saved
                  ? 'bg-green-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {saved ? '✓ 已保存' : '保存配置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

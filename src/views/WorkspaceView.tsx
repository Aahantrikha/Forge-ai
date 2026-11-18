import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileTreeNode, OpenedFile, WorkspaceInfo } from '../shared/workspace'
import { EmptyState } from '../components/EmptyState'
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  FileIcon,
  FolderIcon,
  FolderPlusIcon,
  RefreshIcon,
} from '../components/icons'

export interface WorkspaceViewProps {
  workspace: WorkspaceInfo | null
  tree: FileTreeNode | null
  activeFile: OpenedFile | null
  loading: boolean
  onOpenFolder: () => Promise<void>
  onOpenFile: () => Promise<void>
  onSelectFile: (node: FileTreeNode) => Promise<void>
  onCloseFile: () => void
  onSaveFile?: (filePath: string, content: string) => Promise<OpenedFile | null>
  onRefreshTree: () => Promise<void>
  onSwitchWorkspace: (path: string) => Promise<void>
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`
}

function getFileBadgeColor(ext?: string): string {
  switch (ext) {
    case '.ts':
    case '.tsx':
      return '#3178c6'
    case '.js':
    case '.jsx':
      return '#f7df1e'
    case '.json':
      return '#f0a55a'
    case '.css':
    case '.scss':
      return '#a855f7'
    case '.html':
      return '#e34f26'
    case '.md':
      return '#38bdf8'
    case '.svg':
    case '.png':
    case '.jpg':
      return '#10b981'
    case '.py':
      return '#3b82f6'
    case '.rs':
      return '#f97316'
    case '.go':
      return '#00add8'
    default:
      return 'var(--text-muted)'
  }
}

/** Main workspace view: displays active file content or workspace overview. */
export function WorkspaceView({
  workspace,
  tree,
  activeFile,
  loading,
  onOpenFolder,
  onOpenFile,
  onCloseFile,
  onSaveFile,
  onSwitchWorkspace,
}: WorkspaceViewProps) {
  // Count files & folders
  let fileCount = 0
  let dirCount = 0
  if (tree) {
    const countItems = (node: FileTreeNode) => {
      if (node.type === 'directory') {
        dirCount++
        node.children?.forEach(countItems)
      } else {
        fileCount++
      }
    }
    tree.children?.forEach(countItems)
  }

  return (
    <section className="view" aria-label="Workspace">
      <header className="view-header">
        <div className="view-header-main">
          <h1 className="view-title">Workspace</h1>
          {workspace ? (
            <span className="view-sub" title={workspace.path}>
              {workspace.name} &bull; {workspace.path}
            </span>
          ) : (
            <span className="view-sub">Project and file management</span>
          )}
        </div>
        <div className="view-header-actions">
          <button
            type="button"
            className="btn btn-sm"
            onClick={onOpenFile}
            title="Open a single file (Ctrl+Shift+O)"
          >
            <FileIcon size={14} />
            Open File
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={onOpenFolder}
            title="Open project directory (Ctrl+O)"
          >
            <FolderPlusIcon size={14} />
            {workspace ? 'Switch Folder' : 'Open Folder'}
          </button>
        </div>
      </header>

      {activeFile ? (
        <FileContentViewer file={activeFile} onClose={onCloseFile} onSaveFile={onSaveFile} />
      ) : workspace ? (
        <div className="centered-content">
          <div className="panel project-launcher">
            <span className="launcher-icon">
              <FolderIcon size={34} />
            </span>
            <h2>{workspace.name}</h2>
            <p className="launcher-body" title={workspace.path}>
              {workspace.path}
            </p>
            <p className="launcher-hint">
              {loading
                ? 'Loading files…'
                : `${fileCount} files, ${dirCount} folders indexed in workspace.`}
            </p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button type="button" className="btn btn-sm" onClick={onOpenFile}>
                <FileIcon size={14} />
                Open File…
              </button>
              <button type="button" className="btn btn-sm btn-primary" onClick={onOpenFolder}>
                <FolderPlusIcon size={14} />
                Switch Folder…
              </button>
            </div>
            <p className="launcher-hint" style={{ marginTop: '12px' }}>
              &larr; Click any file in the sidebar explorer to view its contents.
            </p>
          </div>

          {workspace.recentPaths.filter((p) => p !== workspace.path).length > 0 ? (
            <div className="feature-list" style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>
                RECENT WORKSPACES
              </div>
              {workspace.recentPaths
                .filter((p) => p !== workspace.path)
                .slice(0, 3)
                .map((p) => {
                  const base = p.split(/[/\\]/).filter(Boolean).pop() || p
                  return (
                    <li
                      key={p}
                      style={{ cursor: 'pointer' }}
                      onClick={() => void onSwitchWorkspace(p)}
                      title={`Switch to ${p}`}
                    >
                      <FeatureBullet />
                      <span>{base}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        {p}
                      </span>
                    </li>
                  )
                })}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="centered-content">
          <div className="panel project-launcher">
            <span className="launcher-icon">
              <FolderIcon size={34} />
            </span>
            <h2>Open a project</h2>
            <p className="launcher-body">
              Agents operate in exactly one local workspace at a time. All file browsing, code edits, terminal commands,
              and agent actions are safely scoped to your selected project folder.
            </p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <button type="button" className="btn btn-primary" onClick={onOpenFolder}>
                <FolderPlusIcon size={16} />
                Open folder…
              </button>
              <button type="button" className="btn" onClick={onOpenFile}>
                <FileIcon size={16} />
                Open file…
              </button>
            </div>
            <p className="launcher-hint">Select any folder or file on your machine to begin.</p>
          </div>

          <ul className="feature-list">
            <li>
              <FeatureBullet />
              Native folder &amp; file selection with directory traversal guard
            </li>
            <li>
              <FeatureBullet />
              Sidebar file tree explorer with real-time file viewing in workspace
            </li>
            <li>
              <FeatureBullet />
              Scoped workspace boundaries for agent operations
            </li>
            <li>
              <FeatureBullet />
              Integrated terminal (Milestone 6) &amp; Diff review (Milestone 7)
            </li>
          </ul>
        </div>
      )}
    </section>
  )
}

function FeatureBullet() {
  return <span className="feature-dot" aria-hidden="true" />
}

/** Interactive code editor and file viewer with line numbers, tab support, and Save capability. */
function FileContentViewer({
  file,
  onClose,
  onSaveFile,
}: {
  file: OpenedFile
  onClose: () => void
  onSaveFile?: (filePath: string, content: string) => Promise<OpenedFile | null>
}) {
  const [content, setContent] = useState(file.content)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [copied, setCopied] = useState(false)
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const linesRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setContent(file.content)
    setSaveSuccess(false)
  }, [file.path, file.content])

  const isDirty = content !== file.content
  const lines = content.split('\n')

  const handleScroll = () => {
    if (editorRef.current && linesRef.current) {
      linesRef.current.scrollTop = editorRef.current.scrollTop
    }
  }

  const handleSave = useCallback(async () => {
    if (!onSaveFile || !isDirty || isSaving) return
    setIsSaving(true)
    try {
      const updated = await onSaveFile(file.path, content)
      if (updated) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 2000)
      }
    } finally {
      setIsSaving(false)
    }
  }, [content, file.path, isDirty, isSaving, onSaveFile])

  // Global Ctrl+S and native menu File > Save listener
  useEffect(() => {
    const handleGlobalSave = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void handleSave()
      }
    }
    const handleMenuSave = () => {
      void handleSave()
    }
    window.addEventListener('keydown', handleGlobalSave)
    window.addEventListener('forge:save-active-file', handleMenuSave)
    return () => {
      window.removeEventListener('keydown', handleGlobalSave)
      window.removeEventListener('forge:save-active-file', handleMenuSave)
    }
  }, [handleSave])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      void handleSave()
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      const target = e.currentTarget
      const start = target.selectionStart
      const end = target.selectionEnd
      const newContent = content.substring(0, start) + '  ' + content.substring(end)
      setContent(newContent)
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 2
      })
    }
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isBinaryOrLarge =
    file.content.startsWith('/* File is larger') || file.content.startsWith('/* Binary file')

  return (
    <div className="file-viewer-container">
      <div className="file-viewer-header">
        <div className="file-viewer-meta">
          <span className="file-badge" style={{ color: getFileBadgeColor(file.extension) }}>
            <FileIcon size={16} />
          </span>
          <span className="file-viewer-name">{file.name}</span>
          <span className="file-viewer-path" title={file.path}>
            {file.relativePath}
          </span>
          <span className="badge badge-planned">{formatBytes(file.size)}</span>
          <span className="badge badge-planned">{lines.length} lines</span>
          {isDirty && (
            <span className="badge-modified" title="Unsaved changes (Press Ctrl+S to save)">
              <span className="badge-modified-dot" />
              Modified
            </span>
          )}
        </div>
        <div className="file-viewer-actions">
          {!isBinaryOrLarge && onSaveFile && (
            <button
              type="button"
              className={`btn btn-sm${isDirty ? ' btn-primary' : ''}`}
              disabled={!isDirty || isSaving}
              onClick={() => void handleSave()}
              title="Save changes (Ctrl+S)"
            >
              {isSaving ? (
                <span>Saving…</span>
              ) : saveSuccess ? (
                <>
                  <CheckIcon size={13} />
                  <span>Saved!</span>
                </>
              ) : (
                <span>Save</span>
              )}
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={handleCopy} title="Copy file contents">
            {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            type="button"
            className="icon-btn-sm"
            onClick={onClose}
            title="Close file viewer"
            aria-label="Close file viewer"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      </div>
      <div className="file-viewer-code-wrap">
        <div ref={linesRef} className="file-viewer-lines" aria-hidden="true" style={{ overflow: 'hidden' }}>
          {lines.map((_, i) => (
            <div key={i} className="line-number">
              {i + 1}
            </div>
          ))}
        </div>
        {isBinaryOrLarge ? (
          <pre className="file-viewer-code">
            <code>{file.content}</code>
          </pre>
        ) : (
          <textarea
            ref={editorRef}
            className="file-viewer-editor"
            value={content}
            spellCheck={false}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
          />
        )}
      </div>
    </div>
  )
}

export interface WorkspaceSidebarProps {
  workspace: WorkspaceInfo | null
  tree: FileTreeNode | null
  activeFile: OpenedFile | null
  loading: boolean
  onOpenFolder: () => Promise<void>
  onOpenFile: () => Promise<void>
  onSelectFile: (node: FileTreeNode) => Promise<void>
  onRefreshTree: () => Promise<void>
  onSwitchWorkspace: (path: string) => Promise<void>
}

/** Sidebar for the workspace view: renders the interactive File Tree in the sidebar. */
export function WorkspaceSidebar({
  workspace,
  tree,
  activeFile,
  loading,
  onOpenFolder,
  onOpenFile,
  onSelectFile,
  onRefreshTree,
  onSwitchWorkspace,
}: WorkspaceSidebarProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => {
    const s = new Set<string>()
    if (tree?.path) s.add(tree.path)
    return s
  })

  const toggleDirectory = (nodePath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(nodePath)) {
        next.delete(nodePath)
      } else {
        next.add(nodePath)
      }
      return next
    })
  }

  return (
    <>
      <div className="sidebar-header">
        <span className="sidebar-title">Explorer</span>
        <div className="sidebar-header-buttons">
          <button
            type="button"
            className="icon-btn-sm"
            onClick={onOpenFolder}
            title="Open Folder (Ctrl+O)"
            aria-label="Open Folder"
          >
            <FolderPlusIcon size={14} />
          </button>
          <button
            type="button"
            className="icon-btn-sm"
            onClick={onOpenFile}
            title="Open File (Ctrl+Shift+O)"
            aria-label="Open File"
          >
            <FileIcon size={14} />
          </button>
          {workspace ? (
            <button
              type="button"
              className="icon-btn-sm"
              onClick={onRefreshTree}
              title="Refresh File Tree"
              aria-label="Refresh File Tree"
              disabled={loading}
            >
              <RefreshIcon size={13} className={loading ? 'icon-spin' : undefined} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="sidebar-body">
        {workspace ? (
          <div className="sidebar-section" style={{ padding: '4px 0' }}>
            <div className="sidebar-workspace-label" title={workspace.path}>
              <FolderIcon size={14} />
              <span className="workspace-label-text">{workspace.name}</span>
            </div>

            <div className="sidebar-file-tree">
              {loading && !tree ? (
                <div className="tree-loading">Loading files…</div>
              ) : tree ? (
                <SidebarTreeNode
                  node={tree}
                  depth={0}
                  expandedDirs={expandedDirs}
                  selectedPath={activeFile?.path ?? null}
                  onToggleDir={toggleDirectory}
                  onSelectFile={onSelectFile}
                />
              ) : (
                <div className="tree-empty">Empty directory</div>
              )}
            </div>
          </div>
        ) : (
          <div className="sidebar-section">
            <EmptyState
              compact
              icon={<FolderIcon size={26} />}
              title="No folder opened"
              body="Open a directory to explore files and start agent sessions."
            />
            <div style={{ textAlign: 'center', marginTop: '10px' }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={onOpenFolder}>
                <FolderPlusIcon size={13} />
                Open Folder…
              </button>
            </div>
          </div>
        )}

        {workspace?.recentPaths && workspace.recentPaths.length > 0 ? (
          <div className="sidebar-section">
            <span className="sidebar-title">Recent</span>
            <div className="recent-projects-list">
              {workspace.recentPaths.slice(0, 5).map((recentPath) => {
                const name = recentPath.split(/[/\\]/).filter(Boolean).pop() || recentPath
                const isCurrent = workspace.path === recentPath
                return (
                  <button
                    key={recentPath}
                    type="button"
                    className={`recent-project-item${isCurrent ? ' active' : ''}`}
                    onClick={() => onSwitchWorkspace(recentPath)}
                    title={recentPath}
                  >
                    <div className="recent-project-main">
                      <span className="recent-project-name">{name}</span>
                      <span className="recent-project-path">{recentPath}</span>
                    </div>
                    {isCurrent ? <span className="badge badge-planned">Active</span> : null}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}

interface SidebarTreeNodeProps {
  node: FileTreeNode
  depth: number
  expandedDirs: Set<string>
  selectedPath: string | null
  onToggleDir: (path: string) => void
  onSelectFile: (node: FileTreeNode) => void
}

function SidebarTreeNode({
  node,
  depth,
  expandedDirs,
  selectedPath,
  onToggleDir,
  onSelectFile,
}: SidebarTreeNodeProps) {
  const isDirectory = node.type === 'directory'
  const isExpanded = expandedDirs.has(node.path)
  const isSelected = selectedPath === node.path

  if (isDirectory) {
    return (
      <div className="tree-node-group">
        <button
          type="button"
          className={`tree-item dir-item${isSelected ? ' is-selected' : ''}`}
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
          onClick={() => onToggleDir(node.path)}
        >
          <span className="tree-chevron">
            {isExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
          </span>
          <span className="tree-icon dir-icon">
            <FolderIcon size={13} />
          </span>
          <span className="tree-label">{node.name}</span>
        </button>
        {isExpanded && node.children && node.children.length > 0 ? (
          <div className="tree-children">
            {node.children.map((child) => (
              <SidebarTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                expandedDirs={expandedDirs}
                selectedPath={selectedPath}
                onToggleDir={onToggleDir}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  const badgeColor = getFileBadgeColor(node.extension)

  return (
    <button
      type="button"
      className={`tree-item file-item${isSelected ? ' is-selected' : ''}`}
      style={{ paddingLeft: `${depth * 12 + 6}px` }}
      onClick={() => onSelectFile(node)}
      title={`${node.name} (${formatBytes(node.size)})`}
    >
      <span className="tree-chevron spacer" />
      <span className="tree-icon file-icon" style={{ color: badgeColor }}>
        <FileIcon size={13} />
      </span>
      <span className="tree-label">{node.name}</span>
    </button>
  )
}

import { useCallback, useEffect, useState } from 'react'
import type { FileTreeNode, WorkspaceInfo } from '../shared/workspace'
import { forgeApi } from '../shared/bridge'
import { EmptyState } from '../components/EmptyState'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderPlusIcon,
  RefreshIcon,
  TerminalIcon,
} from '../components/icons'

interface WorkspaceViewProps {
  workspace: WorkspaceInfo | null
  onSelectDirectory: () => Promise<void>
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
    default:
      return 'var(--text-muted)'
  }
}

export function WorkspaceView({ workspace, onSelectDirectory, onSwitchWorkspace }: WorkspaceViewProps) {
  const [tree, setTree] = useState<FileTreeNode | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<FileTreeNode | null>(null)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set())

  const loadTree = useCallback(async () => {
    if (!workspace) {
      setTree(null)
      setSelectedFile(null)
      return
    }
    setLoading(true)
    try {
      const rootNode = await forgeApi?.workspace.getTree()
      setTree(rootNode ?? null)
      if (rootNode) {
        // Expand root by default
        setExpandedDirs((prev) => {
          const next = new Set(prev)
          next.add(rootNode.path)
          return next
        })
      }
    } finally {
      setLoading(false)
    }
  }, [workspace])

  useEffect(() => {
    void loadTree()
  }, [loadTree])

  useEffect(() => {
    if (!forgeApi?.workspace) return
    const unsubscribe = forgeApi.workspace.onFileChanged(() => {
      void loadTree()
    })
    return () => {
      unsubscribe()
    }
  }, [loadTree])

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
          {workspace ? (
            <>
              <button
                type="button"
                className="btn btn-sm"
                onClick={loadTree}
                disabled={loading}
                title="Refresh file tree"
                aria-label="Refresh file tree"
              >
                <RefreshIcon size={14} className={loading ? 'icon-spin' : undefined} />
                Refresh
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={onSelectDirectory}
                title="Switch project directory"
              >
                <FolderIcon size={14} />
                Switch project
              </button>
              {workspace.recentPaths.filter((p) => p !== workspace.path).length > 0 ? (
                <div className="quick-switch-group">
                  {workspace.recentPaths
                    .filter((p) => p !== workspace.path)
                    .slice(0, 2)
                    .map((p) => {
                      const base = p.split(/[/\\]/).filter(Boolean).pop() || p
                      return (
                        <button
                          key={p}
                          type="button"
                          className="btn btn-sm"
                          onClick={() => void onSwitchWorkspace(p)}
                          title={`Switch to ${p}`}
                        >
                          {base}
                        </button>
                      )
                    })}
                </div>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={onSelectDirectory}
              title="Open a project"
            >
              <FolderPlusIcon size={14} />
              Open project
            </button>
          )}
        </div>
      </header>

      {!workspace ? (
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
            <button type="button" className="btn btn-primary" onClick={onSelectDirectory}>
              <FolderPlusIcon size={16} />
              Open project…
            </button>
            <p className="launcher-hint">Select any folder on your machine to begin.</p>
          </div>

          {workspace === null && (
            <ul className="feature-list">
              <li>
                <FeatureBullet />
                Native folder selection with directory traversal guard
              </li>
              <li>
                <FeatureBullet />
                Real-time file tree browsing with auto-refresh on changes
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
          )}
        </div>
      ) : (
        <div className="workspace-layout">
          <div className="workspace-tree-pane">
            <div className="workspace-pane-header">
              <span className="pane-title">Files</span>
              <span className="pane-meta">
                {fileCount} files, {dirCount} folders
              </span>
            </div>
            <div className="workspace-tree-scroll">
              {loading && !tree ? (
                <div className="tree-loading">Loading project structure…</div>
              ) : tree ? (
                <TreeNodeItem
                  node={tree}
                  depth={0}
                  expandedDirs={expandedDirs}
                  selectedPath={selectedFile?.path ?? null}
                  onToggleDir={toggleDirectory}
                  onSelectFile={setSelectedFile}
                />
              ) : (
                <div className="tree-empty">Empty directory or unreadable structure</div>
              )}
            </div>
          </div>

          <div className="workspace-detail-pane">
            {selectedFile ? (
              <div className="file-detail-card panel">
                <div className="file-detail-header">
                  <div className="file-detail-icon" style={{ color: getFileBadgeColor(selectedFile.extension) }}>
                    <FileIcon size={24} />
                  </div>
                  <div className="file-detail-info">
                    <h2 className="file-detail-name">{selectedFile.name}</h2>
                    <span className="file-detail-path">{selectedFile.relativePath}</span>
                  </div>
                </div>
                <div className="file-meta-grid">
                  <div className="meta-item">
                    <span className="meta-label">Type</span>
                    <span className="meta-value">{selectedFile.extension || 'Plain file'}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Size</span>
                    <span className="meta-value">{formatBytes(selectedFile.size)}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Full path</span>
                    <span className="meta-value path-truncate" title={selectedFile.path}>
                      {selectedFile.path}
                    </span>
                  </div>
                </div>
                <div className="callout callout-info" style={{ marginTop: '16px' }}>
                  <strong>Milestone 2 Active:</strong> File viewing and editing arrive in Milestone 6 &amp; 7 with
                  diff viewer and git integration. Agent operations are now locked to this workspace.
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">
                  <FolderIcon size={36} />
                </div>
                <h3>{workspace.name}</h3>
                <p>Select a file from the explorer to view details.</p>
                <p className="empty-hint">
                  {fileCount} files indexed in workspace &bull; Auto-watching for changes
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function FeatureBullet() {
  return <span className="feature-dot" aria-hidden="true" />
}

interface TreeNodeItemProps {
  node: FileTreeNode
  depth: number
  expandedDirs: Set<string>
  selectedPath: string | null
  onToggleDir: (path: string) => void
  onSelectFile: (node: FileTreeNode) => void
}

function TreeNodeItem({
  node,
  depth,
  expandedDirs,
  selectedPath,
  onToggleDir,
  onSelectFile,
}: TreeNodeItemProps) {
  const isDirectory = node.type === 'directory'
  const isExpanded = expandedDirs.has(node.path)
  const isSelected = selectedPath === node.path

  if (isDirectory) {
    return (
      <div className="tree-node-group">
        <button
          type="button"
          className={`tree-item dir-item${isSelected ? ' is-selected' : ''}`}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
          onClick={() => onToggleDir(node.path)}
        >
          <span className="tree-chevron">
            {isExpanded ? <ChevronDownIcon size={13} /> : <ChevronRightIcon size={13} />}
          </span>
          <span className="tree-icon dir-icon">
            <FolderIcon size={14} />
          </span>
          <span className="tree-label">{node.name}</span>
        </button>
        {isExpanded && node.children && node.children.length > 0 ? (
          <div className="tree-children">
            {node.children.map((child) => (
              <TreeNodeItem
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
      style={{ paddingLeft: `${depth * 14 + 10}px` }}
      onClick={() => onSelectFile(node)}
    >
      <span className="tree-chevron spacer" />
      <span className="tree-icon file-icon" style={{ color: badgeColor }}>
        <FileIcon size={14} />
      </span>
      <span className="tree-label">{node.name}</span>
      {node.size ? <span className="tree-size">{formatBytes(node.size)}</span> : null}
    </button>
  )
}

interface WorkspaceSidebarProps {
  workspace: WorkspaceInfo | null
  onSelectDirectory: () => Promise<void>
  onSwitchWorkspace: (path: string) => Promise<void>
}

/** Sidebar for the workspace view: active project info & recent projects list. */
export function WorkspaceSidebar({ workspace, onSelectDirectory, onSwitchWorkspace }: WorkspaceSidebarProps) {
  return (
    <>
      <div className="sidebar-header">
        <span className="sidebar-title">Project</span>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={onSelectDirectory}
          title="Open project folder"
        >
          <FolderPlusIcon size={13} />
          Open
        </button>
      </div>

      <div className="sidebar-body">
        {workspace ? (
          <div className="sidebar-section">
            <div className="active-project-card">
              <div className="project-card-top">
                <FolderIcon size={16} />
                <span className="project-card-name">{workspace.name}</span>
              </div>
              <p className="project-card-path" title={workspace.path}>
                {workspace.path}
              </p>
            </div>
          </div>
        ) : (
          <div className="sidebar-section">
            <EmptyState
              compact
              icon={<FolderIcon size={26} />}
              title="No project open"
              body="Open a directory to explore files and start agent sessions."
            />
          </div>
        )}

        <div className="sidebar-section">
          <span className="sidebar-title">Recent projects</span>
          {workspace?.recentPaths && workspace.recentPaths.length > 0 ? (
            <div className="recent-projects-list">
              {workspace.recentPaths.map((recentPath) => {
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
          ) : (
            <EmptyState
              compact
              icon={<TerminalIcon size={24} />}
              title="No recent projects"
              body="Recently opened directories will be remembered here."
            />
          )}
        </div>
      </div>
    </>
  )
}

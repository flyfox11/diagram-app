import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type { DiagramData, DiagramMeta } from '@/types/diagram'
import { layoutMindMap, getDescendantIds, getParentId } from '@/utils/mindmap-layout'

type NodeUpdater = Node[] | ((prev: Node[]) => Node[])
type EdgeUpdater = Edge[] | ((prev: Edge[]) => Edge[])

interface DiagramState {
  // 文件列表
  fileList: DiagramMeta[]
  fileListLoading: boolean
  fileListError: string | null

  // 当前编辑
  currentFile: string | null
  currentName: string
  createdAt: string
  nodes: Node[]
  edges: Edge[]
  viewport: { x: number; y: number; zoom: number }
  isDirty: boolean
  saving: boolean
  saveError: string | null
  diagramType: 'flowchart' | 'mindmap'

  // Actions
  setFileList: (list: DiagramMeta[]) => void
  setFileListLoading: (loading: boolean) => void
  setFileListError: (error: string | null) => void

  loadDiagram: (data: DiagramData) => void
  updateNodes: (nodesOrUpdater: NodeUpdater) => void
  updateEdges: (edgesOrUpdater: EdgeUpdater) => void
  updateNodesSilent: (nodesOrUpdater: NodeUpdater) => void
  updateEdgesSilent: (edgesOrUpdater: EdgeUpdater) => void
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void
  updateEdgeData: (edgeId: string, data: Record<string, unknown>) => void
  addNode: (node: Node) => void
  setDiagramType: (type: 'flowchart' | 'mindmap') => void
  addChildNode: (parentId: string) => string | null
  addSiblingNode: (nodeId: string) => string | null
  toggleNodeExpanded: (nodeId: string) => void
  deleteNodeSubtree: (nodeId: string) => void
  relayoutMindMap: () => void
  noteEditingNodeId: string | null
  setNoteEditingNodeId: (id: string | null) => void
  linkEditingNodeId: string | null
  setLinkEditingNodeId: (id: string | null) => void
  viewMode: 'graph' | 'outline'
  setViewMode: (mode: 'graph' | 'outline') => void
  // undo/redo
  _past: { nodes: Node[]; edges: Edge[] }[]
  _future: { nodes: Node[]; edges: Edge[] }[]
  pushHistory: () => void
  undo: () => void
  redo: () => void
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void
  setName: (name: string) => void
  setSaving: (saving: boolean) => void
  setSaveError: (error: string | null) => void
  markClean: () => void
  setCurrentFile: (id: string) => void
  resetEditor: () => void
}

export const useDiagramStore = create<DiagramState>()((set, get) => ({
  fileList: [],
  fileListLoading: false,
  fileListError: null,

  currentFile: null,
  currentName: '',
  createdAt: '',
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  isDirty: false,
  saving: false,
  saveError: null,
  diagramType: 'flowchart',
  noteEditingNodeId: null,
  linkEditingNodeId: null,
  viewMode: 'graph',
  _past: [],
  _future: [],

  setFileList: (list) => set({ fileList: list }),
  setFileListLoading: (loading) => set({ fileListLoading: loading }),
  setFileListError: (error) => set({ fileListError: error }),

  loadDiagram: (data) =>
    set({
      currentFile: data.id,
      currentName: data.name,
      createdAt: data.createdAt || new Date().toISOString(),
      nodes: data.nodes,
      edges: data.edges,
      viewport: data.viewport || { x: 0, y: 0, zoom: 1 },
      diagramType: data.diagramType || 'flowchart',
      isDirty: false,
      saveError: null,
      _past: [],
      _future: [],
    }),

  updateNodes: (nodesOrUpdater) =>
    set((state) => ({
      nodes:
        typeof nodesOrUpdater === 'function'
          ? nodesOrUpdater(state.nodes)
          : nodesOrUpdater,
      isDirty: true,
    })),

  updateEdges: (edgesOrUpdater) =>
    set((state) => ({
      edges:
        typeof edgesOrUpdater === 'function'
          ? edgesOrUpdater(state.edges)
          : edgesOrUpdater,
      isDirty: true,
    })),

  updateNodesSilent: (nodesOrUpdater) =>
    set((state) => ({
      nodes:
        typeof nodesOrUpdater === 'function'
          ? nodesOrUpdater(state.nodes)
          : nodesOrUpdater,
    })),

  updateEdgesSilent: (edgesOrUpdater) =>
    set((state) => ({
      edges:
        typeof edgesOrUpdater === 'function'
          ? edgesOrUpdater(state.edges)
          : edgesOrUpdater,
    })),

  addNode: (node) =>
    set((state) => ({
      _past: [...state._past, { nodes: state.nodes, edges: state.edges }].slice(-50),
      _future: [],
      nodes: [...state.nodes, node],
      isDirty: true,
    })),

  setDiagramType: (type) =>
    set((state) => {
      const past = [...state._past, { nodes: state.nodes, edges: state.edges }].slice(-50)
      if (type === 'mindmap' && state.nodes.length === 0) {
        const rootId = `node-${Date.now()}`
        const root: Node = {
          id: rootId,
          type: 'mindmap',
          position: { x: 0, y: 0 },
          data: { label: '中心主题', level: 0, expanded: true },
        }
        return { diagramType: type, nodes: [root], edges: [], isDirty: true, _past: past, _future: [] }
      }
      return { diagramType: type, isDirty: true, _past: past, _future: [] }
    }),

  addChildNode: (parentId) => {
    const state = get()
    if (state.diagramType !== 'mindmap') return null
    get().pushHistory()

    const parent = state.nodes.find((n) => n.id === parentId)
    if (!parent) return null

    const childId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const level = ((parent.data?.level as number) ?? 0) + 1
    const newNode: Node = {
      id: childId,
      type: 'mindmap',
      position: { x: 0, y: 0 },
      data: { label: '新分支', level, expanded: true },
    }
    const newEdge: Edge = {
      id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      source: parentId,
      target: childId,
      type: 'mindmap',
    }

    const allNodes = state.nodes.map((n) =>
      n.id === parentId ? { ...n, data: { ...n.data, expanded: true } } : n
    )
    allNodes.push(newNode)
    const allEdges = [...state.edges, newEdge]

    const positions = layoutMindMap(allNodes, allEdges)
    const layoutedNodes = allNodes.map((n) =>
      positions[n.id] ? { ...n, position: positions[n.id] } : n
    )

    set({ nodes: layoutedNodes, edges: allEdges, isDirty: true })
    // 延迟重新布局：等 React Flow 测量真实节点高度后再收紧间距
    requestAnimationFrame(() => requestAnimationFrame(() => get().relayoutMindMap()))
    return childId
  },

  addSiblingNode: (nodeId) => {
    const state = get()
    if (state.diagramType !== 'mindmap') return null

    const parentId = getParentId(nodeId, state.edges)
    if (!parentId) return null // 根节点没有兄弟
    get().pushHistory()

    const parent = state.nodes.find((n) => n.id === parentId)
    if (!parent) return null

    const siblingId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const level = ((parent.data?.level as number) ?? 0) + 1
    const newNode: Node = {
      id: siblingId,
      type: 'mindmap',
      position: { x: 0, y: 0 },
      data: { label: '新分支', level, expanded: true },
    }
    const newEdge: Edge = {
      id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      source: parentId,
      target: siblingId,
      type: 'mindmap',
    }

    const allNodes = [...state.nodes, newNode]
    const allEdges = [...state.edges, newEdge]

    const positions = layoutMindMap(allNodes, allEdges)
    const layoutedNodes = allNodes.map((n) =>
      positions[n.id] ? { ...n, position: positions[n.id] } : n
    )

    set({ nodes: layoutedNodes, edges: allEdges, isDirty: true })
    // 延迟重新布局：等 React Flow 测量真实节点高度后再收紧间距
    requestAnimationFrame(() => requestAnimationFrame(() => get().relayoutMindMap()))
    return siblingId
  },

  toggleNodeExpanded: (nodeId) =>
    set((state) => {
      const past = [...state._past, { nodes: state.nodes, edges: state.edges }].slice(-50)
      const updatedNodes = state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, expanded: !n.data?.expanded } }
          : n
      )
      const positions = layoutMindMap(updatedNodes, state.edges)
      const layoutedNodes = updatedNodes.map((n) =>
        positions[n.id] ? { ...n, position: positions[n.id] } : n
      )
      return { nodes: layoutedNodes, isDirty: true, _past: past, _future: [] }
    }),

  deleteNodeSubtree: (nodeId) =>
    set((state) => {
      const past = [...state._past, { nodes: state.nodes, edges: state.edges }].slice(-50)
      const idsToDelete = new Set(getDescendantIds(nodeId, state.edges))
      const remainingNodes = state.nodes.filter((n) => !idsToDelete.has(n.id))
      const remainingEdges = state.edges.filter(
        (e) => !idsToDelete.has(e.source) && !idsToDelete.has(e.target)
      )
      const positions = layoutMindMap(remainingNodes, remainingEdges)
      const layoutedNodes = remainingNodes.map((n) =>
        positions[n.id] ? { ...n, position: positions[n.id] } : n
      )
      return { nodes: layoutedNodes, edges: remainingEdges, isDirty: true, _past: past, _future: [] }
    }),

  relayoutMindMap: () =>
    set((state) => {
      if (state.diagramType !== 'mindmap') return state
      const positions = layoutMindMap(state.nodes, state.edges)
      const layoutedNodes = state.nodes.map((n) =>
        positions[n.id] ? { ...n, position: positions[n.id] } : n
      )
      return { nodes: layoutedNodes, isDirty: true }
    }),

  setNoteEditingNodeId: (id) => set({ noteEditingNodeId: id }),
  setLinkEditingNodeId: (id) => set({ linkEditingNodeId: id }),

  setViewMode: (mode) => set({ viewMode: mode }),

  pushHistory: () =>
    set((state) => ({
      _past: [...state._past, { nodes: state.nodes, edges: state.edges }].slice(-50),
      _future: [],
    })),

  undo: () =>
    set((state) => {
      if (state._past.length === 0) return state
      const previous = state._past[state._past.length - 1]
      return {
        nodes: previous.nodes,
        edges: previous.edges,
        _past: state._past.slice(0, -1),
        _future: [...state._future, { nodes: state.nodes, edges: state.edges }],
        isDirty: true,
      }
    }),

  redo: () =>
    set((state) => {
      if (state._future.length === 0) return state
      const next = state._future[state._future.length - 1]
      return {
        nodes: next.nodes,
        edges: next.edges,
        _past: [...state._past, { nodes: state.nodes, edges: state.edges }],
        _future: state._future.slice(0, -1),
        isDirty: true,
      }
    }),

  updateNodeData: (nodeId, data) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
      ),
      isDirty: true,
    })),

  updateEdgeData: (edgeId, data) =>
    set((state) => ({
      edges: state.edges.map((e) =>
        e.id === edgeId ? { ...e, data: { ...e.data, ...data } } : e
      ),
      isDirty: true,
    })),

  setViewport: (viewport) => set({ viewport }),

  setName: (name) => set({ currentName: name, isDirty: true }),
  setSaving: (saving) => set({ saving }),
  setSaveError: (error) => set({ saveError: error }),
  markClean: () => set({ isDirty: false }),
  setCurrentFile: (id) => set({ currentFile: id }),

  resetEditor: () =>
    set({
      currentFile: null,
      currentName: '',
      createdAt: '',
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      isDirty: false,
      saveError: null,
      _past: [],
      _future: [],
    }),
}))

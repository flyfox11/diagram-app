import type { Node, Edge } from '@xyflow/react'

const H_GAP = 220 // 父子水平间距
const V_GAP = 16  // 兄弟节点垂直间距
const NODE_H = 36 // 默认节点高度

/** 获取节点的实际测量高度（图片节点更高） */
function getNodeHeight(node: Node | undefined): number {
  const measured = node?.measured as { height?: number } | undefined
  return measured?.height || NODE_H
}

type PositionMap = Record<string, { x: number; y: number }>

/** 构建 parent → children ID 映射 */
export function buildChildrenMap(nodes: Node[], edges: Edge[]): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const edge of edges) {
    if (!map[edge.source]) map[edge.source] = []
    map[edge.source].push(edge.target)
  }
  return map
}

/** 找根节点（无入边的节点） */
export function findRoots(nodes: Node[], edges: Edge[]): string[] {
  const targetIds = new Set(edges.map((e) => e.target))
  return nodes.filter((n) => !targetIds.has(n.id)).map((n) => n.id)
}

/** 获取所有可见节点 ID（排除折叠子树） */
export function getVisibleNodeIds(nodes: Node[], edges: Edge[]): Set<string> {
  const childrenMap = buildChildrenMap(nodes, edges)
  const roots = findRoots(nodes, edges)
  const visible = new Set<string>()

  function traverse(nodeId: string) {
    visible.add(nodeId)
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return
    const expanded = node.data?.expanded !== false
    if (!expanded) return

    for (const childId of childrenMap[nodeId] || []) {
      traverse(childId)
    }
  }

  for (const root of roots) traverse(root)
  return visible
}

/** 递归布局子树，返回 { height, positions } */
function layoutSubtree(
  nodeId: string,
  x: number,
  y: number,
  nodes: Node[],
  childrenMap: Record<string, string[]>
): { height: number; positions: PositionMap } {
  const node = nodes.find((n) => n.id === nodeId)
  const nodeH = getNodeHeight(node)
  const expanded = node?.data?.expanded !== false
  const children = expanded ? childrenMap[nodeId] || [] : []

  if (children.length === 0) {
    // React Flow position 是左上角，直接用 y
    return {
      height: nodeH,
      positions: { [nodeId]: { x, y } },
    }
  }

  let totalHeight = 0
  const childPositions: PositionMap = {}

  for (const childId of children) {
    const result = layoutSubtree(childId, x + H_GAP, y + totalHeight, nodes, childrenMap)
    Object.assign(childPositions, result.positions)
    totalHeight += result.height + V_GAP
  }
  totalHeight -= V_GAP

  // 父节点居中于子节点范围（左上角定位）
  const parentY = y + totalHeight / 2 - nodeH / 2

  return {
    height: Math.max(totalHeight, nodeH),
    positions: { [nodeId]: { x, y: parentY }, ...childPositions },
  }
}

/** 自动布局思维导图（水平树，从左到右） */
export function layoutMindMap(nodes: Node[], edges: Edge[]): PositionMap {
  const childrenMap = buildChildrenMap(nodes, edges)
  const roots = findRoots(nodes, edges)
  const positions: PositionMap = {}

  let yOffset = 0
  for (const rootId of roots) {
    const result = layoutSubtree(rootId, 0, yOffset, nodes, childrenMap)
    Object.assign(positions, result.positions)
    yOffset += result.height + V_GAP * 3
  }

  return positions
}

/** 获取节点的所有后代 ID（含自身） */
export function getDescendantIds(nodeId: string, edges: Edge[]): string[] {
  const childrenMap = buildChildrenMap([], edges)
  const result: string[] = [nodeId]

  function collect(id: string) {
    for (const childId of childrenMap[id] || []) {
      result.push(childId)
      collect(childId)
    }
  }

  collect(nodeId)
  return result
}

/** 获取节点的父节点 ID */
export function getParentId(nodeId: string, edges: Edge[]): string | null {
  const edge = edges.find((e) => e.target === nodeId)
  return edge?.source ?? null
}

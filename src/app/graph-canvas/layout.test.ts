import { describe, expect, it } from 'vitest'

import type { GraphEdge, GraphNode } from '@/core/graph/schema'
import {
  buildLayout,
  COLUMN_WIDTH,
  NODE_HEIGHT,
  NODE_WIDTH,
  PADDING_X,
  PADDING_Y,
  ROW_HEIGHT,
} from './layout'

function file(id: string, path = id): GraphNode {
  return { id, kind: 'file', path, name: path.split('/').at(-1) ?? path } as GraphNode
}

function importEdge(from: string, to: string): GraphEdge {
  return {
    id: `${from}->${to}`,
    from,
    to,
    kind: 'import',
    granularity: 'file',
    importKind: 'value',
    specifier: to,
  } as GraphEdge
}

/** 層を列にする、いちばん素直な規則 */
const byLayerIndex = (layers: Record<string, number>) => (node: GraphNode) => layers[node.id] ?? 0

describe('列の割り当て', () => {
  it('列は左から順に、値の小さいものから並ぶ', () => {
    const layout = buildLayout({
      nodes: [file('c'), file('a'), file('b')],
      edges: [],
      columnOf: byLayerIndex({ a: 0, b: 1, c: 2 }),
    })

    expect(layout.columns.map((column) => [column.column, column.x])).toEqual([
      [0, PADDING_X],
      [1, PADDING_X + COLUMN_WIDTH],
      [2, PADDING_X + COLUMN_WIDTH * 2],
    ])
  })

  it('中身のある列だけを詰める。空の列で図が間延びしない', () => {
    const layout = buildLayout({
      nodes: [file('a'), file('b')],
      edges: [],
      // 2 と 7 のあいだの列は空
      columnOf: byLayerIndex({ a: 2, b: 7 }),
    })

    expect(layout.columns.map((column) => column.x)).toEqual([PADDING_X, PADDING_X + COLUMN_WIDTH])
  })

  it('同じ列のノードは行間ぶんずつ下へ置く', () => {
    const layout = buildLayout({
      nodes: [file('a'), file('b'), file('c')],
      edges: [],
      columnOf: () => 0,
    })

    expect(layout.nodes.map((placed) => placed.y)).toEqual([
      PADDING_Y,
      PADDING_Y + ROW_HEIGHT,
      PADDING_Y + ROW_HEIGHT * 2,
    ])
  })
})

describe('列の中の並び', () => {
  it('既定はパス順。つながりが無ければその順を保つ', () => {
    const layout = buildLayout({
      nodes: [file('c', 'src/c.ts'), file('a', 'src/a.ts'), file('b', 'src/b.ts')],
      edges: [],
      columnOf: () => 0,
    })

    expect(layout.nodes.map((placed) => placed.node.id)).toEqual(['a', 'b', 'c'])
  })

  it('並べ替えの規則を差し替えられる', () => {
    const layout = buildLayout({
      nodes: [file('a', 'src/a.ts'), file('b', 'src/b.ts')],
      edges: [],
      columnOf: () => 0,
      sortKeyOf: (node) => (node.id === 'b' ? '0' : '1'),
    })

    expect(layout.nodes.map((placed) => placed.node.id)).toEqual(['b', 'a'])
  })

  it('つながっている相手の行へ寄せて、線の交差を減らす', () => {
    // パス順に並べると a→y と b→x が交差する。どちらの列を動かして
    // ほどくかは決めない（左列を入れ替えても交差は消える）ため、
    // **交差が残っていないこと**を条件にする
    const layout = buildLayout({
      nodes: [
        file('a', 'src/a.ts'),
        file('b', 'src/b.ts'),
        file('x', 'src/x.ts'),
        file('y', 'src/y.ts'),
      ],
      edges: [importEdge('a', 'y'), importEdge('b', 'x')],
      columnOf: (node) => (node.id === 'a' || node.id === 'b' ? 0 : 1),
    })

    const y = new Map(layout.nodes.map((placed) => [placed.node.id, placed.y]))
    // 2 本の線が交差しない ⇔ つないだ相手どうしの上下関係が揃っている
    const first = Math.sign(y.get('a')! - y.get('b')!)
    const second = Math.sign(y.get('y')! - y.get('x')!)
    expect(first).toBe(second)
  })

  it('交差をほどけない形でも、全ノードを落とさず置く', () => {
    // 総当たりでつながっていると、どう並べても交差は残る
    const layout = buildLayout({
      nodes: [
        file('a', 'src/a.ts'),
        file('b', 'src/b.ts'),
        file('x', 'src/x.ts'),
        file('y', 'src/y.ts'),
      ],
      edges: [
        importEdge('a', 'x'),
        importEdge('a', 'y'),
        importEdge('b', 'x'),
        importEdge('b', 'y'),
      ],
      columnOf: (node) => (node.id === 'a' || node.id === 'b' ? 0 : 1),
    })

    expect(layout.nodes.map((placed) => placed.node.id).sort()).toEqual(['a', 'b', 'x', 'y'])
  })

  it('つながる相手がいないノードも落とさない', () => {
    const layout = buildLayout({
      nodes: [file('a', 'src/a.ts'), file('lonely', 'src/z.ts'), file('b', 'src/b.ts')],
      edges: [importEdge('a', 'b')],
      columnOf: () => 0,
    })

    expect(layout.nodes.map((placed) => placed.node.id).sort()).toEqual(['a', 'b', 'lonely'])
  })
})

describe('図の大きさ', () => {
  it('列と行の数から求まる', () => {
    const layout = buildLayout({
      nodes: [file('a'), file('b'), file('c')],
      edges: [],
      columnOf: (node) => (node.id === 'c' ? 1 : 0),
    })

    expect(layout.width).toBe(PADDING_X * 2 + COLUMN_WIDTH + NODE_WIDTH)
    expect(layout.height).toBe(PADDING_Y + ROW_HEIGHT + NODE_HEIGHT + PADDING_X)
  })

  it('ノードが無ければ 0', () => {
    const layout = buildLayout({ nodes: [], edges: [], columnOf: () => 0 })

    expect([layout.width, layout.height, layout.nodes.length]).toEqual([0, 0, 0])
  })
})

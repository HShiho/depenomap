import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import * as v from 'valibot'
import { describe, expect, it } from 'vitest'

import { DependencyGraphSchema, EdgeSchema, NodeSchema } from './schema'

const fixtureUrl = new URL('../../../test-data/dependency-graph.complex.json', import.meta.url)
const fixture: unknown = JSON.parse(readFileSync(fileURLToPath(fixtureUrl), 'utf8'))

describe('DependencyGraphSchema', () => {
  it('正本 JSON のフィクスチャが検査を通る', () => {
    const graph = v.parse(DependencyGraphSchema, fixture)

    expect(graph.schemaVersion).toBe('1.0.0')
    expect(graph.layers).toHaveLength(6)
    expect(graph.nodes).toHaveLength(88)
    expect(graph.edges).toHaveLength(140)
    expect(graph.cycles).toHaveLength(5)
    expect(graph.unresolved).toHaveLength(5)
  })

  it('未知フィールドを読み飛ばす（下流へ渡さない）', () => {
    const withExtra = { ...(fixture as object), unknownTopLevel: 1 }
    const graph = v.parse(DependencyGraphSchema, withExtra)

    expect(graph).not.toHaveProperty('unknownTopLevel')
  })

  it('セクションが欠けていれば、どこが問題かを返す', () => {
    const withoutNodes = { ...(fixture as Record<string, unknown>) }
    delete withoutNodes.nodes
    const result = v.safeParse(DependencyGraphSchema, withoutNodes)

    expect(result.success).toBe(false)
    expect(v.flatten(result.issues!).nested).toHaveProperty('nodes')
  })
})

describe('NodeSchema', () => {
  it('kind で file / method を判別する', () => {
    const graph = v.parse(DependencyGraphSchema, fixture)
    const files = graph.nodes.filter((n) => n.kind === 'file')
    const methods = graph.nodes.filter((n) => n.kind === 'method')

    expect(files).toHaveLength(28)
    expect(methods).toHaveLength(60)
  })

  it('メソッド固有フィールドを持つ file ノードは、その分が読み飛ばされる', () => {
    const node = v.parse(NodeSchema, {
      id: 'file:src/a.ts',
      kind: 'file',
      name: 'a.ts',
      path: 'src/a.ts',
      loc: { line: 1, column: 1 },
    })

    expect(node).not.toHaveProperty('loc')
  })

  it('トップレベル関数は owner / ownerKind が null でも通る', () => {
    const graph = v.parse(DependencyGraphSchema, fixture)
    const topLevel = graph.nodes.filter((n) => n.kind === 'method' && n.owner === null)

    expect(topLevel).toHaveLength(12)
  })

  it('layer が無いノードも通る（層未設定は欠陥ではない）', () => {
    const node = v.parse(NodeSchema, {
      id: 'file:src/a.ts',
      kind: 'file',
      name: 'a.ts',
      path: 'src/a.ts',
    })

    expect(node.layer).toBeUndefined()
  })
})

describe('EdgeSchema', () => {
  it('kind と granularity の組み合わせを型として表現する', () => {
    const graph = v.parse(DependencyGraphSchema, fixture)
    const combos = new Set(graph.edges.map((e) => `${e.kind}/${e.granularity}`))

    expect([...combos].sort()).toEqual([
      'call/method',
      'construct/method',
      'implements/method',
      'import/file',
    ])
  })

  it('import エッジが method 粒度だと落ちる', () => {
    const result = v.safeParse(EdgeSchema, {
      id: 'e_0001',
      kind: 'import',
      granularity: 'method',
      from: 'file:src/a.ts',
      to: 'file:src/b.ts',
      importKind: 'value',
      specifier: './b',
    })

    expect(result.success).toBe(false)
  })

  it('via-interface の to と implementations を両方保持する', () => {
    const graph = v.parse(DependencyGraphSchema, fixture)
    const viaInterface = graph.edges.filter(
      (e) => (e.kind === 'call' || e.kind === 'construct') && e.resolution === 'via-interface',
    )

    expect(viaInterface.length).toBeGreaterThan(0)
    for (const edge of viaInterface) {
      expect(edge.to).toBeTruthy()
    }
  })
})

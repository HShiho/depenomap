import { describe, expect, it } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel, NO_LAYER } from '@/core/ir/view-model'
import { depthColumns, layerColours, layerColumns, TRAILING_COLUMN } from './column-axis'

import fixture from '../../../test-data/dependency-graph.complex.json'

const result = loadGraphFromValue(fixture)
if (!result.ok) throw new Error('フィクスチャが読めない')
const viewModel = buildViewModel(result.graph)

const nodeOf = (id: string) => viewModel.nodeById.get(id)!

/** 全ノードが被依存 1 以上になる（＝起点が空になる）構成 */
const cyclic = (() => {
  const raw = structuredClone(fixture) as {
    nodes: { id: string; kind: string }[]
    edges: unknown[]
    cycles: unknown[]
  }
  // 元のエッジを捨てるので、それを指している循環の申告も落とす
  raw.cycles = []
  const files = raw.nodes.filter((node) => node.kind === 'file').map((node) => node.id)
  raw.edges = files.map((id, index) => ({
    id: `e_cycle_${index}`,
    granularity: 'file',
    kind: 'import',
    from: id,
    to: files[(index + 1) % files.length]!,
    importKind: 'value',
    specifier: '@/cycle',
  }))

  const loaded = loadGraphFromValue(raw)
  if (!loaded.ok) throw new Error('環状のフィクスチャが読めない')
  return buildViewModel(loaded.graph)
})()

/** 層を外した版。フィクスチャは全ノードに層が付いている */
const withoutLayers = (() => {
  const raw = structuredClone(fixture) as { nodes: { kind: string; layer?: string }[] }
  for (const node of raw.nodes.filter((n) => n.kind === 'file').slice(0, 3)) delete node.layer

  const loaded = loadGraphFromValue(raw)
  if (!loaded.ok) throw new Error('層を外したフィクスチャが読めない')
  return buildViewModel(loaded.graph)
})()

describe('層を列にする', () => {
  it('列の並びは正本 JSON の layers の並びに従う（ADR-002）', () => {
    const plan = layerColumns(viewModel)

    for (const node of viewModel.nodes.file) {
      const key = viewModel.layerOf(node.id).key
      expect(plan.columnOf(node)).toBe(viewModel.layerKeys.indexOf(key))
    }
  })

  it('同じ層のノードは同じ列に入る', () => {
    const plan = layerColumns(viewModel)

    for (const [key, nodes] of viewModel.nodesByLayer) {
      const files = nodes.filter((node) => node.kind === 'file')
      if (files.length === 0) continue
      const assigned = new Set(files.map((node) => plan.columnOf(node)))

      expect(assigned.size, String(key.toString())).toBe(1)
    }
  })

  it('見出しは層の名前', () => {
    const plan = layerColumns(viewModel)

    expect(plan.headOf(0).label).toBe(viewModel.layerOfKey(viewModel.layerKeys[0]!)?.name)
  })

  it('層が未設定のノードは、専用の列に、まとまって並ぶ（ADR-002）', () => {
    // フィクスチャは全ノードに層が付いているため、外した版を組んで見る
    const plan = layerColumns(withoutLayers)
    const stripped = withoutLayers.nodes.file.filter(
      (node) => withoutLayers.layerOf(node.id).key === NO_LAYER,
    )

    expect(stripped.length).toBeGreaterThan(1)
    const columns = new Set(stripped.map((node) => plan.columnOf(node)))
    expect(columns.size).toBe(1)

    // 層のあるノードと混ざらず、いちばん後ろへ回る
    const column = [...columns][0]!
    const others = withoutLayers.nodes.file
      .filter((node) => withoutLayers.layerOf(node.id).key !== NO_LAYER)
      .map((node) => plan.columnOf(node))
    expect(Math.max(...others)).toBeLessThan(column)
    expect(plan.headOf(column).label).toBe('層なし')
    expect(plan.headOf(column).colour).toBe('var(--color-ink-3)')
  })

  it('層を引けないノードは最後尾へ寄せる', () => {
    // 層が無いこと自体は欠陥ではない（ADR-002 / N-1）
    const plan = layerColumns(viewModel)
    const stray = { ...nodeOf(viewModel.nodes.file[0]!.id), id: 'file:どこにも無い.ts' }

    expect(plan.columnOf(stray)).toBe(TRAILING_COLUMN)
  })
})

describe('層の色', () => {
  it('6 色を循環させる', () => {
    const colourOf = layerColours(viewModel)
    const colours = viewModel.layerKeys
      .filter((key) => key !== NO_LAYER)
      .map((key) => colourOf(key))

    for (const [index, colour] of colours.entries()) {
      expect(colour).toBe(`var(--color-layer-${(index % 6) + 1})`)
    }
  })

  it('層なしは中立色', () => {
    const colourOf = layerColours(viewModel)

    expect(colourOf(NO_LAYER)).toBe('var(--color-ink-3)')
    expect(colourOf(undefined)).toBe('var(--color-ink-3)')
  })
})

describe('依存深度を列にする', () => {
  it('未選択のときは被依存数 0 のノード群が、そろって深度 0 に並ぶ（ADR-001）', () => {
    const plan = depthColumns(viewModel, 'file', undefined)
    const roots = viewModel.nodes.file.filter((node) => viewModel.fanInOf(node.id, 'file') === 0)

    expect(roots.length).toBeGreaterThan(1)
    for (const root of roots) expect(plan.columnOf(root)).toBe(0)
  })

  it('選択中はそのノード 1 件が起点になる（ADR-001）', () => {
    const target = viewModel.nodes.file.find((node) => viewModel.fanInOf(node.id, 'file') > 0)!
    const plan = depthColumns(viewModel, 'file', target.id)

    expect(plan.columnOf(target)).toBe(0)
    // 起点が変われば、もとの起点は 0 ではなくなる
    const roots = viewModel.nodes.file.filter((node) => viewModel.fanInOf(node.id, 'file') === 0)
    expect(roots.every((root) => plan.columnOf(root) === 0)).toBe(false)
  })

  it('依存の向きに 1 つ進むと、列が 1 つ右へ行く', () => {
    const plan = depthColumns(viewModel, 'file', undefined)
    const root = viewModel.nodes.file.find(
      (node) =>
        viewModel.fanInOf(node.id, 'file') === 0 &&
        viewModel.dependenciesOf(node.id, 'file').length > 0,
    )!

    for (const dependency of viewModel.dependenciesOf(root.id, 'file')) {
      // 最短距離で数えるため、別の起点から近ければ 1 未満にもなりうる
      expect(plan.columnOf(dependency.node)).toBeLessThanOrEqual(1)
    }
  })

  it('起点からたどり着けないノードは最後尾へまとまる（ADR-001）', () => {
    // 起点 1 件に絞ると、到達できないノードが必ず出る
    const target = viewModel.nodes.file[0]!
    const plan = depthColumns(viewModel, 'file', target.id)
    const unreachable = viewModel.nodes.file.filter(
      (node) => plan.columnOf(node) === TRAILING_COLUMN,
    )

    expect(unreachable.length).toBeGreaterThan(0)
  })

  it('粒度に無いノードを選んでいても、列が 1 本に潰れない', () => {
    const method = viewModel.nodes.method[0]!
    const plan = depthColumns(viewModel, 'file', method.id)

    const columns = new Set(viewModel.nodes.file.map((node) => plan.columnOf(node)))
    expect(columns.size).toBeGreaterThan(1)
  })

  it('被依存 0 のノードが無いときも、ノードを隠さない（N-2）', () => {
    // 全ノードが互いを使い合う構成では、起点の集合が空になる
    const plan = depthColumns(cyclic, 'file', undefined)
    const columns = cyclic.nodes.file.map((node) => plan.columnOf(node))

    expect(columns).toHaveLength(cyclic.nodes.file.length)
    for (const column of columns) expect(column).toBe(TRAILING_COLUMN)
    // 軸が効いていないのではなく、起点が無いのだと分かるようにする
    expect(plan.headOf(TRAILING_COLUMN).label).toBe('深度未定（起点なし）')
  })

  it('見出しは深度。0 の列は起点だと分かる', () => {
    const roots = depthColumns(viewModel, 'file', undefined)
    const fromSelection = depthColumns(viewModel, 'file', viewModel.nodes.file[0]!.id)

    expect(roots.headOf(0).label).toBe('深度 0（起点）')
    expect(fromSelection.headOf(0).label).toBe('深度 0（選択中）')
    expect(roots.headOf(2).label).toBe('深度 2')
    expect(roots.headOf(TRAILING_COLUMN).label).toBe('深度未定')
  })
})

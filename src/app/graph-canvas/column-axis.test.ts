import { describe, expect, it } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel, NO_LAYER } from '@/core/ir/view-model'
import { layerColours, layerColumns, TRAILING_COLUMN } from './column-axis'

import fixture from '../../../test-data/dependency-graph.complex.json'

const result = loadGraphFromValue(fixture)
if (!result.ok) throw new Error('フィクスチャが読めない')
const viewModel = buildViewModel(result.graph)

const nodeOf = (id: string) => viewModel.nodeById.get(id)!

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

  it('見出しは層の名前。層なしの列はそれと分かる', () => {
    const plan = layerColumns(viewModel)
    const noLayerColumn = viewModel.layerKeys.indexOf(NO_LAYER)

    const first = plan.headOf(0)
    expect(first.label).toBe(viewModel.layerOfKey(viewModel.layerKeys[0]!)?.name)

    if (noLayerColumn >= 0) expect(plan.headOf(noLayerColumn).label).toBe('層なし')
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

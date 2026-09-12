import { describe, expect, it } from 'vitest'

import { loadGraphFromValue } from '@/core/graph/loader'
import { buildViewModel, NO_LAYER } from '@/core/ir/view-model'
import { layerColours, layerOrder } from './layer-colour'

import fixture from '../../../test-data/dependency-graph.complex.json'

const result = loadGraphFromValue(fixture)
if (!result.ok) throw new Error('フィクスチャが読めない')
const viewModel = buildViewModel(result.graph)

describe('層の並び', () => {
  it('正本 JSON の layers の並びを、そのまま番号にする（ADR-002）', () => {
    const order = layerOrder(viewModel)

    for (const [index, key] of viewModel.layerKeys.entries()) expect(order.get(key)).toBe(index)
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

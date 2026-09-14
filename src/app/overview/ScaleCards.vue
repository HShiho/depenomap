<script setup lang="ts">
/**
 * 規模（UT-13 / US-11）。
 *
 * 個々のノードを追う前に、まず大きさを掴む。**数えるのは IR**（`nodes` /
 * `edges` / `layerKeys` の長さ）で、ここでは並べるだけ。
 *
 * 数に良し悪しを付けない（N-1）。多い・少ないの評価も、目安との比較も出さない。
 */
import { computed } from 'vue'

import { NO_LAYER } from '@/core/ir/view-model'
import { useViewState } from '../shell/view-state'

const state = useViewState()

const cards = computed(() => {
  const viewModel = state.viewModel
  if (viewModel === undefined) return []
  return [
    { label: 'ファイル', count: viewModel.nodes.file.length },
    { label: 'メソッド', count: viewModel.nodes.method.length },
    { label: 'ファイル間の依存', count: viewModel.edges.file.length },
    /*
     * **正本 JSON が定義した層だけを数える。** `layerKeys` は、層が未設定の
     * ノードが 1 件でもあれば末尾に「層なし」を足す。それはビューアが受け皿と
     * して作った分類であって、定義された層ではない（ADR-002）。ここで足すと、
     * 6 層と書いてある JSON に対して「層 7」と出る
     */
    { label: '層', count: viewModel.layerKeys.filter((key) => key !== NO_LAYER).length },
  ]
})
</script>

<template>
  <ul class="grid grid-cols-4 gap-9">
    <li
      v-for="card in cards"
      :key="card.label"
      class="rounded-item border border-line bg-surface-2 px-11 py-9"
    >
      <div class="text-metric-l text-ink tabular-nums">{{ card.count }}</div>
      <div class="mt-1 text-caption text-ink-3">{{ card.label }}</div>
    </li>
  </ul>
</template>

<script setup lang="ts">
/**
 * 層ごとの構成比（UT-13 / US-11）。
 *
 * どの層にどれだけのファイルが居るのかを、1 本の帯で見せる。**並びは
 * `layerKeys` のまま**（正本 JSON の並び + 層なしが末尾）。ここで並べ替えると、
 * 図の列（UT-08）と同じ層が違う順で出る。
 *
 * **層が未設定のノードも 1 つの区画として出す**（ADR-002 / N-1）。層が無いこと
 * 自体は欠陥ではなく、落とすと合計がファイル数と合わなくなる。
 *
 * 比率に良し悪しを付けない。「偏っている」といった読みは添えない（N-1）。
 */
import { computed } from 'vue'

import { NO_LAYER } from '@/core/ir/view-model'
import { layerColours } from '../shell/layer-colour'
import { percentOf } from './overview-format'
import { useViewState } from '../shell/view-state'

const state = useViewState()

/** 帯の中に数を出す下限（％）。狭い区画に文字を入れると読めない */
const LABEL_MIN_PERCENT = 9

const composition = computed(() => {
  const viewModel = state.viewModel
  if (viewModel === undefined) return { total: 0, parts: [] }

  const colourOf = layerColours(viewModel)
  const total = viewModel.nodes.file.length
  const parts = viewModel.layerKeys.map((key) => {
    const count = (viewModel.nodesByLayer.get(key) ?? []).filter(
      (node) => node.kind === 'file',
    ).length
    return {
      key,
      name: key === NO_LAYER ? '層なし' : (viewModel.layerOfKey(key)?.name ?? String(key)),
      count,
      percent: percentOf(count, total),
      colour: colourOf(key),
    }
  })
  return { total, parts }
})
</script>

<template>
  <div>
    <div class="flex h-24 overflow-hidden rounded-micro" role="img" aria-label="層ごとの構成比">
      <i
        v-for="part in composition.parts"
        :key="String(part.key)"
        class="flex items-center justify-center text-flag text-accent-ink not-italic tabular-nums"
        :style="{ flexGrow: part.count, background: part.colour }"
        :title="`${part.name} ${part.count} ファイル（${part.percent.toFixed(0)}%）`"
      >
        <template v-if="part.percent >= LABEL_MIN_PERCENT">{{ part.count }}</template>
      </i>
    </div>

    <ul class="mt-8 flex flex-wrap gap-x-11 gap-y-4">
      <li
        v-for="part in composition.parts"
        :key="String(part.key)"
        class="flex items-center gap-4 text-caption text-ink-2"
      >
        <i class="h-7 w-7 shrink-0 rounded-micro" :style="{ background: part.colour }"></i>
        {{ part.name }}
      </li>
    </ul>

    <p class="mt-7 text-caption text-ink-3">
      全 {{ composition.total }} ファイル。並びは下の「層をまたぐ依存の流れ」と同じ順です。
      幅の狭い層は数を省いているので、重ねると出ます。
    </p>
  </div>
</template>

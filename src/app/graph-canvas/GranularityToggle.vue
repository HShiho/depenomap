<script setup lang="ts">
/**
 * 表示粒度の切り替え（UT-07 / US-03）。
 *
 * 全体の形を掴みたいときと、具体的な呼び出しを追いたいときで必要な粒度が違う。
 * 値は状態の器（UT-05）が持ち、ここは読み書きの口だけを置く。
 *
 * 粒度は選択との整合を持つため、書き込みは `setGranularity` を通す
 * （生の代入を許すと、見えない粒度のノードが選ばれたままになる）。
 */
import type { Granularity } from '@/core/ir/view-model'
import { useViewState } from '../shell/view-state'
import SegmentedToggle from './SegmentedToggle.vue'

const state = useViewState()

const options: { value: Granularity; label: string }[] = [
  { value: 'file', label: 'ファイル' },
  { value: 'method', label: 'メソッド' },
]
</script>

<template>
  <SegmentedToggle
    label="粒度"
    :options="options"
    :model-value="state.granularity"
    @update:model-value="state.setGranularity"
  />
</template>

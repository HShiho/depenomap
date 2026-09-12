<script setup lang="ts">
/**
 * 列の並べ方の切り替え（UT-08 / US-04）。
 *
 * アプリケーションの構造を見たいときと、ある地点からの依存の広がりを見たい
 * ときとで、見たい並びが違う。**どちらも並べる軸であって、表示範囲を絞る
 * 手段ではない**（N-2）。深度を指定して出し入れする操作は置かない。
 *
 * 軸は他の状態と整合を取る必要がないため、器（UT-05）の値へ直接書く。
 */
import type { ColumnAxis } from '../shell/view-state'
import { useViewState } from '../shell/view-state'
import SegmentedToggle from './SegmentedToggle.vue'

const state = useViewState()

const options: { value: ColumnAxis; label: string }[] = [
  { value: 'layer', label: '層' },
  { value: 'depth', label: '深度' },
]
</script>

<template>
  <SegmentedToggle v-model="state.columnAxis" label="並べ方" :options="options" />
</template>

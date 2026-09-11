<script setup lang="ts">
/**
 * 表示粒度の切り替え（UT-07 / US-03）。
 *
 * 全体の形を掴みたいときと、具体的な呼び出しを追いたいときで必要な粒度が違う。
 * 値は状態の器（UT-05）が持ち、ここは読み書きの口だけを置く。
 *
 * 置き場所はキャンバス下部のツールバー。見え方の切り替えはすべてここへ集める
 * （参照仕様）。列の軸の切り替え（UT-08）も同じ場所に並ぶ。
 */
import type { Granularity } from '@/core/ir/view-model'
import { useViewState } from '../shell/view-state'

const state = useViewState()

const options: { value: Granularity; label: string }[] = [
  { value: 'file', label: 'ファイル' },
  { value: 'method', label: 'メソッド' },
]
</script>

<template>
  <div
    class="toolbar flex items-center gap-9 rounded-panel border border-line bg-surface px-11 py-7 shadow-float"
  >
    <span class="text-label text-ink-3 uppercase">粒度</span>

    <!--
      選択中は `aria-pressed` で示す。見た目だけで表すと、読み上げでどちらが
      効いているのか分からない（参照仕様の拡張ルール）
    -->
    <div class="seg flex rounded-control border border-line">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="rounded-inner px-9 py-4 text-ui"
        :class="
          state.granularity === option.value
            ? 'bg-accent-soft font-semibold text-ink'
            : 'text-ink-2 hover:bg-surface-2'
        "
        :aria-pressed="state.granularity === option.value"
        @click="state.setGranularity(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* セグメントの内側は角丸を 1 段落とす（参照仕様の inner / control） */
.seg {
  padding: 1px;
}
</style>

<script setup lang="ts">
/**
 * 表示粒度の切り替え（UT-07 / US-03）。
 *
 * 全体の形を掴みたいときと、具体的な呼び出しを追いたいときで必要な粒度が違う。
 * 値は状態の器（UT-05）が持ち、ここは読み書きの口だけを置く。
 *
 * 置き場所はキャンバス下部のツールバー。見え方の切り替えはすべてここへ集める
 * （参照仕様）。列の軸の切り替え（UT-08）も同じ器の中に並ぶため、**枠や影と
 * いった筐体はここに持たない**。持つと、切り替えが増えるたびに浮動パネルが
 * 積み重なる。
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
  <div class="flex items-center gap-7">
    <span id="granularity-label" class="text-label text-ink-3 uppercase">粒度</span>

    <!--
      選択中は `aria-pressed` で示す。見た目だけで表すと、読み上げでどちらが
      効いているのか分からない（参照仕様の拡張ルール）
    -->
    <!--
      群に名前を与える。`aria-pressed` だけだと「ファイル、押されていません」と
      しか読まれず、何の切り替えなのかが分からない
    -->
    <div
      role="group"
      aria-labelledby="granularity-label"
      class="flex rounded-control border border-line p-1"
    >
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

<script setup lang="ts">
/**
 * 絞り込み中であることの印（UT-14 / US-12）。
 *
 * 図から消えたノードは、**消えたこと自体が画面から読めない**。何を中心に
 * 絞っているのかと、解く口をここに出す。
 *
 * 長い識別子でも横へ伸びない。キャンバスの上に重なるので、伸びると図を隠す。
 *
 * 良し悪しは示さない（N-1）。残った数や消えた数を「多い／少ない」として
 * 見せることもしない。
 */
import { useViewState } from '../shell/view-state'

const state = useViewState()

defineProps<{ label: string }>()
</script>

<template>
  <div
    class="flex max-w-[var(--panel-width)] items-center gap-7 rounded-round border border-accent-line bg-accent-soft px-10 py-4 text-ink-2 shadow-float"
  >
    <span class="min-w-0 truncate text-meta">
      <b class="font-mono font-semibold text-ink">{{ label }}</b> の周辺だけを表示中
    </span>

    <button
      type="button"
      class="rounded-control px-4 leading-none text-ink-3 hover:text-ink"
      aria-label="絞り込みを解除"
      title="絞り込みを解除"
      @click="state.setNarrowedToSelection(false)"
    >
      ✕
    </button>
  </div>
</template>

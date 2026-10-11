<script setup lang="ts">
/**
 * 合成ルートの層を隠していることの印（UT-31 / ADR-006 決定 4）。
 *
 * **隠していることは、常に画面から読めるようにする。** 読めなければ、図は
 * 「その依存が無い」と嘘をつく（N-1）。保存された好みから復元して、起動直後から
 * 隠れているときも出る。
 *
 * 描き方の断り（`DrawingNoteChip`）と違い、**戻す口を持つ**。あちらは図がどう
 * 描かれているかを言うだけだが、こちらは利用者が選んだ操作の状態を指しており、
 * 絞り込みの印（UT-14）と同じく、その状態をやめる口がある（ADR-006 決定 4）。
 *
 * 文面は `drawing-notes.ts` が決める。良し悪しは示さない（N-1）。
 */
import { useViewState } from '../shell/view-state'

const state = useViewState()

defineProps<{ note: string }>()
</script>

<template>
  <div
    class="flex max-w-(--panel-width) items-center gap-7 rounded-round border border-line bg-surface px-10 py-4 text-caption text-ink-3 shadow-float"
  >
    <span class="min-w-0">{{ note }}</span>

    <button
      type="button"
      class="shrink-0 rounded-control px-4 text-ink-2 underline hover:text-ink"
      aria-label="合成ルートを表示する"
      @click="state.setCompositionRootHidden(false)"
    >
      表示する
    </button>
  </div>
</template>

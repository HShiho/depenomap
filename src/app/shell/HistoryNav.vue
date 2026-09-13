<script setup lang="ts">
/**
 * 戻る・進む（UT-15 / US-13）。
 *
 * 依存をたどると分岐が多く、元いた場所へ帰れないと探索が続かない。経路の
 * 一覧（パンくず）は作らない（N-3）ので、行き来する手段はここだけになる。
 *
 * 積む単位も、戻った先の見え方の復元も器（UT-05 / UT-14）が持つ。ここは
 * 押せるかどうかを見せて、押されたら伝えるだけ。
 *
 * **キーボードは割り当てない**（UT-15 の決定）。`Alt` + 矢印はブラウザの戻る・
 * 進むで、奪うと利用者がページを離れる手段を失う。`Backspace` も入力欄の外で
 * 同じ意味を持つ環境がある。図の操作にキーを割り当てる UT が出てきたときに、
 * 衝突の少ない組み合わせをまとめて決めるほうがよい。
 */
import { useViewState } from './view-state'

const state = useViewState()
</script>

<template>
  <div class="flex items-center gap-4">
    <button
      type="button"
      class="rounded-control px-6 py-4 text-ui text-ink-2 enabled:hover:bg-surface-2 enabled:hover:text-ink disabled:opacity-40"
      :disabled="!state.canGoBack"
      aria-label="戻る"
      title="戻る"
      @click="state.back()"
    >
      ‹
    </button>

    <button
      type="button"
      class="rounded-control px-6 py-4 text-ui text-ink-2 enabled:hover:bg-surface-2 enabled:hover:text-ink disabled:opacity-40"
      :disabled="!state.canGoForward"
      aria-label="進む"
      title="進む"
      @click="state.forward()"
    >
      ›
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * 推測の候補へ移ったことの印（UT-19 / US-21）。
 *
 * 候補から図へ移ると、**移った先では「推測で来た」ことが画面から消える**。
 * 確定した依存をたどって来たのか、絞り込めなかった候補へ飛んだのかが区別
 * できないと、そこから読み取る構造が実態とずれる。
 *
 * どの式から来たのかも出す。式が分かれば、正しい行き先かどうかを読み手が
 * コードで確かめられる。**こちらでは判定しない**（N-1）。
 *
 * 次にどこかへ移るまで出し続ける。✕ で閉じられる。
 */
defineProps<{ expression: string }>()

defineEmits<{ close: [] }>()
</script>

<template>
  <div
    class="flex max-w-[var(--panel-width)] items-center gap-7 rounded-round border border-line bg-surface px-10 py-4 text-ink-2 shadow-float"
  >
    <span class="flex min-w-0 flex-col gap-2">
      <span class="text-meta">推測の候補へ移動しました</span>
      <span class="min-w-0 truncate font-mono text-caption text-ink-3" :title="expression">
        {{ expression }}
      </span>
    </span>

    <button
      type="button"
      class="rounded-control px-4 leading-none text-ink-3 hover:text-ink"
      aria-label="推測の印を消す"
      title="推測の印を消す"
      @click="$emit('close')"
    >
      ✕
    </button>
  </div>
</template>

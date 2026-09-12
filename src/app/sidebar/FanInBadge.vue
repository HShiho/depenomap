<script setup lang="ts">
/**
 * 被依存数の印（UT-12 / US-10）。
 *
 * **数は UT-02 の算出結果をそのまま出す**。多い少ないの良し悪しは示さない
 * （N-1）。色や強調で差を付けると、数の大きさが問題の大きさに見える。
 */
defineProps<{ count: number }>()
</script>

<template>
  <span
    class="shrink-0 rounded-round bg-surface-3 px-6 py-1 text-kicker text-ink-2 tabular-nums"
    :title="`被依存数 ${count}`"
  >
    {{ count }}
  </span>
</template>

<script setup lang="ts">
/**
 * 検索語がパスにだけ当たったことを示す印（UT-11）。
 *
 * 名前に当たっていない行は、名前を見ても**なぜ残っているのか分からない**。
 * 一致度の優劣を付けるためではなく、残っている理由を示すために出す（N-1）ので、
 * 名前に当たった行には何も付けない（付けると「当たり方の良し悪し」に見える）。
 */
</script>

<template>
  <span
    class="shrink-0 rounded-round bg-surface-3 px-6 py-1 text-kicker text-ink-2"
    title="検索語がパスに一致しました"
  >
    パス
  </span>
</template>

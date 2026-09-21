<script setup lang="ts">
/**
 * 描き方についての断り（UT-26 / QR-1）。
 *
 * 図が黙っていると、描き方の都合が**事実としてそう見える**。
 *
 *   - インターフェース経由の呼び出しは、インターフェース宛に描いている（UT-07）
 *   - ノードが 1 件も出ないのは、絞り込みの結果かもしれない
 *
 * 文面は `drawing-notes.ts` が決める。ここは置き場と見た目だけを持つ。
 *
 * **閉じる口を持たない。** 絞り込みの印（UT-14）や推測の印（UT-19）は操作の
 * 状態を指しており、消す＝その状態をやめる口があった。こちらは**いま図がどう
 * 描かれているか**を言うだけなので、消しても図は変わらない。消せると、消した
 * あとに同じことを確かめる場所が無くなる。
 *
 * 良し悪しは示さない（N-1）。件数は事実として出すが、多い・少ないは言わない。
 */
defineProps<{ note: string }>()
</script>

<template>
  <p
    class="flex max-w-[var(--panel-width)] items-center rounded-round border border-line bg-surface px-10 py-4 text-caption text-ink-3 shadow-float"
  >
    {{ note }}
  </p>
</template>

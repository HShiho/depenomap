<script setup lang="ts">
/**
 * 倍率の表示と、全体表示へ戻す口（UT-16 / US-16）。
 *
 * **上下限に当たったことが読めるように、倍率を出す。** 出さないと、ピンチが
 * 効かなくなったときに「操作が効いていない」のか「限界なのか」が区別できない。
 *
 * 全体表示は、手で動かして迷子になったときに戻れる口。図が組み換わったときは
 * 自動で合わせ直す（`GraphCanvas`）ので、ここは**人が呼ぶときのため**にある。
 *
 * 配置のリセット（ノードを動かしたぶんを戻す）は UT-17 が持つ。ここが持つのは
 * 見ている位置だけ。
 */
defineProps<{ scale: number }>()

defineEmits<{ fit: [] }>()
</script>

<template>
  <div class="flex items-center gap-7">
    <span
      class="w-[44px] text-right font-mono text-caption text-ink-3 tabular-nums"
      role="status"
      :aria-label="`拡大率 ${Math.round(scale * 100)}%`"
    >
      {{ Math.round(scale * 100) }}%
    </span>

    <button
      type="button"
      class="rounded-control px-8 py-4 text-ui text-ink-2 hover:bg-surface-2 hover:text-ink"
      aria-label="全体を表示"
      title="全体を表示"
      @click="$emit('fit')"
    >
      ⤢
    </button>
  </div>
</template>

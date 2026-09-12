<script setup lang="ts">
/**
 * 一覧のメソッド行（UT-12 / US-09）。
 *
 * 所属は行の位置（開いたファイルの中）で示すため、パスは出さない。
 * `badges` スロットは、循環の印（UT-10）と検索の一致（UT-11）の差し込み先。
 * ファイル行と同じく、**選択のボタンの外**に置く（押せる印を入れ子にしない）。
 */
import type { MethodNode } from '@/core/graph/schema'
import FanInBadge from './FanInBadge.vue'

defineProps<{ node: MethodNode; fanIn: number; selected: boolean }>()

defineEmits<{ select: [] }>()
</script>

<template>
  <div class="flex w-full items-center">
    <button
      type="button"
      :data-node-id="node.id"
      class="flex min-w-0 grow items-center gap-7 rounded-control py-4 pl-8 text-left"
      :class="selected ? 'bg-accent-soft' : 'hover:bg-surface-2'"
      :aria-current="selected ? 'true' : undefined"
      @click="$emit('select')"
    >
      <span class="min-w-0 grow truncate font-mono text-meta">
        <span v-if="node.owner !== null" class="text-ink-3">{{ node.owner }}.</span>{{ node.name }}
      </span>
    </button>

    <div class="flex shrink-0 items-center gap-7 pr-8">
      <slot name="badges" />
      <FanInBadge :count="fanIn" />
    </div>
  </div>
</template>

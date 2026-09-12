<script setup lang="ts">
/**
 * 一覧のメソッド行（UT-12 / US-09）。
 *
 * 所属は行の位置（開いたファイルの中）で示すため、パスは出さない。
 * `badges` スロットは、循環の印（UT-10）と検索の一致（UT-11）の差し込み先。
 */
import type { MethodNode } from '@/core/graph/schema'
import FanInBadge from './FanInBadge.vue'

defineProps<{ node: MethodNode; fanIn: number; selected: boolean }>()

defineEmits<{ select: [] }>()
</script>

<template>
  <button
    type="button"
    class="flex w-full min-w-0 items-center gap-7 rounded-control px-8 py-4 text-left"
    :class="selected ? 'bg-accent-soft' : 'hover:bg-surface-2'"
    :aria-current="selected ? 'true' : undefined"
    @click="$emit('select')"
  >
    <span class="min-w-0 grow truncate font-mono text-meta">
      <span v-if="node.owner !== null" class="text-ink-3">{{ node.owner }}.</span>{{ node.name }}
    </span>

    <slot name="badges" />
    <FanInBadge :count="fanIn" />
  </button>
</template>

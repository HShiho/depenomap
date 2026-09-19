<script setup lang="ts">
/**
 * 手で動かしたノードの印（UT-17 / US-18）。
 *
 * **リセットが効く状態かどうかを、図の側でも分かるようにする**（完了条件）。
 * ツールバーのボタンは押せるかどうかで状態を表すが、図を見ているあいだは
 * 視線がそこまで行かない。
 *
 * 件数だけでは「どれを動かしたのか」が分からないので、**触れると（ホバー・
 * フォーカス）名前を出す**。図の中で探し直さずに済む。
 *
 * 良し悪しは示さない（N-1）。動かしたこと自体を問題として扱わない。
 */
import { computed, ref } from 'vue'

import type { GraphNode } from '@/core/graph/schema'
import { fullTitleOf } from './node-label'

/** 名前を出す上限。これを超えたぶんは数で示す */
const LIST_LIMIT = 8

const props = defineProps<{ nodes: readonly GraphNode[] }>()

const open = ref(false)

const names = computed(() => props.nodes.slice(0, LIST_LIMIT).map((node) => fullTitleOf(node)))
const rest = computed(() => Math.max(0, props.nodes.length - LIST_LIMIT))
</script>

<template>
  <div
    v-if="nodes.length > 0"
    class="flex max-w-[var(--panel-width)] flex-col gap-4 rounded-panel border border-line bg-surface px-10 py-6 text-ink-2 shadow-float"
    tabindex="0"
    @mouseenter="open = true"
    @mouseleave="open = false"
    @focusin="open = true"
    @focusout="open = false"
  >
    <span class="text-meta">
      手で動かしたノード
      <b class="font-mono font-semibold text-ink tabular-nums">{{ nodes.length }}</b>
      件
    </span>

    <ul v-if="open" class="flex flex-col gap-2">
      <li v-for="name in names" :key="name" class="truncate font-mono text-caption text-ink-3">
        {{ name }}
      </li>
      <li v-if="rest > 0" class="text-caption text-ink-3">ほか {{ rest }} 件</li>
    </ul>
  </div>
</template>

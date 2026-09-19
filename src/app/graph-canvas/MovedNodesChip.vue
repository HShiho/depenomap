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
 * **図から外れたぶんも数に入れる。** 絞り込みや粒度の切り替えで隠れても
 * 上書きは残っているので、隠れているあいだだけ「戻すものが無い」ように
 * 見えてはいけない。ただし探しに行けないので、そのことは分けて示す。
 *
 * 良し悪しは示さない（N-1）。動かしたこと自体を問題として扱わない。
 */
import { computed, ref } from 'vue'

import type { GraphNode } from '@/core/graph/schema'
import { fullTitleOf } from './node-label'

/** 名前を出す上限。これを超えたぶんは数で示す */
const LIST_LIMIT = 8

const props = defineProps<{
  nodes: readonly GraphNode[]
  /** そのうち、いま図に出ていない数（絞り込みや粒度の切り替えで外れたもの） */
  outOfView?: number
}>()

const open = ref(false)

// 並べるのはノードそのもの。名前は同じものが複数ありうる（別ディレクトリの同名ファイル）
const listed = computed(() => props.nodes.slice(0, LIST_LIMIT))
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
      <li v-for="node in listed" :key="node.id" class="truncate font-mono text-caption text-ink-3">
        {{ fullTitleOf(node) }}
      </li>
      <li v-if="rest > 0" class="text-caption text-ink-3">ほか {{ rest }} 件</li>
      <li v-if="(outOfView ?? 0) > 0" class="text-caption text-ink-3">
        （うち {{ outOfView }} 件はいま図に出ていません）
      </li>
    </ul>
  </div>
</template>

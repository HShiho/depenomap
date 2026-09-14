<script setup lang="ts">
/**
 * 循環の印（UT-10 / US-06）。一覧の行に出す。
 *
 * **事実の提示であって判定ではない**（N-1）。図と同じ色を使うが、深刻度や
 * 是正の示唆は添えない。
 *
 * 行に出すのは「循環」までで、**型のみかどうかは添えない**。一覧は識別子を
 * 読む場所で、行の幅は名前とパスが使う。型のみであることは図の印が出す
 * （UT-10 の決定）。読みたいときのために、印の説明には全文を入れてある。
 */
import { computed } from 'vue'

import type { GraphNode } from '@/core/graph/schema'
import { cycleMarkOf } from '../shell/cycle-mark'
import { useViewState } from '../shell/view-state'

const props = defineProps<{ node: GraphNode }>()

const state = useViewState()

const mark = computed(() =>
  state.viewModel === undefined ? undefined : cycleMarkOf(state.viewModel, props.node.id),
)
</script>

<template>
  <span
    v-if="mark !== undefined"
    class="shrink-0 rounded-round bg-warn-soft px-6 py-1 text-kicker text-warn"
    :title="mark"
  >
    循環
  </span>
</template>

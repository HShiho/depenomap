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
 *
 * **ファイル行に出るのは、そのファイル自身が循環に含まれるときだけ。**
 * 中のメソッドだけが循環している場合は出さない。畳んだ行に「中に何かある」
 * と出すには、正本 JSON が言っていない対応（メソッドの循環をファイルの
 * 事実として読み替えること）をこちらで作ることになる（N-1 / スキーマ §4）。
 * メソッド粒度の循環は、その粒度の行と図で出す。
 */
import { computed } from 'vue'

import type { GraphNode } from '@/core/graph/schema'
import { CYCLE_LABEL, cycleMarkOf } from '../shell/cycle-mark'
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
    {{ CYCLE_LABEL }}
  </span>
</template>

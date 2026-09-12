<script setup lang="ts">
/**
 * ファイルとメソッドの一覧（UT-12 / US-09）。
 *
 * ファイルをアコーディオンにし、**初期表示はすべて閉じている**。最初から全
 * メソッドが並ぶと、規模の大きいアプリケーションでは一覧が読めなくなる。
 *
 * **依存元／依存先の一覧はここに作らない**（N-4）。ノードマップを見れば分かる。
 *
 * 行の選択は器（UT-05）の `select` へ渡す。選んだノードが今の粒度に無ければ
 * 粒度のほうが合う、という規則もそこが持つ。移動や絞り込みを伴う経路は
 * UT-14 が載せるので、ここでは**選ぶところまで**にする。
 */
import { computed, ref, watch } from 'vue'

import { layerColours } from '../shell/layer-colour'
import { useViewState } from '../shell/view-state'
import FileRow from './FileRow.vue'
import MethodRow from './MethodRow.vue'
import { buildSidebarList, type SidebarSort } from './sidebar-list'

const props = defineProps<{ sort: SidebarSort }>()

const state = useViewState()

/** 開いているファイルの ID。**初期は空**（US-09） */
const opened = ref<ReadonlySet<string>>(new Set())

const list = computed(() =>
  state.viewModel === undefined ? [] : buildSidebarList(state.viewModel, props.sort),
)

const colourOf = computed(() =>
  state.viewModel === undefined ? () => 'var(--color-ink-3)' : layerColours(state.viewModel),
)

function toggle(id: string): void {
  const next = new Set(opened.value)
  if (!next.delete(id)) next.add(id)
  opened.value = next
}

/*
 * 選ばれたメソッドの所属ファイルを開く。
 *
 * キャンバスで選んだメソッドが閉じたファイルの中にあると、一覧には何も現れず、
 * 「どこが選ばれているのか」が面から読めない。閉じたまま選択だけ進む状態を
 * 作らない。
 *
 * **開くところまで**にする。その行が見える位置まで一覧をスクロールさせるのは
 * 「移動」であり、UT-14 が持つ単一の移動経路とぶつかる。
 */
watch(
  () => state.selectedNodeId,
  (nodeId) => {
    if (nodeId === undefined) return
    const node = state.viewModel?.nodeById.get(nodeId)
    if (node?.kind !== 'method') return

    const next = new Set(opened.value)
    next.add(node.parent)
    opened.value = next
  },
)
</script>

<template>
  <div class="px-6 pt-5 pb-24">
    <div v-for="file in list" :key="file.node.id" class="mb-1">
      <FileRow
        :node="file.node"
        :fan-in="file.fanIn"
        :open="opened.has(file.node.id)"
        :selected="state.selectedNodeId === file.node.id"
        :colour="colourOf(state.viewModel?.layerOf(file.node.id).key)"
        @toggle="toggle(file.node.id)"
        @select="state.select(file.node.id)"
      />

      <div v-if="opened.has(file.node.id)" class="pt-1 pb-5 pl-24">
        <MethodRow
          v-for="method in file.methods"
          :key="method.node.id"
          :node="method.node"
          :fan-in="method.fanIn"
          :selected="state.selectedNodeId === method.node.id"
          @select="state.select(method.node.id)"
        />

        <p v-if="file.methods.length === 0" class="px-8 py-3 text-caption text-ink-3">
          メソッドなし
        </p>
      </div>
    </div>
  </div>
</template>

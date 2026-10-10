<script setup lang="ts">
/**
 * 合成ルートの層を隠す切り替え（UT-31 / ADR-006）。
 *
 * **層が指定され、グラフに在るときだけ出す**（ADR-006 決定 2）。指定が無ければ
 * 操作そのものが無い。指定された層がグラフに無いときも出さず、そのことは
 * 描き方の断りが言う（押せない口を置いても、直す先は起動コマンドにある）。
 *
 * どの層を隠すのかを口に書く。層の名前づけはリポジトリごとに違い、「合成ルート」
 * という語だけでは何が消えるのか分からない。
 *
 * 隠しているかは器（UT-05）が持ち、解析対象ごとに覚える。
 */
import { computed } from 'vue'

import { useViewState } from '../shell/view-state'

const state = useViewState()

const root = computed(() =>
  state.compositionRoot.kind === 'present' ? state.compositionRoot : undefined,
)
</script>

<template>
  <button
    v-if="root !== undefined"
    type="button"
    class="flex shrink-0 items-center gap-6 rounded-control px-8 py-5 text-ui text-ink-2 hover:bg-surface-2 hover:text-ink"
    :aria-pressed="state.compositionRootHidden"
    @click="state.setCompositionRootHidden(!state.compositionRootHidden)"
  >
    <span
      class="inline-block min-w-11 rounded-micro border px-4 text-center leading-none"
      :class="
        state.compositionRootHidden
          ? 'border-accent-line bg-accent-soft text-accent'
          : 'border-line'
      "
      aria-hidden="true"
    >
      {{ state.compositionRootHidden ? '✓' : '' }}
    </span>
    合成ルート（{{ root.name }}）を隠す
  </button>
</template>

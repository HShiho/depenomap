<script setup lang="ts">
/**
 * 追跡できなかった依存（UT-19 / US-21）。
 *
 * 図に描かれていない依存があることを知らないまま構造を読むと、把握が実態と
 * ずれる。**これは「ルールに反している」のではなく「追跡できなかった」もの**で、
 * DI コンテナの文字列トークンや動的 `import()` のように、原理的にどんなツールを
 * 使っても特定できないものが含まれる（スキーマ §3）。
 *
 * **欠陥として扱わず、是正の示唆も警告も出さない**（N-1）。
 *
 * **確定した依存と推測を混ぜない**（完了条件）。候補は「推測した行き先」として
 * 別に示し、図の矢印にはしない（UT-19 の決定）。候補へ移れるようにはするが、
 * 移った先でも推測から来たことが分かるようにする。
 */
import { computed } from 'vue'

import SheetFrame from '../shell/SheetFrame.vue'
import { fullTitleOf } from '../graph-canvas/node-label'
import { candidateSummaryOf, readingOf } from './unresolved-label'
import { useViewState } from '../shell/view-state'

const emit = defineEmits<{ close: []; moveToCandidate: [nodeId: string, expression: string] }>()

const state = useViewState()

/**
 * 選択中のノードに紐づくもの（完了条件）。
 *
 * 図で「未追跡」の印を見た読み手が、その依存を特定できる必要がある。件数の
 * 多いグラフでは、全件から探し直すことになる。**引き当ては UT-02 のもの**
 * （`unresolvedFrom`）を使う。
 *
 * ファイルを選んでいるときは、その中のメソッドのぶんも拾う。`unresolved[].from`
 * は必ずメソッドなので、ファイル粒度で見ているあいだは 1 件も当たらなくなる。
 */
const selectedIds = computed(() => {
  const viewModel = state.viewModel
  const selected = state.selectedNodeId
  if (viewModel === undefined || selected === undefined) return new Set<string>()

  const node = viewModel.nodeById.get(selected)
  const owners =
    node?.kind === 'file'
      ? (viewModel.methodsOfFile.get(node.id) ?? []).map((method) => method.id)
      : []

  return new Set(
    [selected, ...owners].flatMap((id) => viewModel.unresolvedFrom(id).map((u) => u.id)),
  )
})

const items = computed(() => {
  const viewModel = state.viewModel
  if (viewModel === undefined) return []

  const all = viewModel.unresolved.map((unresolved) => ({
    unresolved,
    /** 呼び出し元。粒度に関わらず引ける（ノード ID で持つ） */
    from: viewModel.nodeById.get(unresolved.from),
    candidates: unresolved.candidates.map((id) => ({ id, node: viewModel.nodeById.get(id) })),
    ofSelected: selectedIds.value.has(unresolved.id),
  }))

  // 並べ替えるだけで、落とさない（全件が見える）
  return [...all.filter((item) => item.ofSelected), ...all.filter((item) => !item.ofSelected)]
})
</script>

<template>
  <SheetFrame
    label="追跡できなかった依存"
    close-label="追跡できなかった依存を閉じる"
    @close="emit('close')"
  >
    <template #header>
      <h2 class="text-title text-ink">追跡できなかった依存</h2>
      <p class="mt-2 text-caption text-ink-3">
        静的解析では行き先を特定できなかった呼び出しです。欠陥ではありません。
      </p>
    </template>

    <p v-if="items.length === 0" class="text-meta text-ink-3">追跡できなかった依存はありません。</p>

    <ul v-else class="flex flex-col gap-11">
      <li
        v-for="item in items"
        :key="item.unresolved.id"
        class="rounded-item border border-line bg-surface-2 px-12 py-10"
        :data-unresolved-id="item.unresolved.id"
        :data-of-selected="item.ofSelected ? '' : undefined"
      >
        <div class="flex items-baseline gap-7 text-caption text-ink-3">
          <span>{{ readingOf(item.unresolved.reason) }}</span>
          <span class="font-mono text-micro">{{ item.unresolved.reason }}</span>
          <span v-if="item.ofSelected" class="text-accent">選択中のノード</span>
        </div>

        <p class="mt-4 font-mono text-meta break-all text-ink">
          {{ item.unresolved.expression }}
        </p>

        <p class="mt-4 text-caption text-ink-2">
          呼び出し元:
          <span class="font-mono">{{
            item.from === undefined ? item.unresolved.from : fullTitleOf(item.from)
          }}</span>
        </p>

        <div class="mt-7 border-t border-line-2 pt-7">
          <p class="text-caption text-ink-3">{{ candidateSummaryOf(item.unresolved) }}</p>

          <!--
            候補は**推測**。確定した依存と同じ見せ方にしない（完了条件）。
            移れるようにはするが、押す前からそれが推測だと読めるようにする
          -->
          <ul v-if="item.candidates.length > 0" class="mt-5 flex flex-col gap-3">
            <li v-for="candidate in item.candidates" :key="candidate.id">
              <button
                type="button"
                class="w-full truncate rounded-item px-6 py-3 text-left font-mono text-caption text-ink-2 hover:bg-surface-3 hover:text-ink"
                :data-node-id="candidate.id"
                :title="`推測の候補へ移動: ${candidate.id}`"
                @click="emit('moveToCandidate', candidate.id, item.unresolved.expression)"
              >
                {{ candidate.node === undefined ? candidate.id : fullTitleOf(candidate.node) }}
              </button>
            </li>
          </ul>
        </div>
      </li>
    </ul>
  </SheetFrame>
</template>

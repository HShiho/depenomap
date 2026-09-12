<script setup lang="ts">
/*
 * 画面の入口。骨格（UT-05）を置き、起動時にグラフを読み込む。
 *
 * 各領域の中身は UT-06 以降が差し込む。いまレールと通知に入っているのは、
 * 器が動いていることを目で確かめるための**暫定表示**である。
 */
import { computed, onMounted, onUnmounted } from 'vue'

import ColumnAxisToggle from './graph-canvas/ColumnAxisToggle.vue'
import NarrowingChip from './graph-canvas/NarrowingChip.vue'
import SidebarPanel from './sidebar/SidebarPanel.vue'
import GranularityToggle from './graph-canvas/GranularityToggle.vue'
import GraphCanvas from './graph-canvas/GraphCanvas.vue'
import AppShell from './shell/AppShell.vue'
import { loadGraphInto } from './shell/graph-source'
import { useViewState } from './shell/view-state'

const state = useViewState()

onMounted(() => void loadGraphInto(state))

/**
 * Esc で絞り込みを解く（UT-14 の決定）。
 *
 * 解く口が印の ✕ だけだと、キャンバスを見ている手をそこまで動かすことになる。
 * **選択は解かない** — Esc は「絞り込みをやめる」であって「選んでいたことを
 * 忘れる」ではない。
 *
 * 画面全体で拾う。絞り込み中はどこを触っていても解けてほしい。**入力欄は除く** —
 * 検索欄の Esc は検索語を消す（`SidebarPanel`）ので、そちらを妨げない。
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !state.narrowedToSelection) return
  const target = event.target
  if (target instanceof HTMLElement && target.closest('input, textarea, select')) return

  state.setNarrowedToSelection(false)
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

/**
 * 絞り込み中に出す名前。絞っていなければ `undefined`。
 *
 * 図から消えたノードは、消えたこと自体が画面から読めない。何を中心に絞って
 * いるのかを出す（US-12）。
 */
const narrowingLabel = computed(() => {
  if (!state.narrowedToSelection) return undefined
  const node = state.selectedNode
  if (node === undefined) return undefined
  return node.kind === 'file'
    ? node.name
    : `${node.owner ?? ''}${node.owner ? '.' : ''}${node.name}`
})
</script>

<template>
  <AppShell>
    <template #canvas>
      <GraphCanvas />
    </template>

    <!--
      見え方の切り替えはキャンバス下部の 1 つの器に集める（参照仕様）。
      列の軸（UT-08）もこの中に並べる
    -->
    <template #canvas-overlay>
      <NarrowingChip v-if="narrowingLabel !== undefined" :label="narrowingLabel" />
    </template>

    <template #toolbar>
      <div
        v-if="state.status.kind === 'ready'"
        class="flex items-center gap-9 rounded-panel border border-line bg-surface px-11 py-7 shadow-float"
      >
        <GranularityToggle />
        <ColumnAxisToggle />
      </div>
    </template>

    <template #rail>
      <div class="flex h-full flex-col items-center gap-9 py-9">
        <!--
          一覧の開閉（US-08）。**畳んだあとに開き直す口**であり、UT-12 はここを
          残す判断をした — 閉じると面ごと見えなくなるので、開き直す口は面の外に
          要る。面の側にも畳む口があり、同じ状態を触る（`SidebarPanel.vue`）
        -->
        <button
          type="button"
          class="rounded-control px-6 py-4 text-ui text-ink-2 hover:bg-surface-2 hover:text-ink"
          :aria-pressed="state.sidebarOpen"
          :aria-label="state.sidebarOpen ? '一覧を閉じる' : '一覧を開く'"
          :title="state.sidebarOpen ? '一覧を閉じる' : '一覧を開く'"
          @click="state.sidebarOpen = !state.sidebarOpen"
        >
          ☰
        </button>

        <div class="grow"></div>

        <button
          type="button"
          class="rounded-control px-6 py-4 text-ui text-ink-2 hover:bg-surface-2 hover:text-ink"
          :aria-label="`配色を切り替え（現在: ${state.themeResolved === 'dark' ? 'ダーク' : 'ライト'}）`"
          :title="`配色を切り替え（現在: ${state.themeResolved === 'dark' ? 'ダーク' : 'ライト'}）`"
          @click="state.toggleTheme()"
        >
          ◐
        </button>
      </div>
    </template>

    <template #sidebar>
      <SidebarPanel />
    </template>

    <template #notice>
      <!--
        出すものが無いときは箱ごと消す。空でも余白ぶんの大きさを持ち、
        キャンバスに重ねた層はポインタを受け取るため、見えない当たり判定が
        キャンバスの操作（選択の解除・UT-16 のパン）を奪う
      -->
      <div v-if="state.status.kind !== 'ready' || state.warnings.length > 0" class="p-12 text-body">
        <p v-if="state.status.kind === 'loading'" class="text-ink-2">読み込み中…</p>

        <!-- サーバーに届かなかった。正本 JSON の問題ではない -->
        <p v-else-if="state.status.kind === 'unreachable'" class="text-ink-2">
          グラフを取得できなかった: {{ state.status.message }}
        </p>

        <!-- 想定外の失敗。起動の問題でも正本の問題でもない -->
        <p v-else-if="state.status.kind === 'broken'" class="text-ink-2">
          グラフを読み込めなかった: {{ state.status.message }}
        </p>

        <template v-else>
          <!-- 読み込みには到達したが、正本 JSON が読めなかった -->
          <section v-if="state.status.kind === 'invalid'">
            <h2 class="text-overline text-ink-3 uppercase">正本 JSON を読み込めなかった</h2>
            <ul>
              <li v-for="(error, index) in state.errors" :key="index" class="font-mono text-meta">
                {{ error.type }}
              </li>
            </ul>
          </section>

          <!-- 警告は読み込みの成否によらず出す -->
          <section v-if="state.warnings.length > 0" class="mt-16">
            <h2 class="text-overline text-ink-3 uppercase">警告</h2>
            <ul>
              <li
                v-for="(warning, index) in state.warnings"
                :key="index"
                class="font-mono text-meta"
              >
                {{ warning.type }}
              </li>
            </ul>
          </section>
        </template>
      </div>
    </template>
  </AppShell>
</template>

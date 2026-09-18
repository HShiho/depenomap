<script setup lang="ts">
/*
 * 画面の入口。骨格（UT-05）を置き、起動時にグラフを読み込む。
 *
 * 各領域の中身は UT-06 以降が差し込む。いまレールと通知に入っているのは、
 * 器が動いていることを目で確かめるための**暫定表示**である。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { callOrder } from './graph-canvas/call-order'
import ColumnAxisToggle from './graph-canvas/ColumnAxisToggle.vue'
import NarrowingChip from './graph-canvas/NarrowingChip.vue'
import { fullTitleOf } from './graph-canvas/node-label'
import CycleBadge from './sidebar/CycleBadge.vue'
import OverviewSheet from './overview/OverviewSheet.vue'
import SidebarPanel from './sidebar/SidebarPanel.vue'
import GranularityToggle from './graph-canvas/GranularityToggle.vue'
import GraphCanvas from './graph-canvas/GraphCanvas.vue'
import AppShell from './shell/AppShell.vue'
import HistoryNav from './shell/HistoryNav.vue'
import { loadGraphInto } from './shell/graph-source'
import { useViewState } from './shell/view-state'

const state = useViewState()

/**
 * 概要を開いているか（UT-13）。
 *
 * **器（UT-05）には持たせない。** 図の見え方（粒度・選択・絞り込み）とは違って、
 * 他の UT がこの状態を読む理由が無く、履歴にも積まない（UT-15 の決定と同じで、
 * 積むのは移動だけ）。ここだけで閉じる。
 */
const overviewOpen = ref(false)

/**
 * 概要が画面に出ているか。**開閉の状態と、出す条件を 1 つの式にする。**
 *
 * 裏を `inert` にするかどうかと、シートを描くかどうかが別々の条件だと、
 * 読み込み結果が `ready` を外れたときにシートだけ消えて、画面全体が
 * `inert` のまま残る。
 */
const overviewShown = computed(() => overviewOpen.value && state.status.kind === 'ready')

/** 概要を開く。閉じたときに焦点を返す先を、状態を倒す前に捕まえておく */
const opener = ref<HTMLElement | null>(null)

function openOverview(event: MouseEvent): void {
  /*
   * **押した口はここで捕まえる。** シート側の `onMounted` で読むと、その時点で
   * 裏は `inert` になっており、ブラウザが焦点を外したあとの値を読みうる。
   */
  opener.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  overviewOpen.value = true
}

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
  if (event.key !== 'Escape') return

  /*
   * 概要が開いていれば、そちらを先に閉じる（UT-13）。重なっている面から
   * 順に閉じるのが Esc の筋で、下に隠れている図の絞り込みを先に解くと、
   * 閉じたあとに図が変わっている
   */
  if (overviewShown.value) {
    closeOverview()
    return
  }
  if (!state.narrowedToSelection) return
  const target = event.target
  if (target instanceof HTMLElement && target.closest('input, textarea, select')) return

  state.setNarrowedToSelection(false)
}

/** 概要を閉じ、開いた口へ焦点を返す */
function closeOverview(): void {
  overviewOpen.value = false
  const button = opener.value
  opener.value = null
  // 裏の `inert` が外れてから戻す。外れる前は焦点を受け取れない
  void nextTick(() => button?.focus())
}

/*
 * 読めなくなったら閉じる。**「出ていない」と「開いている」を食い違わせない。**
 *
 * 出す条件（`overviewShown`）だけで隠すと、`overviewOpen` は立ったまま残る。
 * Esc も出ていないあいだは効かないので倒せず、読み直して `ready` に戻った
 * 瞬間にシートが独りでに開く。
 */
watch(
  () => state.status.kind,
  (kind) => {
    if (kind !== 'ready') closeOverview()
  },
)

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

/**
 * 絞り込み中に出す名前。絞っていなければ `undefined`。
 *
 * 図から消えたノードは、消えたこと自体が画面から読めない。何を中心に絞って
 * いるのかを出す（US-12）。
 */
const narrowingLabel = computed(() =>
  state.narrowedToSelection && state.selectedNode !== undefined
    ? fullTitleOf(state.selectedNode)
    : undefined,
)

/**
 * 依存先の並びについての断りを出すか（UT-09 / US-05）。
 *
 * **順序が実際に効いているときだけ出す。** `sourceOrder` を持つのは
 * call / construct、すなわちメソッド粒度のエッジだけなので、ファイル粒度では
 * 材料が無い。依存先が 1 件以下のときも並びようがない。そこで「出現順に
 * 並んでいる」と言うと、正本 JSON が持たない順序を読ませることになる（C-7）。
 */
const showsOrderNote = computed(
  () =>
    callOrder({
      viewModel: state.viewModel,
      granularity: state.granularity,
      selectedNodeId: state.selectedNodeId,
      narrowed: state.narrowedToSelection,
    }).applies,
)
</script>

<template>
  <AppShell :sheet-open="overviewShown">
    <template #canvas>
      <GraphCanvas />
    </template>

    <!--
      見え方の切り替えはキャンバス下部の 1 つの器に集める（参照仕様）。
      列の軸（UT-08）もこの中に並べる
    -->
    <template #canvas-overlay>
      <NarrowingChip
        v-if="narrowingLabel !== undefined"
        :label="narrowingLabel"
        :order-note="showsOrderNote"
      />
    </template>

    <template #toolbar>
      <div
        v-if="state.status.kind === 'ready'"
        class="flex items-center gap-9 rounded-panel border border-line bg-surface px-11 py-7 shadow-float"
      >
        <HistoryNav />

        <span class="h-17 w-px shrink-0 bg-line"></span>

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

        <!--
          概要（US-11）。いつでも開ける。起動直後は図を出す（UT-13 の決定）。

          **読めていないあいだは押せない。** 押しても何も出ない口を残すと、
          押したことが効いたのかどうかが分からない。読み込み中に押せると、
          読み終えた瞬間に勝手に開くことにもなる。

          **開く専用の口**にしてある。開いているあいだレールは `inert` で、
          ここへは戻ってこられない。押下状態として読み上げても、その口では
          閉じられない。閉じる口は ✕・覆い・Esc の 3 つが持つ
        -->
        <button
          type="button"
          class="rounded-control px-6 py-4 text-ui text-ink-2 hover:bg-surface-2 hover:text-ink disabled:cursor-default disabled:text-line"
          :disabled="state.status.kind !== 'ready'"
          aria-label="概要を開く"
          title="概要"
          @click="openOverview"
        >
          ▤
        </button>

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
      <!--
        一覧の行に出す印は外から渡す（UT-12 が空けた差し込み口）。循環は
        ファイルにもメソッドにもあるので、両方へ同じものを入れる（UT-10）
      -->
      <SidebarPanel>
        <template #file-badges="{ node }">
          <CycleBadge :node="node" />
        </template>
        <template #method-badges="{ node }">
          <CycleBadge :node="node" />
        </template>
      </SidebarPanel>
    </template>

    <template #sheet>
      <OverviewSheet v-if="overviewShown" @close="closeOverview" />
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

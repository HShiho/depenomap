<script setup lang="ts">
/*
 * 画面の入口。骨格（UT-05）を置き、起動時にグラフを読み込む。
 *
 * 各領域の中身は UT-06 以降が差し込む。いまレールと通知に入っているのは、
 * 器が動いていることを目で確かめるための**暫定表示**である。
 */
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'

import { fetchLocate, type FetchLocateOutcome } from '@/core/graph/api'
import type { GraphNode } from '@/core/graph/schema'
import NodeContextMenu from './editor/NodeContextMenu.vue'
import { openActionOf } from './editor/open-action'
import { openTargetOf } from './editor/open-target'
import { callOrder } from './graph-canvas/call-order'
import ColumnAxisToggle from './graph-canvas/ColumnAxisToggle.vue'
import NarrowingChip from './graph-canvas/NarrowingChip.vue'
import { fullTitleOf } from './graph-canvas/node-label'
import CycleBadge from './sidebar/CycleBadge.vue'
import OverviewSheet from './overview/OverviewSheet.vue'
import GuessedMoveChip from './unresolved/GuessedMoveChip.vue'
import UnresolvedSheet from './unresolved/UnresolvedSheet.vue'
import SidebarPanel from './sidebar/SidebarPanel.vue'
import GranularityToggle from './graph-canvas/GranularityToggle.vue'
import GraphCanvas from './graph-canvas/GraphCanvas.vue'
import MovedNodesChip from './graph-canvas/MovedNodesChip.vue'
import ViewportControls from './graph-canvas/ViewportControls.vue'
import AppShell from './shell/AppShell.vue'
import HistoryNav from './shell/HistoryNav.vue'
import { loadGraphInto } from './shell/graph-source'
import { useSheets } from './shell/use-sheet'
import { useViewState } from './shell/view-state'

const state = useViewState()

/**
 * 図の側の口（UT-16）。倍率を読み、全体表示を呼ぶ。
 *
 * ビューポートは図が持つ（UT-06 の契約）。ツールバーは別の領域にあるので、
 * 値と呼び出しをここで橋渡しする。**状態を器（UT-05）へ移さない** — 図の
 * 見ている位置は、図が組み換わるたびに図の側の都合で書き換わる。
 */
const canvas = useTemplateRef<InstanceType<typeof GraphCanvas>>('canvas')

/**
 * 画面全体に重なるもの（UT-13 の概要、UT-19 の追跡できなかった依存）。
 *
 * **器（UT-05）には持たせない。** 図の見え方（粒度・選択・絞り込み）とは違って、
 * 他の UT がこの状態を読む理由が無く、履歴にも積まない（UT-15 の決定と同じで、
 * 積むのは移動だけ）。開閉の取り決めは `use-sheet.ts` にまとめてある。
 */
const ready = () => state.status.kind === 'ready'

const sheets = useSheets<'overview' | 'unresolved'>(ready)

/**
 * 推測の候補から移ったときの記録（UT-19 / US-21）。
 *
 * **移った先では「推測で来た」ことが画面から消える。** 確定した依存をたどって
 * 来たのか、絞り込めなかった候補へ飛んだのかが区別できないと、そこから読み取る
 * 構造が実態とずれる。
 *
 * **「その 1 手で来たか」で持つ。** 移動の回数で消すと、戻る・進む（履歴の長さが
 * 変わらない）や、同じノードを選び直したとき（そもそも積まれない）に取り残される。
 * ノードだけで持つと、確定した依存で同じノードへ来たときに印が復活する。
 * 履歴の位置も、戻ってから選び直すと使い回されるので 1 手を指せない。
 *
 * 履歴の 1 手そのもの（`serial`）を覚えれば、戻って帰ってきたときは出したまま、
 * 選び直したときは出さない、が位置の衝突と無関係に成立する。**選択も見る** —
 * 選択を外しても履歴の位置は動かないので、1 手だけでは指す先が消えても残る。
 */
const guessed = ref<{ nodeId: string; move: number; expression: string } | undefined>(undefined)

const guessedFrom = computed(() => {
  const found = guessed.value
  if (found === undefined) return undefined

  return state.selectedNodeId === found.nodeId && state.currentMove === found.move
    ? found.expression
    : undefined
})

/**
 * 推測の候補へ移る（UT-19 は導線を差し込むだけ）。
 *
 * **移動そのものは UT-14 の経路を通す。** 別の経路を作ると、推測から移った
 * ときだけ絞り込みが立たない、履歴に積まれない、といった食い違いができる。
 */
function moveToCandidate(nodeId: string, expression: string): void {
  state.moveTo(nodeId)
  guessed.value = { nodeId, move: state.currentMove ?? -1, expression }
  sheets.close()
}

onMounted(() => void loadGraphInto(state))

/**
 * ノードの右クリックメニュー（UT-18 / US-19）。
 *
 * 出ているのは 1 つだけ。押した場所と、どのノードを押したかを持つ。
 */
const menu = ref<{ node: GraphNode; at: { x: number; y: number }; title: string } | undefined>(
  undefined,
)

/** 位置の問い合わせの結果。まだ返ってきていなければ `undefined` */
const located = ref<FetchLocateOutcome | undefined>(undefined)

/**
 * 何回目の問い合わせか。
 *
 * **返ってきた結果が、いま出しているメニューのものとは限らない。** 続けて別の
 * ノードを右クリックすると、前の問い合わせが後から返って、別のノードの位置が
 * 出る。ノードの ID で見分けると、同じノードを開き直したときに区別が付かない
 * （UT-19 の学び）。出来事そのものに番号を振る。
 */
let asked = 0

/** 開く先。メニューが出ていなければ `undefined` */
const openTarget = computed(() => {
  const shown = menu.value
  if (shown === undefined) return undefined

  return openTargetOf(shown.node, (id) => state.viewModel?.fileOfMethod(id))
})

const openAction = computed(() => openActionOf(openTarget.value, located.value))

/**
 * ノードを右クリックする（UT-18 / US-19）。
 *
 * **ブラウザの既定のメニューを止める。** 代わりに出すものがあるので、両方が
 * 重なる形にしない（止めるなら代わりを出す、が UT-16 からの取り決め）。
 */
async function onNodeContextMenu(node: GraphNode, event: MouseEvent): Promise<void> {
  event.preventDefault()

  menu.value = { node, at: { x: event.clientX, y: event.clientY }, title: fullTitleOf(node) }
  located.value = undefined

  // 引き当ては computed に 1 か所だけ置く。2 か所に書くと、変えたとき片方だけ直る
  const target = openTarget.value
  if (target === undefined) return

  const mine = ++asked
  const outcome = await fetchLocate(target.path)
  // 自分より後の問い合わせが始まっていれば、この結果は捨てる
  if (mine === asked) located.value = outcome
}

/**
 * メニューを畳む。
 *
 * **前の結果を捨てるのは、次に出すとき**（`onNodeContextMenu`）にやる。ここでも
 * 捨てると同じことを 2 か所に書くことになり、どちらが効いているのかが分からない。
 * 畳んだあとに遅れて返ってきた結果は、出ていないメニューには映らない。
 */
function closeMenu(): void {
  menu.value = undefined
}

/*
 * 図が組み換わったら畳む（UT-18）。
 *
 * メニューは押した瞬間の 1 点に出る。**ポインタを使わずに図が動く経路がある** —
 * キーボードで粒度や列の軸を切り替える、一覧や検索から別のノードを選ぶ、
 * 読み込み直す。動いたあともメニューが残ると、別のノードの上で前のノードの
 * 行き先を出すことになる。
 *
 * 図の側の動き（パン・ズーム・ドラッグ）はメニュー自身が拾う。ここで見るのは
 * **何を描くかが変わったとき**だけにする。
 */
watch(
  [
    () => state.granularity,
    () => state.columnAxis,
    () => state.selectedNodeId,
    () => state.narrowedToSelection,
    () => state.status.kind,
    // 重なりが出たら畳む。メニューは覆いより前（z-20）に出るので、残ると
    // 覆いの上に浮いたまま押せてしまう
    () => sheets.shown.value,
  ],
  closeMenu,
)

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
   * 右クリックメニューが出ていれば、そちらを先に畳む（UT-18）。重なっている
   * 面から順に閉じるのが Esc の筋。メニュー自身も Esc を拾うが、焦点が
   * メニューの外にあるときはそちらへ届かない
   */
  if (menu.value !== undefined) {
    closeMenu()
    return
  }

  /*
   * 概要が開いていれば、そちらを先に閉じる（UT-13）。重なっている面から
   * 順に閉じるのが Esc の筋で、下に隠れている図の絞り込みを先に解くと、
   * 閉じたあとに図が変わっている
   */
  if (sheets.shown.value !== undefined) {
    sheets.close()
    return
  }
  if (!state.narrowedToSelection) return
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
  <AppShell :sheet-open="sheets.shown.value !== undefined">
    <template #canvas>
      <GraphCanvas ref="canvas" @node-context-menu="onNodeContextMenu" />
    </template>

    <!--
      見え方の切り替えはキャンバス下部の 1 つの器に集める（参照仕様）。
      列の軸（UT-08）もこの中に並べる
    -->
    <template #canvas-overlay>
      <!-- 手で動かしたノード（UT-17）。図を見ているあいだも状態が読める -->
      <GuessedMoveChip
        v-if="guessedFrom !== undefined"
        :expression="guessedFrom"
        @close="guessed = undefined"
      />

      <MovedNodesChip
        :nodes="canvas?.movedNodes ?? []"
        :out-of-view="canvas?.movedOutOfView ?? []"
      />

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

        <span class="h-17 w-px shrink-0 bg-line"></span>

        <ViewportControls
          :scale="canvas?.viewport.scale ?? 1"
          :moved-count="canvas?.movedNodes.length ?? 0"
          @fit="canvas?.fitToContent()"
          @reset-positions="canvas?.resetPositions()"
        />
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
          @click="sheets.open('overview', $event)"
        >
          ▤
        </button>

        <!--
          追跡できなかった依存（US-21）。**確定した依存とは別の場所に置く** —
          図の中に混ぜると、描いてあるものが確定なのか推測なのか読めなくなる
        -->
        <button
          type="button"
          class="rounded-control px-6 py-4 text-ui text-ink-2 hover:bg-surface-2 hover:text-ink disabled:cursor-default disabled:text-line"
          :disabled="state.status.kind !== 'ready'"
          aria-label="追跡できなかった依存を開く"
          title="追跡できなかった依存"
          @click="sheets.open('unresolved', $event)"
        >
          ?
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
      <!--
        ノードの右クリックメニュー（UT-18 / US-19）。**列の中ではなくシェルの
        外に置く** — キャンバスの中に入れると、一覧の開閉で幅が変わるたびに
        位置がずれる
      -->
      <NodeContextMenu
        v-if="menu !== undefined"
        :at="menu.at"
        :title="menu.title"
        :subtitle="openTarget?.path"
        :action="openAction"
        @open="closeMenu()"
        @close="closeMenu()"
      />

      <OverviewSheet v-if="sheets.shown.value === 'overview'" @close="sheets.close()" />

      <!-- 追跡できなかった依存（UT-19 / US-21）。確定した依存とは別の場所に置く -->
      <UnresolvedSheet
        v-if="sheets.shown.value === 'unresolved'"
        @close="sheets.close()"
        @move-to-candidate="moveToCandidate"
      />
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

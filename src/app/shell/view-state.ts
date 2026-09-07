/**
 * 表示状態の器（UT-05 が公開する契約）。
 *
 * このツールの機能は互いに絡む。粒度を切り替えればサイドバーもノードマップも
 * 変わり（US-03）、ノードを選べば絞り込みと履歴が同時に動く（US-12 / US-13）。
 * 各機能 UT が互いを直接参照すると並行作業が成立しないため、**状態を 1 箇所に
 * 集め、各 UT はここへ読み書きするだけ**にする（QR-3）。
 *
 * **store は 1 つにする**（UT-05 決定事項）。粒度・選択・絞り込み・履歴は
 * 互いに依存しており、分けると store 同士が参照し合う。「他 UT を直接参照
 * しない」という契約が、状態の層で先に破れる。
 *
 * **永続化しない**（C-3）。テーマだけは例外で、依存グラフの見え方ではなく
 * 閲覧環境の設定であるため UT-04 の口が記憶を持つ。
 */

import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import type { LoadError, LoadWarning } from '@/core/graph/loader'
import type { Granularity, ViewModel } from '@/core/ir/view-model'

/** 列を並べる軸（US-04）。切り替えそのものは UT-08 */
export type ColumnAxis = 'layer' | 'depth'

/**
 * 移動の履歴に積む 1 件。**粒度も一緒に持つ**。
 *
 * ノード ID だけを積むと、粒度をまたいで戻ったときに「ファイル粒度なのに
 * メソッドが選ばれている」状態ができる。戻る・進むは、そのとき見ていた
 * 見え方ごと復元する。
 */
export interface HistoryEntry {
  nodeId: string
  granularity: Granularity
}

/**
 * グラフの読み込み状況。
 *
 * 「サーバーに届かなかった」と「正本 JSON を読めなかった」は直す場所が違う
 * ため、UT-03 の `FetchGraphOutcome` と同じ区別をここでも保つ。
 */
export type GraphStatus =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'unreachable'; message: string }
  | { kind: 'invalid' }
  /**
   * 想定していない失敗。応答が `LoadResult` の形でない、変換の途中で投げた、など。
   * 起動の問題でも正本の問題でもないため、上の 2 つと分けて持つ
   */
  | { kind: 'broken'; message: string }

export const useViewState = defineStore('view-state', () => {
  /* --- グラフ ---------------------------------------------------------- */

  /**
   * 表示用中間表現（UT-02）。`shallowRef` にするのは、中身が読み取り専用の
   * 大きなグラフであり、深い監視に意味がないため。
   */
  const viewModel = shallowRef<ViewModel | undefined>(undefined)
  const status = ref<GraphStatus>({ kind: 'loading' })
  /** 読み込みは成否によらず警告を返す。成功時も失敗時も同じ場所に出す */
  const warnings = ref<readonly LoadWarning[]>([])
  /**
   * 読めなかった理由。**UT-01 が返した形のまま持つ**。
   *
   * 種別だけに潰すと、どのファイルの何が壊れているか（`read-failed` のパス、
   * `schema-mismatch` の issue、`integrity-violated` の報告）が状態から消え、
   * 後続の UT が出せなくなる。文言を組み立てないことと、素材を捨てることは別。
   */
  const errors = ref<readonly LoadError[]>([])

  /* --- 見え方 ---------------------------------------------------------- */

  const granularity = ref<Granularity>('file')
  const columnAxis = ref<ColumnAxis>('layer')
  const query = ref('')
  const sidebarOpen = ref(true)

  /** キャンバス領域の実寸。描画側（UT-06）はこれを読むだけでよい */
  const canvasWidth = ref(0)
  const canvasHeight = ref(0)

  /* --- 選択・絞り込み・履歴 -------------------------------------------- */

  const selectedNodeId = ref<string | undefined>(undefined)
  /** 選択したノードとその直接の依存先・依存元だけに絞るか（US-14） */
  const narrowedToSelection = ref(false)

  /**
   * 移動の履歴（US-13）。**選択したノードの列**であり、粒度の切り替えや
   * 絞り込みの ON/OFF は積まない。それらは「移動」ではない。
   */
  const history = ref<HistoryEntry[]>([])
  const historyIndex = ref(-1)

  const selectedNode = computed(() =>
    selectedNodeId.value === undefined
      ? undefined
      : viewModel.value?.nodeById.get(selectedNodeId.value),
  )
  const canGoBack = computed(() => historyIndex.value > 0)
  const canGoForward = computed(() => historyIndex.value < history.value.length - 1)

  /** 履歴を進めずに選択だけを差し替える。履歴側から戻す・進むときに使う */
  function applySelection(nodeId: string | undefined): void {
    selectedNodeId.value = nodeId
    // 選択が無ければ絞り込みは成立しない
    if (nodeId === undefined) narrowedToSelection.value = false
  }

  /**
   * ノードを選ぶ。履歴に積む。
   *
   * 選んだノードが**いまの粒度で表示できないなら、粒度をそちらへ合わせる**。
   * 合わせないと、表示されていないノードが選択された状態になり、絞り込み
   * （US-14）や描画（UT-06）がその前提で動くことになる。
   *
   * 戻ったあとに別のノードを選ぶと、進む先は捨てる（ブラウザと同じ）。
   * 同じノードを選び直したときは積まない。
   */
  function select(nodeId: string): void {
    const node = viewModel.value?.nodeById.get(nodeId)
    if (node && node.kind !== granularity.value) granularity.value = node.kind

    applySelection(nodeId)
    if (history.value[historyIndex.value]?.nodeId === nodeId) return

    history.value = [
      ...history.value.slice(0, historyIndex.value + 1),
      { nodeId, granularity: granularity.value },
    ]
    historyIndex.value = history.value.length - 1
  }

  /** 選択を外す。履歴は消さない（戻れば直前のノードへ帰れる） */
  function clearSelection(): void {
    applySelection(undefined)
  }

  /** 履歴の 1 件へ戻す。そのとき見ていた粒度ごと復元する */
  function applyEntry(entry: HistoryEntry | undefined): void {
    if (!entry) return
    granularity.value = entry.granularity
    applySelection(entry.nodeId)
  }

  function back(): void {
    if (!canGoBack.value) return
    historyIndex.value -= 1
    applyEntry(history.value[historyIndex.value])
  }

  function forward(): void {
    if (!canGoForward.value) return
    historyIndex.value += 1
    applyEntry(history.value[historyIndex.value])
  }

  /**
   * 粒度を切り替える（US-03）。
   *
   * 選択は**対応が一意に決まるときだけ引き継ぐ**（UT-05 決定事項）。
   * メソッド → ファイルは所属ファイルへ読み替え、ファイル → メソッドは
   * 対応先が一意にならないため外す。絞り込みは選択に従い、履歴は積まない。
   */
  function setGranularity(next: Granularity): void {
    if (next === granularity.value) return
    granularity.value = next

    if (selectedNodeId.value === undefined) return

    const current = selectedNode.value
    if (current === undefined) {
      // 引き当てられない選択は、そのままにしても表示できない。外して揃える
      applySelection(undefined)
      return
    }

    if (next === 'file' && current.kind === 'method') {
      const parent = viewModel.value?.fileOfMethod(current.id)
      applySelection(parent?.id)
      return
    }
    if (next === 'method' && current.kind === 'file') applySelection(undefined)
  }

  function setCanvasSize(width: number, height: number): void {
    canvasWidth.value = width
    canvasHeight.value = height
  }

  return {
    viewModel,
    status,
    warnings,
    errors,

    granularity,
    columnAxis,
    query,
    sidebarOpen,
    canvasWidth,
    canvasHeight,

    selectedNodeId,
    selectedNode,
    narrowedToSelection,
    history,
    historyIndex,
    canGoBack,
    canGoForward,

    select,
    clearSelection,
    back,
    forward,
    setGranularity,
    setCanvasSize,
  }
})

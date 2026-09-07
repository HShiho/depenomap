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
 *
 * **不変条件を持つ状態は、書き込みの口をアクションに限る。** 粒度と選択と
 * 履歴は互いに整合していなければならず（見えない粒度のノードが選ばれない、
 * 履歴はそのとき見ていた粒度ごと戻る）、生の `ref` として公開すると
 * アクションを通さない代入でその整合を破れる。読むだけの値として公開する。
 *
 * **不変条件を持つ値を getter で公開する代償として、Pinia の `$state` /
 * `$patch` / `$subscribe` はこの器の状態を映さない。** `$state` に残るのは
 * `columnAxis` / `query` / `sidebarOpen` だけで、選択や粒度の変化を
 * `$subscribe` で待つと**エラーにならず一度も呼ばれない**。変化を購読する側は
 * `watch(() => state.selectedNodeId, …)` を使う。
 *
 * **URL にも載せない**（UT-05 決定事項）。載せれば閲覧位置を共有できるが、
 * 正本 JSON は起動時にパスで指定するもの（ADR-004）であり、URL を渡した先が
 * 同じグラフを見ている保証がない。「どのグラフの、どこ」を URL で表すには
 * グラフの同一性を URL に含める必要があり、それは C-3 の揮発性の線引きを
 * 引き直す話になる。必要になった時点で別 ADR として起こす。
 */

import { defineStore } from 'pinia'
import { computed, readonly, ref, shallowRef } from 'vue'

import { useTheme } from '@/app/design/theme'
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
  readonly nodeId: string
  readonly granularity: Granularity
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

/**
 * 読み込みの結果。**状況と中身を 1 つの値で渡す**。
 *
 * 別々に書ける形にすると「`ready` なのにグラフが無い」「グラフを載せたのに
 * `loading` のまま」を作れてしまい、受け取る側が毎回両方を確かめることになる。
 */
export type LoadOutcome =
  | { kind: 'loading' }
  | { kind: 'ready'; viewModel: ViewModel; warnings: readonly LoadWarning[] }
  | { kind: 'unreachable'; message: string }
  | { kind: 'invalid'; errors: readonly LoadError[]; warnings: readonly LoadWarning[] }
  | { kind: 'broken'; message: string }

export const useViewState = defineStore('view-state', () => {
  /* --- グラフ ---------------------------------------------------------- */

  /**
   * 表示用中間表現（UT-02）。`shallowRef` にするのは、中身が読み取り専用の
   * 大きなグラフであり、深い監視に意味がないため。
   */
  const viewModel = shallowRef<ViewModel | undefined>(undefined)
  const status = ref<GraphStatus>({ kind: 'loading' })
  /**
   * 読み込みの警告。成功しても失敗しても同じ場所に出す。
   *
   * ただし `broken`（想定外の失敗）だけは載せない。応答の本文そのものが
   * 読み込み結果の形をしていない状況であり、そこから拾った警告も信用できない。
   */
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

  /*
   * テーマ（US-20）。**記憶と属性の操作は UT-04 が持つ**。ここは器として
   * 再公開するだけで、値を二重に持たない。器の一覧に無いと、レールなどの
   * 機能 UT が UT-04 を直接 import することになり、「状態の器だけで連携する」
   * という契約が崩れる。
   */
  const theme = useTheme()

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

  /**
   * 選択に絞るかを切り替える（US-14）。
   *
   * 選択が無ければ絞り込みは成立しないので、そのときは倒す。値を素で公開すると
   * 「何も選んでいないのに絞り込み ON」が作れ、描画側は選択とその隣接で絞って
   * 0 件になる。落とす側（`applySelection` / `applyLoadOutcome`）だけが守っていても、
   * 立てる側が開いていれば同じ状態に行き着く。
   */
  function setNarrowedToSelection(next: boolean): void {
    narrowedToSelection.value = next && selectedNodeId.value !== undefined
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

  /**
   * 読み込みの結果を反映する。**状況・グラフ・警告・理由を同時に決める**唯一の口。
   *
   * グラフから派生した状態（選択・履歴・絞り込み）も一緒に落とす。それらは
   * いま載っているグラフのノード ID を指しており、グラフだけを差し替えると
   * 「ID はあるのにノードが引けない」状態が残る。
   */
  function applyLoadOutcome(outcome: LoadOutcome): void {
    status.value =
      outcome.kind === 'ready' || outcome.kind === 'invalid'
        ? { kind: outcome.kind }
        : outcome.kind === 'loading'
          ? { kind: 'loading' }
          : { kind: outcome.kind, message: outcome.message }

    viewModel.value = outcome.kind === 'ready' ? outcome.viewModel : undefined
    warnings.value = 'warnings' in outcome ? outcome.warnings : []
    errors.value = outcome.kind === 'invalid' ? outcome.errors : []

    selectedNodeId.value = undefined
    narrowedToSelection.value = false
    history.value = []
    historyIndex.value = -1
  }

  function setCanvasSize(width: number, height: number): void {
    canvasWidth.value = width
    canvasHeight.value = height
  }

  return {
    // 読むだけ。入れ替えは applyLoadOutcome（4 つが同時に決まる）
    viewModel: computed(() => viewModel.value),
    status: computed(() => status.value),
    warnings: computed(() => warnings.value),
    errors: computed(() => errors.value),

    /*
     * どちらも読むだけの値なので getter に揃える。`theme.choice` をそのまま
     * 返すと readonly な ref が **state として登録され**、`$state` に
     * 「器が所有せず localStorage に永続する値」が 1 つだけ混ざる。
     * 書き込みも型では通り、実行時に黙って失敗する。
     */
    themeChoice: computed(() => theme.choice.value),
    themeResolved: computed(() => theme.resolved.value),
    selectTheme: theme.select,
    toggleTheme: theme.toggle,

    // 読むだけ。切り替えは setGranularity（選択の読み替えを伴う）
    granularity: computed(() => granularity.value),

    columnAxis,
    query,
    sidebarOpen,

    // 読むだけ。選択に従属するので setNarrowedToSelection が整合を見る
    narrowedToSelection: computed(() => narrowedToSelection.value),

    // 読むだけ。実寸は setCanvasSize が入れる
    canvasWidth: computed(() => canvasWidth.value),
    canvasHeight: computed(() => canvasHeight.value),

    // 読むだけ。移動は select / clearSelection / back / forward
    selectedNodeId: computed(() => selectedNodeId.value),
    selectedNode,
    /*
     * 配列も要素も読むだけにする。`as readonly` は配列操作しか止められず、
     * `history[0].nodeId = …` が型でも実行時でも通っていた
     */
    history: computed(() => readonly(history.value) as readonly HistoryEntry[]),
    historyIndex: computed(() => historyIndex.value),
    canGoBack,
    canGoForward,

    applyLoadOutcome,
    setNarrowedToSelection,
    select,
    clearSelection,
    back,
    forward,
    setGranularity,
    setCanvasSize,
  }
})

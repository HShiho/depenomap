<script setup lang="ts">
/**
 * ノードマップの描画（UT-06）。
 *
 * ファイルをノード、依存を矢印として描く（US-01）。矢印は「使う側 → 使われる側」。
 * **構成の良し悪しで表示を変えない**。層をまたぐ依存も同じ矢印で描く（N-1）。
 *
 * 配置（`layout.ts`）・経路（`edge-path.ts`）・座標変換（`viewport.ts`）は
 * それぞれ純粋関数に出してある。ここが持つのは、状態の器（UT-05）から
 * 読んだ値をそれらへ渡し、SVG を組み立てて、操作を器へ返すところだけ。
 */
import { computed, onUnmounted, ref, watch } from 'vue'

import type { GraphEdge, GraphNode } from '@/core/graph/schema'
import type { Granularity, ViewModel } from '@/core/ir/view-model'
import { useViewState, type ColumnAxis } from '../shell/view-state'
import { layerColours, layerLabels } from '../shell/layer-colour'
import { callOrder } from './call-order'
import { cycleMarkOf, isCycleEdge } from '../shell/cycle-mark'
import { nodeFlagOf } from '../shell/node-flag'
import { buildColumnPlan } from './column-axis'
import type { LegendLayer } from '@/app/legend/legend-items'
import { narrowedNodeIds } from './narrowing'
import { edgeMidpoint, edgePath } from './edge-path'
import { nameLimitFor, subtitleOf, titleOf, tooltipOf } from './node-label'
import { buildLayout, NODE_HEIGHT, NODE_WIDTH } from './layout'
import { centreOn, fitBounds, transformOf, type Viewport } from './viewport'
import { draggedTo, isDrag, type DragStart, type NodePositions } from './node-drag'
import { applyWheel } from './wheel-gesture'

const state = useViewState()

const viewport = ref<Viewport>({ x: 0, y: 0, scale: 1 })

/** 列の割り当て。軸ごとの規則は `column-axis.ts` が持つ */
const columnPlan = computed(() => {
  const viewModel = state.viewModel
  if (viewModel === undefined) return undefined

  const axis = state.columnAxis
  return buildColumnPlan({
    viewModel,
    granularity: state.granularity,
    axis,
    /*
     * 選択を読むのは**深度軸のときだけ**にする。起点が選択で変わるのは深度軸の
     * 規則（ADR-001）であって、層軸では結果が同じになる。
     *
     * ここで無条件に読むと、層軸でもノードを選ぶたびに `columnPlan` が作り
     * 直され、配置（交差削減 4 スイープ）と表示物（全ノードの依存のたどり）が
     * 連鎖して走る。同じ答えを出すためだけの計算で、`nodeVisuals` を
     * computed に畳んだ意味が消える。
     */
    selectedNodeId: axis === 'depth' ? state.selectedNodeId : undefined,
    // 絞り込み中は、深度軸の最後尾が「たどり着けない」ではなく依存元になる。
    // 判定は絞り込みそのもの（粒度のずれも見る）へ寄せる
    narrowed: axis === 'depth' && narrowed.value !== undefined,
  })
})

/** 層の色。列の軸に依らず、ノードの層で決まる */
const layerColour = computed(() =>
  state.viewModel === undefined ? () => 'var(--color-ink-3)' : layerColours(state.viewModel),
)

/**
 * 列の中の**初期の**並び。
 *
 * メソッド粒度では所属ファイル → ソース上の行で並べる。同じファイルの処理が
 * 近くから始まるほうが、読み始めの手がかりになる。ただし最終的な並びは
 * 交差削減（`layout.ts`）が決めるため、**隣接は保証しない**。
 *
 * 所属そのものはノードの 2 行目（所属ファイルのパス）で示す（US-02）。囲み枠で
 * 束ねると層の列と入れ子になり、線が読めなくなる。
 */
function defaultSortKeyOf(node: GraphNode): string {
  if (node.kind === 'file') return node.path
  const line = String(node.loc.line).padStart(6, '0')
  return `${node.parent}#${line}`
}

/**
 * 絞り込み中の列内の並び（UT-09 / US-05）。
 *
 * **ある対象の依存先**が呼び出し順に並ぶ。絞っていない図では「ある対象」が
 * 定まらないので、既定の並びのまま。順序の材料が無いとき（`applies` が偽）も
 * 既定の並びのままで、出現順を名乗らない（C-7）。
 */
const currentCallOrder = computed(() =>
  callOrder({
    viewModel: state.viewModel,
    granularity: state.granularity,
    selectedNodeId: state.selectedNodeId,
    narrowed: state.narrowedToSelection,
  }),
)

function sortKeyOf(node: GraphNode): string {
  return currentCallOrder.value.keyOf(node) ?? defaultSortKeyOf(node)
}

/**
 * 絞り込みで残るノード（UT-14 / US-12）。`undefined` は「絞っていない」。
 *
 * **絞り込みが立っているときだけ効く**。選択そのものは絞り込みを伴わない
 * （器が別々に持つ / UT-05）ので、全体の中で選んだノードの位置を見る経路が残る。
 */
const narrowed = computed(() =>
  !state.narrowedToSelection || state.viewModel === undefined
    ? undefined
    : narrowedNodeIds({
        nodes: state.viewModel.nodes[state.granularity],
        edges: state.viewModel.edges[state.granularity],
        selectedNodeId: state.selectedNodeId,
      }),
)

/** 描くノード。絞っていなければ全部 */
const shownNodes = computed(() => {
  const nodes = state.viewModel?.nodes[state.granularity] ?? []
  const kept = narrowed.value
  return kept === undefined ? nodes : nodes.filter((node) => kept.has(node.id))
})

/**
 * 描く線。絞り込み中は**選んだノードに繋がる線だけ**。
 *
 * 残った 2 つが互いに依存していても、選んだノードを介さない線は「このノードの
 * 周り」の話ではない。
 *
 * 配置（交差削減）にも同じ集合を渡す。描かない線で行の順を決めると、列の中の
 * 並びが画面に出ている線と対応しなくなる。
 */
const shownEdges = computed(() => {
  const edges = state.viewModel?.edges[state.granularity] ?? []
  if (narrowed.value === undefined) return edges

  const selected = state.selectedNodeId
  return edges.filter((edge) => edge.from === selected || edge.to === selected)
})

const layout = computed(() => {
  const viewModel = state.viewModel
  if (!viewModel) return buildLayout({ nodes: [], edges: [], columnOf: () => 0 })

  return buildLayout({
    nodes: shownNodes.value,
    edges: shownEdges.value,
    columnOf: (node) => columnPlan.value?.columnOf(node) ?? 0,
    sortKeyOf,
  })
})

/**
 * いま図に出ている層（UT-26）。凡例はこれを出す。
 *
 * **図に出ているものだけ**にする（UT-26 の決定）。絞り込み中や粒度を切り替えた
 * ときに、画面に無い層の色を並べても引き当てられない。
 *
 * 並びは正本 JSON の `layers` の順（ADR-002）。色と名前は層の見せ方を持つ
 * 場所（`layer-colour.ts`）から引く。
 */
/** いま図に描いているノードの数（UT-26 の断りが使う） */
const shownNodeCount = computed(() => shownNodes.value.length)

/**
 * いま図に描いている、インターフェース経由として解決した線の本数（UT-26）。
 *
 * 断りが「描いています」と言う以上、**グラフ全体ではなく描いている分**を渡す。
 * 絞り込み中（UT-14）は図に出ている線だけが対象になる。
 */
const shownViaCount = computed(
  () =>
    shownEdges.value.filter((edge) => 'resolution' in edge && edge.resolution === 'via-interface')
      .length,
)

const shownLayers = computed<LegendLayer[]>(() => {
  const viewModel = state.viewModel
  if (viewModel === undefined) return []

  const colourOf = layerColours(viewModel)
  const labelOf = layerLabels(viewModel)
  const present = new Set(shownNodes.value.map((node) => viewModel.layerOf(node.id).key))

  return viewModel.layerKeys
    .filter((key) => present.has(key))
    .map((key) => ({ key, name: labelOf(key), colour: colourOf(key) }))
})

/**
 * 手で動かした位置（UT-17 / US-17）。**既定の並びに対する差分**として持つ。
 *
 * ノード ID で持つので、粒度や列の軸を切り替えても残る（UT-17 の決定）。
 * 表示上のものであり、正本 JSON は書き換えない（C-3）。保存もしない。
 */
const movedPositions = ref<NodePositions>(new Map())

/** 既定の並びに、手で動かしたぶんを重ねた配置 */
const placedNodes = computed(() =>
  layout.value.nodes.map((placed) => {
    const moved = movedPositions.value.get(placed.node.id)
    return moved === undefined ? placed : { ...placed, x: moved.x, y: moved.y }
  }),
)

const positions = computed(
  () => new Map(placedNodes.value.map((placed) => [placed.node.id, placed])),
)

/**
 * エッジの見た目の区別（UT-07）。
 *
 * **依存の良し悪しではなく、依存の形を表す**（N-1）。層をまたぐかどうかで
 * 区別しない。
 *
 *   - `implements`: クラスとインターフェースの対応。破線
 *   - `via`: インターフェースを経由する呼び出し。アクセント色と中点の印
 *   - `plain`: それ以外
 *
 * `via-interface` の呼び出しは**型検査器の答え（インターフェース宛）に描く**。
 * 実装との対応は `implements` のエッジが別に持つため、図の上で両方たどれる。
 * この「`implements` が実装を覆っている」という前提は正本 JSON の保証ではない
 * ため、テストで固定している（覆われない実装があると、実装が図から消える）
 * （UT-07 決定事項。論理／実の切り替えは設けない — 切り替えると、見ているあいだ
 * もう一方が消える）。
 */
type EdgeVariant = 'plain' | 'implements' | 'via'

function variantOf(edge: GraphEdge): EdgeVariant {
  if (edge.kind === 'implements') return 'implements'
  if ('resolution' in edge && edge.resolution === 'via-interface') return 'via'
  return 'plain'
}

/**
 * 矢尻。**線と同じ色にする**（UT-04）。色の違う線に灰色の矢尻が付くと、
 * 線と矢尻が別のものに見える。
 */
function markerOf(edge: { variant: EdgeVariant; inCycle: boolean }): string {
  if (edge.inCycle) return 'url(#arrow-cyclic)'
  return edge.variant === 'via' ? 'url(#arrow-via)' : 'url(#arrow)'
}

const edges = computed(() => {
  const viewModel = state.viewModel
  return shownEdges.value.flatMap((edge) => {
    const from = positions.value.get(edge.from)
    const to = positions.value.get(edge.to)
    // 位置が引けないエッジは描かない。参照整合性は UT-01 が保証済みで、
    // ここに来るのは絞り込み（UT-14）で片側が消えている場合だけ
    if (!from || !to) return []

    const options = { selfLoop: edge.from === edge.to }
    const variant = variantOf(edge)
    return [
      {
        id: edge.id,
        variant,
        /*
         * 循環かどうかは**形の別（`variant`）とは別の軸**（UT-10）。同じ 1 本が
         * 経由の呼び出しでも実装の対応でもありうるので、置き換えずに重ねる
         */
        inCycle: viewModel === undefined ? false : isCycleEdge(viewModel, edge.id),
        d: edgePath(from, to, options),
        // 経由の印は曲線上に置く。端点の中間だと線から離れて浮く
        midpoint: variant === 'via' ? edgeMidpoint(from, to, options) : undefined,
      },
    ]
  })
})

/**
 * 列見出し。**中身は軸で変わる**ので、文言と色は `columnPlan.headOf` に委ねる
 * （層なら層の名前、深度なら深度）。ここが持つのは、置いた列の数だけ見出しを
 * 並べるところまで。
 *
 * **ノードが 1 件も無い列は出ない**（UT-06 決定事項）。列は「ノードの置き場」
 * であって分類の一覧ではなく、空の列を残すと絞り込み（UT-14）のたびに図が横へ
 * 間延びする。
 *
 * 層軸ではこれが、**定義だけあってノードが 0 件の層は画面から見えない**ことを
 * 意味する（層の名前は JSON の定義から取る / ADR-002）。引き受ける先は凡例
 * （参照仕様の `.legend`）だが、まだ実装されていない。載せるときは
 * `layerKeys`（空の層も残る）から作る。
 */
const columnHeads = computed(() => {
  const viewModel = state.viewModel
  if (!viewModel) return []

  const plan = columnPlan.value
  if (plan === undefined) return []

  return layout.value.columns.map((column) => ({
    // 層の名前は一意とは限らない（正本 JSON が保証しているのは id だけ）。
    // 差分更新のキーには、構造上一意な列番号を使う
    column: column.column,
    x: column.x,
    count: column.count,
    ...plan.headOf(column.column),
  }))
})

/**
 * 被依存数と依存数。**どちらもノード単位で数える**。
 *
 * `fanInOf` は同じ 2 ノード間に何本エッジがあっても 1 と数える（UT-02 決定事項）
 * のに対し、`dependenciesOf` はエッジ 1 本につき 1 件返す。そのまま並べると
 * 「使われている数」と「使っている数」で単位が違い、同じ図の中で数が噛み合わない。
 * 型の import と値の import が別エッジになる抽出結果では実際に起きる。
 */
function statsOf(node: GraphNode): string {
  const viewModel = state.viewModel
  if (!viewModel) return ''
  const fanIn = viewModel.fanInOf(node.id, state.granularity)
  const fanOut = new Set(
    viewModel.dependenciesOf(node.id, state.granularity).map((dependency) => dependency.node.id),
  ).size
  return `↙${fanIn} ↗${fanOut}`
}

/**
 * ノード 1 つぶんの表示物。**配置が変わったときだけ作り直す**。
 *
 * テンプレートから `statsOf` を直接呼ぶと、選択が変わるだけの再描画でも
 * 全ノードぶんの数え直し（依存のたどりと並べ替え）が走る。規模が大きい正本
 * JSON では、クリックのたびにその計算を払うことになる。
 */
const nodeVisuals = computed(() => {
  const visuals = new Map<
    string,
    {
      name: string
      path: string
      stat: string
      colour: string
      tooltip: string
      /** ノードに出す印（UT-10 の循環 / UT-19 の未追跡）。無ければ `undefined` */
      flag: string | undefined
      /** 循環に含まれるか。枠の描き分けに使う（印の文言とは別） */
      inCycle: boolean
    }
  >()
  const viewModel = state.viewModel
  if (!viewModel) return visuals

  for (const placed of placedNodes.value) {
    const node = placed.node
    // 印は見出しと同じ行の右端に出る。見出しの上限はその幅ぶん狭くなる
    const flag = nodeFlagOf(viewModel, node.id)
    visuals.set(node.id, {
      name: titleOf(node, nameLimitFor(flag)),
      path: subtitleOf(node, (id) => viewModel.fileOfMethod(id)?.path),
      tooltip: tooltipOf(node, (id) => viewModel.fileOfMethod(id)?.path),
      stat: statsOf(node),
      colour: layerColour.value(viewModel.layerOf(node.id).key),
      flag,
      inCycle: cycleMarkOf(viewModel, node.id) !== undefined,
    })
  }
  return visuals
})

/* --- 操作の口。後続 UT はここから受け取る ---------------------------- */

const emit = defineEmits<{
  /** ノードの右クリック（UT-18 が「VSCode で開く」を載せる） */
  nodeContextMenu: [node: GraphNode, event: MouseEvent]
}>()

/**
 * ノードのクリック（US-12）。**移動の経路（UT-14）を通す**。
 *
 * 選択だけを動かす経路をここに残すと、キャンバスから選んだときだけ絞り込みが
 * 立たない、という食い違いができる。
 */
function onNodeClick(node: GraphNode): void {
  // 動かして離したときの `click` は、選択ではない
  if (draggedJustNow) {
    draggedJustNow = false
    return
  }
  // 図の上で同じノードをもう一度押したときだけ、絞り込みを解く
  state.moveTo(node.id, { toggle: true })
}

/**
 * 背景のクリック（UT-14 の決定）。**何もしない**。
 *
 * 絞り込み中は背景の面積が大きく、図を眺めるつもりの空クリックで解けてしまう。
 * UT-16 でパンが載ると、背景のドラッグとクリックの区別も微妙になる。解く口は
 * 印の ✕・Esc・同じノードの再クリックの 3 つに絞る（参照仕様）。
 *
 * ハンドラ自体は残す。UT-16 がここでドラッグの開始を拾う。
 */
function onBackgroundClick(): void {}

/* --- ビューポート操作の口（UT-16 / UT-14 / UT-11 が使う） -------------- */

const view = computed(() => ({ width: state.canvasWidth, height: state.canvasHeight }))

/**
 * 図の外接矩形。
 *
 * **手で動かしたぶんも含める**（UT-17）。既定の並びの寸法だけで合わせると、
 * 外へ動かしたノードは「全体を表示」しても画面の外に残る。
 *
 * **左と上も見る。** 手で動かすと座標は負にもなり、大きさ（右下の端）だけを
 * 数えると左や上へ出たぶんが入らない。
 */
const contentBounds = computed(() => {
  const base = { minX: 0, minY: 0, maxX: layout.value.width, maxY: layout.value.height }
  if (movedPositions.value.size === 0) return base

  return placedNodes.value.reduce(
    (bounds, placed) => ({
      minX: Math.min(bounds.minX, placed.x),
      minY: Math.min(bounds.minY, placed.y),
      maxX: Math.max(bounds.maxX, placed.x + NODE_WIDTH),
      maxY: Math.max(bounds.maxY, placed.y + NODE_HEIGHT),
    }),
    base,
  )
})

function fitToContent(): void {
  viewport.value = fitBounds(contentBounds.value, view.value)
}

/**
 * ホイール／トラックパッド（UT-16 / US-16）。
 *
 * **既定の動きは止める。** 止めないと、⌘ + ホイールがブラウザ全体の拡大に、
 * 横方向のスクロールが「前のページへ戻る」に吸われる。図の上でだけ止めるので、
 * 一覧や概要の側のスクロールは残る。
 *
 * **止めるのはホイールだけ。** タッチの指の動きはこの UT の対象外（US-16 は
 * トラックパッド）で、受け取る先も無い。`touch-action` で殺すと、タッチ画面では
 * ブラウザ既定の拡大縮小まで失われて、図を大きくする手段が 1 つも無くなる。
 * タッチを受けるときは、受け取る側と一緒に止める。
 *
 * どの入力がどの動きになるかは `wheel-gesture.ts` が持つ。ここは位置を渡して
 * 結果を受け取るだけ。
 */
function onWheel(event: WheelEvent): void {
  event.preventDefault()
  const box = (event.currentTarget as Element).getBoundingClientRect()
  viewport.value = applyWheel(viewport.value, {
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    deltaMode: event.deltaMode,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    point: { x: event.clientX - box.left, y: event.clientY - box.top },
  })
}

/* --- ノードを手で動かす（UT-17 / US-17） ------------------------------ */

/**
 * 掴んでいるノード。離すまで持つ。
 *
 * **1 本の指（ポインタ）だけを見る。** 掴んだ `pointerId` 以外の動きで
 * 位置を書き換えると、2 本目の指やペンが動いただけでノードが飛ぶ。
 */
let dragging: (DragStart & { pointerId: number; moved: boolean }) | undefined
/**
 * 直前のジェスチャがドラッグだったか。
 *
 * 動かして離すと `click` も続けて飛ぶ。そのまま選択が動くと、**並べ替えた
 * だけで図が絞り込まれる**（UT-14）。次の押下まで握り潰す。
 *
 * **押した時点で倒す。** ドラッグを終えた場所がノードの上とは限らず
 * （印やツールバーの上、画面の外）、その場合 `click` は来ない。`click` が
 * 来るまで立てたままにすると、次の正当なクリックが 1 回効かなくなり、
 * 次の押下ではしきい値も素通りする。
 */
let draggedJustNow = false

function onNodePointerDown(node: GraphNode, event: PointerEvent): void {
  // 右ボタンは文脈メニュー（UT-18）が使う
  if (event.button !== 0) return
  const placed = positions.value.get(node.id)
  if (placed === undefined) return

  draggedJustNow = false
  dragging = {
    nodeId: node.id,
    pointerId: event.pointerId,
    moved: false,
    pointer: { x: event.clientX, y: event.clientY },
    origin: { x: placed.x, y: placed.y },
  }

  /*
   * 購読は窓に付ける。ノードの上だけで拾うと、速く動かしてポインタが
   * ノードから外れた瞬間に置き去りになる。
   *
   * **取り消しも拾う。** ブラウザがジェスチャを引き取ると `pointerup` は
   * 来ないので、離したあとも指の動きにノードが付いてくる
   */
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

function onPointerMove(event: PointerEvent): void {
  const start = dragging
  if (start === undefined || event.pointerId !== start.pointerId) return

  const pointer = { x: event.clientX, y: event.clientY }
  if (!start.moved && !isDrag(start.pointer, pointer)) return

  start.moved = true
  draggedJustNow = true
  const next = new Map(movedPositions.value)
  next.set(start.nodeId, draggedTo(start, pointer, viewport.value.scale))
  movedPositions.value = next
}

function onPointerUp(event?: PointerEvent): void {
  if (event !== undefined && dragging !== undefined && event.pointerId !== dragging.pointerId) {
    return
  }
  dragging = undefined
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
}

onUnmounted(() => onPointerUp())

/**
 * 手で動かしたノード。
 *
 * **数えるのは上書きそのもので、いま描いているノードではない。** 絞り込み
 * （UT-14）で隠れたり、粒度を切り替えて図から外れたりしても、上書きは残って
 * いる。描いているものだけを数えると、戻せるのに「戻すものは無い」と出る。
 *
 * 並びは図と同じ（上から下、左から右）。図に出ていないものは、そのあとへ
 * 正本 JSON の並びで続ける。
 */
const movedNodes = computed<readonly GraphNode[]>(() => {
  const viewModel = state.viewModel
  if (viewModel === undefined) return []

  const shown = placedNodes.value
    .map((placed) => placed.node)
    .filter((node) => movedPositions.value.has(node.id))
  const shownIds = new Set(shown.map((node) => node.id))
  /*
   * 図に出ていないぶんは、そのあとへ**粒度ごとに正本 JSON の並び**で続ける
   * （ファイル → メソッドの順）。上書きは動かした順に積まれるので、そのまま
   * 出すと一覧の並びが操作の履歴になる
   */
  const hidden = [...viewModel.nodes.file, ...viewModel.nodes.method].filter(
    (node) => movedPositions.value.has(node.id) && !shownIds.has(node.id),
  )

  return [...shown, ...hidden]
})

/** 図に出ていないノードの ID。印が行ごとに示す */
const movedOutOfView = computed(() => {
  const shown = new Set(placedNodes.value.map((placed) => placed.node.id))
  return movedNodes.value.map((node) => node.id).filter((id) => !shown.has(id))
})

/** 動かしたぶんを捨てる。ノードを指定すればそれだけ（UT-17 の決定） */
function resetPositions(nodeId?: string): void {
  if (nodeId === undefined) {
    movedPositions.value = new Map()
    return
  }
  const next = new Map(movedPositions.value)
  next.delete(nodeId)
  movedPositions.value = next
}

/*
 * 別のグラフを読んだら捨てる。ノード ID は JSON ごとの取り決めで、
 * 同じ ID が別のものを指しうる。粒度や軸の切り替えでは捨てない（UT-17 の決定）
 */
watch(
  () => state.viewModel,
  () => resetPositions(),
)

function focusNode(nodeId: string): void {
  const placed = positions.value.get(nodeId)
  if (placed) viewport.value = centreOn(viewport.value, placed, view.value)
}

defineExpose({
  viewport,
  fitToContent,
  focusNode,
  movedNodes,
  movedOutOfView,
  resetPositions,
  shownLayers,
  shownNodeCount,
  shownViaCount,
})

/**
 * 最後に全体表示を合わせた対象。**グラフ・粒度・並べ方の組につき 1 回だけ**
 * 合わせる。
 *
 * 粒度を切り替えると図の大きさが変わる（メソッド粒度はフィクスチャで縦に
 * 約 2.7 倍）。視点を据え置くと、切り替えた瞬間に下半分が画面の外へ出る。
 * 並べ方（UT-08）を切り替えたときも、列の数と各列の高さが変わる。
 * パンの手段が載るのは UT-16 なので、いまは戻す方法が無い。
 *
 * **深度軸で選択が変わったときは合わせ直さない。** 起点が変わるので図の形は
 * 変わるが、ここで全体表示に戻すと、選んだノードへ寄せる操作を常に上書きする。
 *
 * **寄せると全体表示の優先順位**（UT-07 から先送りしていた点）は、参照仕様に
 * 従って次のように決めた — **図が組み替わったら全体表示、組み替わっていなければ
 * そのノードへ寄せる**。絞り込みが立つと列が組み替わるので、残ったぶんを画面へ
 * 収め直すほうが先に要る。組み替わらない移動では、位置を保ったまま目的のノードへ
 * 寄せる。
 *
 * 寄せる側へ来るのは、**絞り込みを解いたまま履歴を行き来したとき**（UT-15）。
 * 記録も現在も「解いた状態」なら、選択が動いても図の形が変わらない。
 *
 * 画面の移動（`moveTo`）は選択を動かすとき必ず絞り込みを立てるので、そちらは
 * 組み替わる側へ行く。選択を外す押下だけは鍵が変わらないまま来るが、行き先が
 * 無いので下のガードで何もしない。
 * 規則を先に決めておくのは、そのとき両方の側が揃っている必要があるため。
 *
 * リサイズのたびに合わせ直すと、寄せた位置（`focusNode`）やこの先のパン・
 * ズーム（UT-16）が、ウィンドウの変形やサイドバーの開閉で毎回巻き戻る。
 * 一覧の開閉には 0.18 秒のアニメーションがあり、そのあいだ実寸が連続して
 * 変わるため、図が動き続けることになる。
 *
 * 「合わせたか」を真偽値で持ち、解除を別の `watch` に置くと、2 つの watch の
 * **登録順**が正しさの条件になる。合わせた対象そのものを覚えておけば、
 * 判定が 1 つの式で閉じる。
 */
/** 図の形を決めるもの。ここが変われば、図そのものが組み替わっている */
type FitKey = {
  viewModel: ViewModel | undefined
  granularity: Granularity
  axis: ColumnAxis
  /** 絞り込みの中心。絞っていなければ `undefined` */
  narrowedTo: string | undefined
}

let lastFitted: FitKey | undefined
/** 最後に寄せたノード。図が組み替わらない移動で使う */
let lastFocused: string | undefined

/*
 * 図が入れ替わったら全体表示に戻す。読み込み直後は「どこを見ているか」の
 * 前提が無く、前のグラフの位置を保っても意味を持たない。
 *
 * **キャンバスの実寸も一緒に見る。** グラフが実寸の観測より先に届くと、
 * そのときの画面は 0×0 で全体表示が成立せず、あとからサイズが入っても
 * 等倍・左上のまま固定されてしまう。両方が揃った最初の時点で合わせ、
 * 以降のリサイズでは動かさない。
 *
 * **一覧の開閉でも動かさない**（UT-16）。描く領域は実寸に追従する（`<svg>` の
 * 幅と高さがそのまま変わる）が、見ている位置はそのまま残す。合わせ直すと、
 * 寄って見ていたぶんが開閉のたびに失われる。開閉には 0.18 秒のアニメーションが
 * あり、そのあいだ実寸が連続して変わるので、追従させるほど図が揺れる。
 * 戻したいときはツールバーの全体表示で戻す。
 */
watch(
  () =>
    [
      state.viewModel,
      state.granularity,
      state.columnAxis,
      state.narrowedToSelection ? state.selectedNodeId : undefined,
      state.selectedNodeId,
      layout.value.width,
      layout.value.height,
      view.value.width,
      view.value.height,
    ] as const,
  ([
    viewModel,
    granularity,
    axis,
    narrowedTo,
    selectedNodeId,
    contentWidth,
    contentHeight,
    viewWidth,
    viewHeight,
  ]) => {
    const ready = contentWidth > 0 && contentHeight > 0 && viewWidth > 0 && viewHeight > 0
    if (!ready) return

    const fitted = lastFitted
    const sameFigure =
      fitted !== undefined &&
      fitted.viewModel === viewModel &&
      fitted.granularity === granularity &&
      fitted.axis === axis &&
      fitted.narrowedTo === narrowedTo

    if (!sameFigure) {
      lastFitted = { viewModel, granularity, axis, narrowedTo }
      lastFocused = selectedNodeId
      fitToContent()
      return
    }

    // 図が組み替わっていない移動は、位置を保ったまま目的のノードへ寄せる
    if (selectedNodeId !== undefined && selectedNodeId !== lastFocused) {
      lastFocused = selectedNodeId
      focusNode(selectedNodeId)
    }
  },
  { immediate: true },
)
</script>

<template>
  <!--
    実寸が観測できない環境（`ResizeObserver` が無い）では 0 になる。その場合は
    領域いっぱいに広げる。全体表示は効かないが、図そのものは見える
  -->
  <svg
    class="canvas"
    :width="state.canvasWidth || '100%'"
    :height="state.canvasHeight || '100%'"
    @click="onBackgroundClick"
    @wheel="onWheel"
  >
    <defs>
      <!-- 矢尻。線と同じ色トークンを使う（UT-04） -->
      <marker
        id="arrow"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M0,1 L10,5 L0,9 z" fill="var(--color-ink-3)" />
      </marker>

      <!-- 循環している依存。線と同じ色にする（UT-10） -->
      <marker
        id="arrow-cyclic"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M0,1 L10,5 L0,9 z" fill="var(--color-warn)" />
      </marker>

      <!-- 経由の呼び出し。線と同じ色にする -->
      <marker
        id="arrow-via"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M0,1 L10,5 L0,9 z" fill="var(--color-accent)" />
      </marker>
    </defs>

    <g :transform="transformOf(viewport)">
      <g
        v-for="head in columnHeads"
        :key="head.column"
        class="head-group"
        :transform="`translate(${head.x},0)`"
      >
        <rect y="30" width="3" height="14" rx="2" :fill="head.colour" />
        <text x="10" y="42" class="head">{{ head.label }}</text>
        <text x="10" y="56" class="head-count">{{ head.count }}</text>
      </g>

      <g class="edges">
        <template v-for="edge in edges" :key="edge.id">
          <path
            :data-edge-id="edge.id"
            :d="edge.d"
            class="edge"
            :class="[edge.variant, { cyclic: edge.inCycle }]"
            :marker-end="markerOf(edge)"
          />
          <!-- 経由であることの印。インターフェース宛であることを線の上で示す -->
          <!--
            半径は CSS のジオメトリプロパティでトークンから取る。属性側は、
            それに対応していないブラウザで印が消えないための控え
          -->
          <circle
            v-if="edge.midpoint"
            class="via-dot"
            :cx="edge.midpoint.x"
            :cy="edge.midpoint.y"
            r="3.4"
          />
        </template>
      </g>

      <g
        v-for="placed in placedNodes"
        :key="placed.node.id"
        :data-node-id="placed.node.id"
        class="node"
        :class="{
          selected: placed.node.id === state.selectedNodeId,
          'in-cycle': nodeVisuals.get(placed.node.id)?.inCycle === true,
        }"
        :style="{ '--lc': nodeVisuals.get(placed.node.id)?.colour }"
        :transform="`translate(${placed.x},${placed.y})`"
        @click.stop="onNodeClick(placed.node)"
        @pointerdown="onNodePointerDown(placed.node, $event)"
        @contextmenu="emit('nodeContextMenu', placed.node, $event)"
      >
        <!--
          参照仕様に無い追加。ノードのホバー表示を所有する UT は無く、mockup の
          `.tip` は概要シート（UT-13）にしか結ばれていない。素のツールチップは
          遅延して出るうえ抑止できないので、ノードにスタイル付きのホバーカードを
          載せる UT は、これを外すかそちらへ統合すること。
        -->
        <title>{{ nodeVisuals.get(placed.node.id)?.tooltip }}</title>
        <rect class="box" :width="NODE_WIDTH" :height="NODE_HEIGHT" rx="9" />
        <!-- 層の色帯。上下に余白を残した短い帯（参照仕様） -->
        <rect class="bar" x="1" y="9" width="3.5" :height="NODE_HEIGHT - 18" rx="2" />
        <text x="14" y="23" class="name">{{ nodeVisuals.get(placed.node.id)?.name }}</text>
        <text x="14" y="38" class="path">{{ nodeVisuals.get(placed.node.id)?.path }}</text>
        <text :x="NODE_WIDTH - 10" y="38" class="stat" text-anchor="end">
          {{ nodeVisuals.get(placed.node.id)?.stat }}
        </text>
        <!--
          循環の印（UT-10 / US-06）。**事実の提示であって判定ではない**（N-1）。
          名前と同じ行の右端に置く。下の行は被依存・依存の数が使っている
        -->
        <text
          v-if="nodeVisuals.get(placed.node.id)?.flag !== undefined"
          :x="NODE_WIDTH - 10"
          y="19"
          class="flag"
          text-anchor="end"
        >
          {{ nodeVisuals.get(placed.node.id)?.flag }}
        </text>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.canvas {
  display: block;
}

/* 列見出し */
.head {
  font-family: var(--font-sans);
  font-size: var(--text-label);
  fill: var(--color-ink-2);
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.head-count {
  font-family: var(--font-mono);
  font-size: var(--text-micro);
  fill: var(--color-ink-3);
}

/* エッジ。循環の描き分けは UT-10 が足す */
.edge {
  fill: none;
  stroke: var(--color-ink-3);
  stroke-width: var(--edge-stroke);
  opacity: var(--edge-opacity);
}

/* クラスとインターフェースの対応。線の形で区別し、色では区別しない（N-1） */
.edge.implements {
  stroke-width: var(--edge-stroke-implements);
  stroke-dasharray: var(--edge-dash-implements);
  opacity: var(--edge-opacity-implements);
}

/* インターフェースを経由する呼び出し */
.edge.via {
  stroke: var(--color-accent);
  stroke-width: var(--edge-stroke-via);
  opacity: var(--edge-opacity-via);
}

/*
 * 循環している依存（UT-10 / US-06）。
 *
 * **経由・実装の別より循環を優先する。** 循環は形の別とは違う軸で、両方に
 * 当たる線は循環のほうを出す。どの辺をたどると戻ってくるのかが図から
 * 読めなくなるため。
 *
 * 強弱は**詳細度で決める**。書いた順に頼ると、規則を並べ替えただけで
 * 見た目が静かに入れ替わる。
 */
.edge.cyclic,
.edge.via.cyclic,
.edge.implements.cyclic {
  stroke: var(--color-warn);
  stroke-width: var(--edge-stroke-cyclic);
  stroke-dasharray: var(--edge-dash-cyclic);
  opacity: 1;
}

.via-dot {
  fill: var(--color-surface);
  stroke: var(--color-accent);
  stroke-width: var(--via-dot-stroke);
  r: var(--via-dot-radius);
}

/* ノード。塗りは層の色を混ぜ、状態は枠線だけで表す（参照仕様） */
.node {
  cursor: pointer;
  /*
   * 文字の上から掴んでも、ブラウザの文字選択が走らないようにする（UT-17）。
   * 走ると、動かすあいだ図の広い範囲が反転する。
   *
   * **`preventDefault` では止めない。** それは文字選択だけでなく、押した
   * ところへ焦点を移す既定の動きまで止める。検索欄に焦点が残ったままになり、
   * そこで押した Esc は検索欄が先に食う（UT-14 の「どこを触っていても解ける」
   * が崩れる）
   */
  user-select: none;
}

.node .box {
  fill: color-mix(in srgb, var(--lc) var(--tint), var(--color-surface));
  stroke: color-mix(in srgb, var(--lc) 46%, var(--color-line));
  stroke-width: var(--node-stroke);
}

/*
 * 循環しているノード（UT-10 / US-06）。
 *
 * **選択のほうを強くする。** 選択は操作の状態で、いま何を選んでいるかが
 * 読めないと操作が続かない。破線は残るので、選択中でも循環だとは分かる。
 *
 * 強弱は**詳細度で決める**。書いた順に頼ると、規則を並べ替えただけで
 * 見た目が静かに入れ替わる。
 */
.node.in-cycle .box {
  stroke: var(--color-warn);
  stroke-width: var(--node-stroke-cyclic);
  stroke-dasharray: var(--node-dash-cyclic);
}

.node.selected .box,
.node.selected.in-cycle .box {
  stroke: var(--color-accent);
  stroke-width: var(--node-stroke-selected);
}

.node .flag {
  font-family: var(--font-sans);
  font-size: var(--text-flag);
  font-weight: var(--text-flag--font-weight);
  fill: var(--color-warn);
}

.node .bar {
  fill: var(--lc);
}

.node .name {
  font-family: var(--font-mono);
  font-size: var(--text-ui);
  font-weight: 600;
  fill: var(--color-ink);
}

.node .path {
  font-family: var(--font-mono);
  font-size: var(--text-caption);
  fill: var(--color-ink-3);
}

.node .stat {
  font-family: var(--font-mono);
  font-size: var(--text-micro);
  fill: var(--color-ink-3);
  font-variant-numeric: tabular-nums;
}
</style>

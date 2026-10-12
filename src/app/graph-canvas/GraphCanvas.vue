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
import { computed, nextTick, onUnmounted, ref, useId, useTemplateRef, watch } from 'vue'

import type { GraphEdge, GraphNode } from '@/core/graph/schema'
import type { Granularity, ViewModel } from '@/core/ir/view-model'
import { useViewState, type ColumnAxis, type ViaReading } from '../shell/view-state'
import { layerColours, layerLabels } from '../shell/layer-colour'
import { callOrder } from './call-order'
import { cycleMarkOf, isCycleEdge } from '../shell/cycle-mark'
import { nodeFlagOf } from '../shell/node-flag'
import { buildColumnPlan } from './column-axis'
import { FAN_IN_MARK, FAN_OUT_MARK, type LegendLayer } from '@/app/legend/legend-items'
import { compositionRootNodeIds } from './composition-root'
import { interfaceMethodIds } from './interface-fold'
import { narrowedNodeIds } from './narrowing'
import { readEdges } from './via-reading'
import { edgeMidpoint, edgePath } from './edge-path'
import { EMPHASIS_LEAVE_GRACE_MS, emphasisOf, type EmphasisTarget } from './emphasis'
import { focusAfterRebuild, gridPositions, NAV_KEYS, nextFocus, type NavKey } from './keyboard-nav'
import { nameLimitFor, subtitleOf, titleOf, tooltipOf } from './node-label'
import { buildLayout, NODE_HEIGHT, NODE_WIDTH } from './layout'
import {
  centreOn,
  fitBounds,
  reveal,
  transformOf,
  zoomAnchorOf,
  zoomAround,
  type Viewport,
} from './viewport'
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
    via: state.viaReading === 'implementation' ? 'actual' : 'logical',
  }),
)

function sortKeyOf(node: GraphNode): string {
  return currentCallOrder.value.keyOf(node) ?? defaultSortKeyOf(node)
}

/**
 * 読み替えたあとの線（UT-30）。**絞り込みも配置も、ここから先は同じ集合を見る。**
 *
 * 実装宛で読むと、経由の呼び出し 1 本が実装の数だけ分かれる。絞り込み（UT-14）が
 * 正本のエッジを見たままだと、**図に出ている線と隣の判定が食い違う**。
 *
 * 読み替え先が図にいるかは、その粒度のノードで判断する（絞り込みより前の段）。
 * 絞り込みの結果を待つと、絞り込み自身がこの集合を必要とするため循環する。
 */
const readableNodeIds = computed(
  () => new Set((state.viewModel?.nodes[state.granularity] ?? []).map((node) => node.id)),
)

const readEdgesAll = computed(() =>
  readEdges(state.viewModel?.edges[state.granularity] ?? [], state.viaReading, (id) =>
    readableNodeIds.value.has(id),
  ),
)

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
        edges: readEdgesAll.value,
        selectedNodeId: state.selectedNodeId,
      }),
)

/**
 * 畳むインターフェースのノード（UT-29）。畳んでいなければ空。
 *
 * **実装宛で読んでいるときだけ効く**（UT-30 の後段）。インターフェース宛では
 * 線が interface を通っているので、畳むと呼び出しの事実そのものが消える。
 *
 * メソッド粒度だけを対象にする。ファイル粒度の `import` は実際の依存である。
 * **この条件は結果を変えない**（対象はメソッド ID なので、ファイル粒度のノード
 * には 1 件も当たらない）。無駄に全メソッドを走査しないために早く返す。検査で
 * 固定できない条件なので、意図をここに書いておく。
 *
 * 畳まないものが 2 つある。
 *
 * 1. **呼び出しの線がまだ通っている interface。** 実装を 1 件も引けない経由は、
 *    実装宛で読んでも interface 宛のまま残る（IR の落とし先）。畳むと**その
 *    呼び出しごと図から消える**。消えてよいのは `implements` の線だけである
 * 2. **選択中のノード。** 一覧や検索からは畳んだノードも選べる。選んだものが
 *    図にいないと、絞り込んだ結果が空の図になり、何が起きたのか読めない
 */
const foldedNodeIds = computed<ReadonlySet<string>>(() => {
  const viewModel = state.viewModel
  if (
    viewModel === undefined ||
    !state.interfacesFolded ||
    state.granularity !== 'method' ||
    state.viaReading !== 'implementation'
  ) {
    return new Set()
  }

  const folded = new Set(interfaceMethodIds(viewModel))

  // 呼び出しの線が端点として使っているなら、畳まない（1）
  for (const read of readEdgesAll.value) {
    if (read.edge.kind !== 'call' && read.edge.kind !== 'construct') continue
    folded.delete(read.from)
    folded.delete(read.to)
  }

  // 選択中のノードは畳まない（2）
  if (state.selectedNodeId !== undefined) folded.delete(state.selectedNodeId)

  return folded
})

/**
 * 畳んで**実際に図から外した**ノードの数（UT-29 の断りが使う）。
 *
 * 正本の件数ではない。絞り込み中に正本の件数を出すと、もともと描かれない
 * interface まで「畳んでいます」と数えることになる（断りが言う対象と数を揃える）。
 */
const foldedCount = computed(() => {
  const kept = narrowed.value
  const folded = foldedNodeIds.value
  return (state.viewModel?.nodes[state.granularity] ?? []).filter(
    (node) => (kept === undefined || kept.has(node.id)) && folded.has(node.id),
  ).length
})

/**
 * 隠す合成ルートのノード（UT-31 / ADR-006）。隠していなければ空。
 *
 * **起動時に層が指定され、それがグラフに在り、隠す好みが立っているときだけ**
 * 効く。好みが立っていても、層が指定されていない・グラフに無いときは隠さない
 * （何を隠しているのか言えない）。
 *
 * 粒度を問わず効く。合成ルートはファイル粒度でも全層へ線を伸ばす。
 *
 * **選択中のノードは隠さない**（UT-29 と同じ）。一覧や検索からは隠した層の
 * ノードも選べる。選んだものが図にいないと、絞り込んだ結果が空の図になる。
 */
const compositionRootIds = computed<ReadonlySet<string>>(() => {
  const viewModel = state.viewModel
  const root = state.compositionRoot
  if (viewModel === undefined || !state.compositionRootHidden || root.kind !== 'present') {
    return new Set()
  }

  const hidden = new Set(compositionRootNodeIds(viewModel, state.granularity, root.layerId))
  if (state.selectedNodeId !== undefined) hidden.delete(state.selectedNodeId)
  return hidden
})

/** 図から外すノード。畳み（UT-29）と、合成ルートの非表示（UT-31） */
const removedNodeIds = computed<ReadonlySet<string>>(() => {
  const folded = foldedNodeIds.value
  const root = compositionRootIds.value
  if (root.size === 0) return folded
  if (folded.size === 0) return root
  return new Set([...folded, ...root])
})

/**
 * 隠して**実際に図から外した**合成ルートのノードの数（UT-31 の断りが使う）。
 * 数え方は畳みと同じ（絞り込みで元から描かれないものは数えない）。
 *
 * **畳み（UT-29）で先に外れたノードは数えない。** 線の本数も畳んだ端点を除いて
 * 数えている。揃えないと、同じノードを両方の断りが数える。
 */
const compositionRootHiddenCount = computed(() => {
  const kept = narrowed.value
  const hidden = compositionRootIds.value
  const folded = foldedNodeIds.value
  return (state.viewModel?.nodes[state.granularity] ?? []).filter(
    (node) =>
      (kept === undefined || kept.has(node.id)) && hidden.has(node.id) && !folded.has(node.id),
  ).length
})

/** 描くノード。絞っていなければ全部 */
const shownNodes = computed(() => {
  const nodes = state.viewModel?.nodes[state.granularity] ?? []
  const kept = narrowed.value
  const removed = removedNodeIds.value
  return nodes.filter((node) => (kept === undefined || kept.has(node.id)) && !removed.has(node.id))
})

/**
 * 絞り込みだけを効かせた線。絞り込み中は**選んだノードに繋がる線だけ**。
 *
 * 残った 2 つが互いに依存していても、選んだノードを介さない線は「このノードの
 * 周り」の話ではない。
 */
const narrowedEdges = computed(() => {
  if (narrowed.value === undefined) return readEdgesAll.value

  const selected = state.selectedNodeId
  return readEdgesAll.value.filter((edge) => edge.from === selected || edge.to === selected)
})

/**
 * 描く線。図から外したノードに繋がる線は描けない（行き先が図にいない）。
 *
 * 畳み（UT-29）では、呼び出しは実装宛へ読み替えてあるので消えないが、
 * `implements` は行き先ごと畳まれるため消える。合成ルートの非表示（UT-31）では、
 * 合成ルートに出入りする線がすべて消える。どちらも断りで伝える。
 *
 * 配置（交差削減）にも同じ集合を渡す。描かない線で行の順を決めると、列の中の
 * 並びが画面に出ている線と対応しなくなる。
 */
const shownEdges = computed(() => {
  const removed = removedNodeIds.value
  return narrowedEdges.value.filter((read) => !removed.has(read.from) && !removed.has(read.to))
})

/**
 * 合成ルートを隠したために描かなくなった線の本数（UT-31 の断りが使う）。
 *
 * **隠していなければ描いていた線だけを数える**（絞り込み・畳みで元から描かない
 * 線は数えない）。ファイル粒度では、合成ルートを経由していた `import` も入る。
 */
const compositionRootHiddenEdgeCount = computed(() => {
  const root = compositionRootIds.value
  if (root.size === 0) return 0
  const folded = foldedNodeIds.value
  return narrowedEdges.value.filter(
    (read) =>
      !folded.has(read.from) && !folded.has(read.to) && (root.has(read.from) || root.has(read.to)),
  ).length
})

/** 実装宛へ読み替えて描いている線の数（UT-30 の断りが使う） */
const retargetedCount = computed(() => shownEdges.value.filter((edge) => edge.retargeted).length)

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
    // **正本のエッジで数える。** 実装宛では 1 本の呼び出しが実装の数だけ分かれる
    new Set(
      shownEdges.value
        .filter((read) => 'resolution' in read.edge && read.edge.resolution === 'via-interface')
        .map((read) => read.sourceId),
    ).size,
)

/**
 * いま図に出ている層（UT-26）。凡例はこれを出す。
 *
 * **図に出ているものだけ**にする（UT-26 の決定）。絞り込み中や粒度を切り替えた
 * ときに、画面に無い層の色を並べても引き当てられない。
 *
 * 並びは正本 JSON の `layers` の順（ADR-002）。色と名前は層の見せ方を持つ
 * 場所（`layer-colour.ts`）から引く。
 */
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
  return shownEdges.value.flatMap((read) => {
    const edge = read.edge
    const from = positions.value.get(read.from)
    const to = positions.value.get(read.to)
    // 位置が引けないエッジは描かない。参照整合性は UT-01 が保証済みで、
    // ここに来るのは絞り込み（UT-14）で片側が消えている場合だけ
    if (!from || !to) return []

    const options = { selfLoop: read.from === read.to }
    const variant = variantOf(edge)
    return [
      {
        // 描く線ごとに固有（実装宛では 1 本の呼び出しが実装の数だけ分かれる）
        id: read.id,
        // 両端は描いている向き（読み替えたあと）。関係の強調（UT-25）が使う
        from: read.from,
        to: read.to,
        variant,
        /*
         * 循環かどうかは**形の別（`variant`）とは別の軸**（UT-10）。同じ 1 本が
         * 経由の呼び出しでも実装の対応でもありうるので、置き換えずに重ねる
         */
        /*
         * 循環の印（UT-10）は**正本の経路にだけ**付ける。
         *
         * 正本の `cycles` はインターフェース宛の経路で閉じた循環であり、
         * 実装宛へ読み替えた線はその経路ではない。読み替えた線に付けると、
         * **循環の印を持たないノードへ向かう線が循環色で描かれる**。逆に、
         * 読み替えた結果できる循環には印が付かない（正本が言っていない）。
         */
        inCycle:
          viewModel === undefined || read.retargeted
            ? false
            : isCycleEdge(viewModel, read.sourceId),
        d: edgePath(from, to, options),
        // 経由の印は曲線上に置く。端点の中間だと線から離れて浮く
        midpoint: variant === 'via' ? edgeMidpoint(from, to, options) : undefined,
      },
    ]
  })
})

/**
 * カーソルを合わせているもの（UT-25）。外れれば `undefined`。
 *
 * 選択（UT-14）とは別に持つ。こちらは触れているあいだだけの見分けで、図を
 * 絞らず、履歴にも積まない。
 */
const hovered = ref<EmphasisTarget | undefined>()

/**
 * 浮かぶノードと線。**図に描いているものだけ**から引く。
 *
 * 絞り込み（UT-14）や畳み（UT-29）で消えたものは、ここに渡らないので戻って
 * こない。「薄い」はカーソルが触れているあいだだけの状態で、「消えた」は図を
 * 絞った結果である。前者は外せば必ず戻る。
 */
const emphasis = computed(() =>
  emphasisOf(hovered.value ?? keyboardFocusTarget.value, {
    nodeIds: new Set(positions.value.keys()),
    edges: edges.value,
  }),
)

/**
 * キーボードで焦点を当てているノード（UT-21 / UT-25 からの申し送り）。
 * ホバーと同じく関係を浮かび上がらせる。**カーソルを合わせているあいだはそちらを
 * 優先する**（いま触っているものを出す）。
 *
 * **ポインタで押して焦点が入っただけなら浮かべない。** ノードは押すと焦点を受け取る
 * ので、そのまま浮かべるとカーソルを外しても強調が残り、外せば戻るホバーの見え方が
 * 崩れる。最後の入力がキーボードのときだけ数える
 */
const keyboardModality = ref(false)
const domFocusedNodeId = ref<string | undefined>()
const keyboardFocusTarget = computed<EmphasisTarget | undefined>(() =>
  keyboardModality.value && domFocusedNodeId.value !== undefined
    ? { kind: 'node', id: domFocusedNodeId.value }
    : undefined,
)

/**
 * **焦点を動かすキー（Tab・矢印・Home・End）だけ**をキーボードでの操作とみなす。
 * 修飾キーだけ（Shift + ホイールの横移動、⌘ + ホイールの拡大縮小）や Esc で
 * 数えると、押したノードに焦点が残ったまま図を動かしただけで関係が浮かぶ
 */
function onAnyKeydown(event: KeyboardEvent): void {
  if (event.key === 'Tab' || isNavKey(event.key)) keyboardModality.value = true
}

function onAnyPointerdown(): void {
  keyboardModality.value = false
}

// 捕捉段で受ける。ノードの側が先に止めても、入力の種類は覚える
window.addEventListener('keydown', onAnyKeydown, true)
window.addEventListener('pointerdown', onAnyPointerdown, true)
onUnmounted(() => {
  window.removeEventListener('keydown', onAnyKeydown, true)
  window.removeEventListener('pointerdown', onAnyPointerdown, true)
})

/*
 * 合わせたまま図が組み替わり、合わせた先が消えたら、合わせていたことも忘れる。
 * 要素ごと消えると `pointerleave` は来ない。覚えたままにすると、あとで同じ
 * ノードが図に戻ったとき、カーソルがどこにあっても強調が復活する。
 */
watch(emphasis, (current) => {
  if (current !== undefined) return
  cancelLeave()
  hovered.value = undefined
})

/** 外れたあと、強調を解くまでの待ち（`EMPHASIS_LEAVE_GRACE_MS`） */
let leaveTimer: ReturnType<typeof setTimeout> | undefined

function cancelLeave(): void {
  if (leaveTimer === undefined) return
  clearTimeout(leaveTimer)
  leaveTimer = undefined
}

/**
 * ノードを掴んでいるあいだ（UT-17）は、強調を**掴んだノードに留める**。
 *
 * 運んでいる先に描かれたノードがカーソルを受けるので、そのまま従うと、運んで
 * いるノード自身が退いたり、ノードから外れた瞬間に強調が消えたりする。
 *
 * ただし**カーソルの出入りは捨てずに覚えておく**（`underPointer`）。離した
 * ときにそれを反映しないと、別のものの上で離した場合にその enter が失われ、
 * 何も無いところへ外しても掴んでいたノードの強調が残り続ける。
 */
function isDraggingNode(): boolean {
  return dragging !== undefined
}

/** いまカーソルの下にあるもの。掴んでいるあいだも更新する */
let underPointer: EmphasisTarget | undefined

function isSameTarget(a: EmphasisTarget | undefined, b: EmphasisTarget): boolean {
  return a?.kind === b.kind && a.id === b.id
}

/** 離したとき、運んでいるあいだのカーソルの出入りを反映する */
function syncHoverAfterDrag(): void {
  if (underPointer !== undefined) {
    onHoverEnter(underPointer)
    return
  }
  if (hovered.value !== undefined) onHoverLeave(hovered.value)
}

function onHoverEnter(target: EmphasisTarget): void {
  underPointer = target
  if (isDraggingNode()) return
  // 前の外れの待ちが、あとから新しい強調を消さないように
  cancelLeave()
  hovered.value = target
}

/**
 * 外れても**すぐには解かない**。隙間を横切るたびに全部戻すと、図全体が明滅する。
 * 猶予のうちに次へ入れば、そのまま切り替わる。
 */
function onHoverLeave(target: EmphasisTarget): void {
  // 隣へ移ったとき、新しい側の enter が先に来ることがある。自分の分だけ外す
  if (isSameTarget(underPointer, target)) underPointer = undefined
  if (isDraggingNode()) return
  if (!isSameTarget(hovered.value, target)) return

  cancelLeave()
  leaveTimer = setTimeout(() => {
    leaveTimer = undefined
    hovered.value = undefined
  }, EMPHASIS_LEAVE_GRACE_MS)
}

onUnmounted(cancelLeave)

/**
 * ノードの強調の状態。強調していなければ空。
 *
 * **選択中のノードは退かせない。** 選択は操作の状態で、触れているあいだだけの
 * 見分けで上書きしない。退かせると、図を眺めるあいだ何を選んでいるかを見失う。
 */
function nodeEmphasisOf(nodeId: string): { dimmed?: boolean; related?: boolean } {
  const current = emphasis.value
  if (current === undefined) return {}
  if (!current.nodes.has(nodeId)) return nodeId === state.selectedNodeId ? {} : { dimmed: true }
  const isTarget = current.target.kind === 'node' && current.target.id === nodeId
  return { related: !isTarget }
}

/** 線の強調の状態。強調していなければ空 */
function edgeEmphasisOf(edgeId: string): { dimmed?: boolean; emphasized?: boolean } {
  const current = emphasis.value
  if (current === undefined) return {}
  return current.edges.has(edgeId) ? { emphasized: true } : { dimmed: true }
}

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
function countsOf(node: GraphNode): { fanIn: number; fanOut: number } {
  const viewModel = state.viewModel
  if (!viewModel) return { fanIn: 0, fanOut: 0 }
  const fanIn = viewModel.fanInOf(node.id, state.granularity)
  const fanOut = new Set(
    viewModel.dependenciesOf(node.id, state.granularity).map((dependency) => dependency.node.id),
  ).size
  return { fanIn, fanOut }
}

/**
 * ノード 1 つぶんの表示物。**配置が変わったときだけ作り直す**。
 *
 * テンプレートから `countsOf` を直接呼ぶと、選択が変わるだけの再描画でも
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
      /**
       * 読み上げる名前（UT-21）。名前・パス・層・数・印・図の上の位置。
       * 見出しは切り詰めてあるので、全文（ツールチップと同じ）を読む
       */
      label: string
    }
  >()
  const viewModel = state.viewModel
  if (!viewModel) return visuals

  const labelOf = layerLabels(viewModel)
  const grid = gridPositions(navNodes.value)
  for (const placed of placedNodes.value) {
    const node = placed.node
    // 印は見出しと同じ行の右端に出る。見出しの上限はその幅ぶん狭くなる
    const flag = nodeFlagOf(viewModel, node.id)
    const tooltip = tooltipOf(node, (id) => viewModel.fileOfMethod(id)?.path)
    const { fanIn, fanOut } = countsOf(node)
    const at = grid.get(node.id)
    visuals.set(node.id, {
      name: titleOf(node, nameLimitFor(flag)),
      path: subtitleOf(node, (id) => viewModel.fileOfMethod(id)?.path),
      tooltip,
      stat: `${FAN_IN_MARK}${fanIn} ${FAN_OUT_MARK}${fanOut}`,
      colour: layerColour.value(viewModel.layerOf(node.id).key),
      flag,
      inCycle: cycleMarkOf(viewModel, node.id) !== undefined,
      label: [
        tooltip.replace(/\n/g, '、'),
        `層 ${labelOf(viewModel.layerOf(node.id).key)}`,
        `被依存 ${fanIn}・依存 ${fanOut}`,
        ...(flag === undefined ? [] : [flag]),
        ...(at === undefined ? [] : [`${at.column} 列目の ${at.row} 番目（${at.rows} 件中）`]),
      ].join('、'),
    })
  }
  return visuals
})

/* --- キーボードの焦点（UT-21 / QR-2） ------------------------------------ */

/**
 * 移動の計算に渡す、配置済みのノード。縦の位置は手で動かしたあと（見えている
 * 並びと、矢印で動く順を揃える）
 */
const navNodes = computed(() =>
  placedNodes.value.map((placed) => ({
    id: placed.node.id,
    column: placed.column,
    y: placed.y,
  })),
)

/**
 * 焦点の基点（ローヴィング tabindex）。図の中の tab 停止はこのノード 1 つだけで、
 * 矢印キーで基点を移す。ノードを全部停止にすると、Tab がノード数ぶん止まる。
 *
 * 覚えているのは最後に焦点を当てたノード。図が組み換わってそれが消えたときは、
 * 選択中のノード、それも無ければ先頭を基点にする（UT-21 の決定）
 */
const focusedNodeId = ref<string | undefined>()
const rovingId = computed(() =>
  focusAfterRebuild(navNodes.value, focusedNodeId.value, state.selectedNodeId),
)

const svg = useTemplateRef<SVGSVGElement>('svg')
const descriptionId = useId()

/**
 * 焦点の持ち主が図か。組み換えで焦点が宙に浮いたとき、図へ戻すかを決める。
 *
 * **ノードの focusout では決めない。** 焦点を持つノードが DOM の中で動くと
 * （組み換えで並びが変わる）、Chrome は焦点を外し、移り先の無い focusout を出す。
 * ノードが消えたときも、焦点を受け取らない場所を押したときも、同じ形で来るので
 * 見分けられない。そこで、**文書のどこに焦点が入ったか**と、**図の外で押したか**
 * で決める
 */
let graphOwnsFocus = false

/** 文書のどこかに焦点が入った。図の中なら持ち主は図、外なら外 */
function onDocumentFocusIn(event: FocusEvent): void {
  const target = event.target
  graphOwnsFocus = target instanceof Node && svg.value?.contains(target) === true
}

/**
 * 図の外で押した。焦点を受け取らない場所（余白など）を押すと focusin が来ない
 * ので、ここで持ち主を外す。Safari はボタンを押しても焦点を移さない
 */
function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node && svg.value?.contains(target) === true)) graphOwnsFocus = false
}

document.addEventListener('focusin', onDocumentFocusIn, true)
document.addEventListener('pointerdown', onDocumentPointerDown, true)
onUnmounted(() => {
  document.removeEventListener('focusin', onDocumentFocusIn, true)
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})

function nodeElementOf(id: string): SVGGElement | undefined {
  for (const element of svg.value?.querySelectorAll<SVGGElement>('g.node') ?? []) {
    if (element.getAttribute('data-node-id') === id) return element
  }
  return undefined
}

/**
 * そのノードへ焦点を移す。画面の外にあれば見える位置に入れる（見えていれば
 * 視点は動かさない）
 */
async function moveFocusTo(id: string): Promise<void> {
  focusedNodeId.value = id
  await nextTick()
  nodeElementOf(id)?.focus()
  const placed = positions.value.get(id)
  if (placed !== undefined) viewport.value = reveal(viewport.value, placed, view.value)
}

function isNavKey(key: string): key is NavKey {
  return (NAV_KEYS as readonly string[]).includes(key)
}

/**
 * ノードの上でのキー操作。
 *
 *   - 矢印・Home・End: 焦点を動かす。ページのスクロールは止める
 *   - Enter・Space: 選ぶ。クリックと同じ移動の経路（UT-14）を通す
 *   - Shift+F10・メニューキー: そのノードの右クリックメニュー（UT-18）を開く。
 *     位置はノードの左下（ノード自身をメニューで隠さない）。ブラウザ既定の
 *     メニューは止める
 */
function onNodeKeydown(node: GraphNode, event: KeyboardEvent): void {
  if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
    event.preventDefault()
    const box = (event.currentTarget as Element).getBoundingClientRect()
    emit(
      'nodeContextMenu',
      node,
      new MouseEvent('contextmenu', { clientX: box.left, clientY: box.bottom, cancelable: true }),
    )
    return
  }
  if (isNavKey(event.key)) {
    event.preventDefault()
    const next = nextFocus(navNodes.value, node.id, event.key)
    if (next !== undefined) void moveFocusTo(next)
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    state.moveTo(node.id, { toggle: true })
  }
}

function onNodeFocus(node: GraphNode): void {
  focusedNodeId.value = node.id
  domFocusedNodeId.value = node.id
}

/** 焦点の枠とノードの縁の間（図の座標の px）。選択の枠と重ならないように離す */
const FOCUS_RING_GAP = 4

function onNodeBlur(node: GraphNode): void {
  if (domFocusedNodeId.value === node.id) domFocusedNodeId.value = undefined
}

/*
 * 図が組み換わったら（基点が変わらなくても）、焦点が宙に浮いていて持ち主が図なら、
 * 基点のノードへ戻す。
 *
 *   - 焦点のノードが消えた → 行き先（選択中 / 先頭）へ
 *   - 焦点のノードが残ったが、並び替えで焦点が外れた（Chrome） → 同じノードへ
 *
 * 焦点が図の外にある（持ち主が外 / 何かの要素に焦点がある）ときは何もしない。
 * 他の場所の操作から焦点を奪わない
 */
watch(
  [rovingId, navNodes],
  ([id]) => {
    if (id === undefined || !graphOwnsFocus) return
    const active = document.activeElement
    if (active !== null && active !== document.body) return
    nodeElementOf(id)?.focus()
  },
  { flush: 'post' },
)

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
  const wasDragging = dragging !== undefined
  stopDragging()
  // 運んでいるあいだ留めていた強調を、いまカーソルの下にあるものへ合わせ直す（UT-25）
  if (wasDragging) syncHoverAfterDrag()
}

function stopDragging(): void {
  dragging = undefined
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
}

/*
 * 破棄するときは購読を外すだけ。強調を合わせ直すと、解除の待ちが破棄のあとに
 * 残る（待ちを取り消す処理は先に走り終えている）
 */
onUnmounted(stopDragging)

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

/**
 * 図へ焦点を移す（UT-21）。焦点の基点のノードへ入る。レールの「図へ」の口が使う。
 *
 * 文書の順では一覧（ファイルの行）が図より前にあり、Tab で図へ入るには一覧の行を
 * すべて通ることになる（テストデータで 66 回）。その近道
 */
function focusGraph(): void {
  const id = rovingId.value
  if (id !== undefined) void moveFocusTo(id)
}

/**
 * ボタンで拡大縮小する（UT-28 / M-11）。画面の中心を軸にする。倍率の上下限は
 * UT-16 のまま
 */
function zoomBy(factor: number): void {
  viewport.value = zoomAround(
    viewport.value,
    zoomAnchorOf(view.value),
    viewport.value.scale * factor,
  )
}

defineExpose({
  viewport,
  fitToContent,
  focusNode,
  focusGraph,
  zoomBy,
  movedNodes,
  movedOutOfView,
  resetPositions,
  shownLayers,
  shownNodeCount,
  shownViaCount,
  retargetedCount,
  foldedCount,
  compositionRootHiddenCount,
  compositionRootHiddenEdgeCount,
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
  /**
   * 経由の読み方（UT-30）と、畳んでいる件数（UT-29）。
   *
   * どちらも**描くものの数と列の高さを変える**。入れないと、切り替えても
   * 前の視点のまま残り、残ったノードだけが手元でずれる。
   */
  reading: ViaReading
  folded: number
  /** 隠している合成ルートの件数（UT-31）。畳みと同じく列の高さと数を変える */
  hidden: number
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
      state.viaReading,
      foldedCount.value,
      compositionRootHiddenCount.value,
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
    reading,
    folded,
    hidden,
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
      fitted.narrowedTo === narrowedTo &&
      fitted.reading === reading &&
      fitted.folded === folded &&
      fitted.hidden === hidden

    if (!sameFigure) {
      lastFitted = { viewModel, granularity, axis, narrowedTo, reading, folded, hidden }
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
  <!--
    図は名前を持つ群（UT-21）。図そのものは tab 停止にしない — 入ってから
    ノードへもう一度 Tab することになる。停止はノードの 1 つだけ（ローヴィング）
  -->
  <svg
    ref="svg"
    class="canvas"
    :width="state.canvasWidth || '100%'"
    :height="state.canvasHeight || '100%'"
    role="group"
    aria-label="ノードマップ"
    :aria-describedby="descriptionId"
    @click="onBackgroundClick"
    @wheel="onWheel"
  >
    <!-- 操作の案内。読み上げで図に入ったときに添える -->
    <desc :id="descriptionId">
      矢印キーでノードを移動、Enter で選択、Shift+F10 でメニューを開く
    </desc>

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
            :class="[edge.variant, { cyclic: edge.inCycle }, edgeEmphasisOf(edge.id)]"
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
            :class="edgeEmphasisOf(edge.id)"
            :cx="edge.midpoint.x"
            :cy="edge.midpoint.y"
            r="3.4"
          />
          <!--
            線の当たり判定（UT-25）。描いた線は細く、そのままでは合わせられない。
            透明な太い線を重ねる。ノードより下に置くので、ノードの操作は奪わない。
            `data-edge-id` は付けない（描いた線を数える側が、これを数えないように）
          -->
          <path
            :data-hit-edge-id="edge.id"
            :d="edge.d"
            class="edge-hit"
            @pointerenter="onHoverEnter({ kind: 'edge', id: edge.id })"
            @pointerleave="onHoverLeave({ kind: 'edge', id: edge.id })"
          />
        </template>
      </g>

      <g
        v-for="placed in placedNodes"
        :key="placed.node.id"
        :data-node-id="placed.node.id"
        class="node"
        :class="[
          {
            selected: placed.node.id === state.selectedNodeId,
            'in-cycle': nodeVisuals.get(placed.node.id)?.inCycle === true,
          },
          nodeEmphasisOf(placed.node.id),
        ]"
        :style="{ '--lc': nodeVisuals.get(placed.node.id)?.colour }"
        :transform="`translate(${placed.x},${placed.y})`"
        role="button"
        :tabindex="placed.node.id === rovingId ? 0 : -1"
        :aria-label="nodeVisuals.get(placed.node.id)?.label"
        :aria-pressed="placed.node.id === state.selectedNodeId"
        @click.stop="onNodeClick(placed.node)"
        @keydown="onNodeKeydown(placed.node, $event)"
        @focus="onNodeFocus(placed.node)"
        @blur="onNodeBlur(placed.node)"
        @pointerdown="onNodePointerDown(placed.node, $event)"
        @contextmenu="emit('nodeContextMenu', placed.node, $event)"
        @pointerenter="onHoverEnter({ kind: 'node', id: placed.node.id })"
        @pointerleave="onHoverLeave({ kind: 'node', id: placed.node.id })"
      >
        <!--
          ノードの説明は素のツールチップのまま（UT-25 の決定）。UT-25 は関係の
          強調だけを足し、説明カード（参照仕様の `nodeTip`）は作らなかった。
          被依存数・依存数はノードの中に既に出ており、カードにすると重なる。
          選んだノードの詳細を 1 か所に集める話（UT-27）でまとめて判断する。
          スタイル付きのカードを載せる UT は、これを外すかそちらへ統合すること
          （素のツールチップは遅延して出るうえ抑止できない）。
        -->
        <title>{{ nodeVisuals.get(placed.node.id)?.tooltip }}</title>
        <!--
          キーボードの焦点の枠（UT-21）。ノードの外側に離して描き、選択の枠（ノードの
          縁そのもの）とは別に読めるようにする。キーボードで当てたときだけ見える
        -->
        <rect
          class="focus-ring"
          :x="-FOCUS_RING_GAP"
          :y="-FOCUS_RING_GAP"
          :width="NODE_WIDTH + FOCUS_RING_GAP * 2"
          :height="NODE_HEIGHT + FOCUS_RING_GAP * 2"
          rx="12"
        />
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

/*
 * カーソルを合わせたものの関係（UT-25）。
 *
 * **形の別（経由・実装・循環）は変えない。** 色と破線は残し、太さと濃さだけを
 * 動かす。浮かんだ線が循環なのか経由なのかは、強調中も読めるようにする。
 *
 * 形の別の規則は詳細度が最大 (0,3,0) なので、それより強い組み合わせを並べる。
 * 書いた順に頼ると、規則を並べ替えただけで見た目が静かに入れ替わる。
 */
.edge.emphasized,
.edge.emphasized.via,
.edge.emphasized.implements,
.edge.emphasized.cyclic,
.edge.emphasized.via.cyclic,
.edge.emphasized.implements.cyclic {
  stroke-width: var(--edge-stroke-emphasis);
  opacity: 1;
}

/*
 * 濃さの切り替えは短くフェードさせる。動かすたびに図の広い範囲の濃さが
 * 変わるので、段差のままだと明滅に見える。動きを減らす設定では消える
 * （`tokens.css` の `prefers-reduced-motion`）
 */
.edge,
.via-dot,
.node {
  transition: opacity var(--duration-emphasis) ease;
}

/* 退いた線。消さずに、そこに在ることは読める濃さに留める */
.edge.dimmed,
.edge.dimmed.via,
.edge.dimmed.implements,
.edge.dimmed.cyclic,
.edge.dimmed.via.cyclic,
.edge.dimmed.implements.cyclic,
.via-dot.dimmed {
  opacity: var(--edge-opacity-dimmed);
}

/*
 * 線の当たり判定。見えないが、線の上でだけカーソルを受ける。
 * 線を押しても何も起きないので、指の形にはしない。
 */
.edge-hit {
  fill: none;
  stroke: transparent;
  stroke-width: var(--edge-stroke-hit);
  pointer-events: stroke;
}

/* ノード。塗りは層の色を混ぜ、状態は枠線だけで表す（参照仕様） */
/*
 * キーボードの焦点（UT-21）。ブラウザ既定の輪郭は SVG の図形に合わないので消し、
 * ノードの外側に離した枠で示す。**キーボードで当てたときだけ**（`:focus-visible`）。
 * 押して焦点が入っただけで枠が出ると、選択の枠と二重に見える
 */
.node:focus {
  outline: none;
}

/*
 * ポインタは受けない。線を transparent にしただけでは当たり判定に入り、ノードの
 * 押せる範囲・ホバーの範囲が外側へ広がって、線の端や隙間を食う
 */
.node .focus-ring {
  fill: none;
  stroke: transparent;
  stroke-width: var(--node-stroke-focus);
  pointer-events: none;
}

.node:focus-visible .focus-ring {
  stroke: var(--color-accent);
}

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
/*
 * カーソルを合わせたノードに繋がっているノード（UT-25）。
 *
 * **循環と選択より弱くする**（参照仕様の順）。強調は触れているあいだだけの
 * 見分けで、循環（事実）と選択（操作の状態）を上書きしてはいけない。
 */
.node.related .box {
  stroke: var(--color-accent);
  stroke-width: var(--node-stroke-related);
}

.node.in-cycle .box,
.node.in-cycle.related .box {
  stroke: var(--color-warn);
  stroke-width: var(--node-stroke-cyclic);
  stroke-dasharray: var(--node-dash-cyclic);
}

.node.selected .box,
.node.selected.in-cycle .box,
.node.selected.related .box,
.node.selected.in-cycle.related .box {
  stroke: var(--color-accent);
  stroke-width: var(--node-stroke-selected);
}

/* 退いたノード。消さずに、そこに在ることは読める濃さに留める */
.node.dimmed {
  opacity: var(--node-opacity-dimmed);
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

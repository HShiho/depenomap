<script setup lang="ts">
/**
 * ファイルとメソッドの一覧（UT-12 / US-09）。
 *
 * ファイルをアコーディオンにし、**初期表示はすべて閉じている**。最初から全
 * メソッドが並ぶと、規模の大きいアプリケーションでは一覧が読めなくなる。
 *
 * **依存元／依存先の一覧はここに作らない**（N-4）。ノードマップを見れば分かる。
 *
 * 行に出す印は `file-badges` / `method-badges` で外から渡す。循環（UT-10）と
 * 検索の一致（UT-11）が、**行の作りにも一覧の作りにも触らずに**差し込める。
 *
 * 検索語（UT-11）でも絞る。**絞り込みであって判定ではない** — 一致しなかった
 * ノードを欠陥として扱わない（N-1）。ノードマップ側は絞らない（UT-11 の決定）。
 * 図の絞り込みは選択が持つ（UT-14 / US-12）ので、根拠を 2 つに分けない。
 *
 * **表示粒度（US-03）とは連動させない**（UT-12 の決定）。粒度はノードマップの
 * 見え方で、一覧は常にファイルとその中のメソッドを見せる。連動させると、
 * ファイル粒度のときにメソッドへ辿り着く道が画面から消える。
 *
 * 行の選択は器（UT-05）の `select` へ渡す。選んだノードが今の粒度に無ければ
 * 粒度のほうが合う、という規則もそこが持つ。移動や絞り込みを伴う経路は
 * UT-14 が載せるので、ここでは**選ぶところまで**にする。
 */
import { computed, ref, watch } from 'vue'

import { useViewState } from '../shell/view-state'
import FileRow from './FileRow.vue'
import MatchBadge from './MatchBadge.vue'
import MethodRow from './MethodRow.vue'
import { buildSidebarList, filterSidebarList, type SidebarSort } from './sidebar-list'

const props = defineProps<{ sort: SidebarSort }>()

/** 面が件数を出せるように、絞った結果の数を伝える */
const emit = defineEmits<{ shown: [count: number] }>()

const state = useViewState()

/** 手で開いたファイルの ID。**初期は空**（US-09） */
const openedByHand = ref<ReadonlySet<string>>(new Set())

/**
 * 実際に開いているファイル。**手で開いたもの + 選択中のメソッドの所属 +
 * 検索に当たったメソッドの所属**。
 *
 * 選択への追従を「選択が変わったら開く」という出来事で書くと、同じノードを
 * 選び直したときに取りこぼす（`selectedNodeId` が動かないため）。手で閉じた
 * あと同じメソッドをもう一度選ぶと、閉じたまま選択だけ進む。
 * **状態として導く**と、その経路が無くなる。
 */
const opened = computed(() => new Set([...openedByHand.value, ...pinned.value.keys()]))

/**
 * 閉じられないファイルと、その理由。
 *
 * どちらも**中のメソッドが見えていること自体に意味がある**行なので、閉じると
 * 行が意味を失う。選択のほうは所属が畳み込まれて残るが、検索のほうは**残さ
 * ない** — 検索で開いたのだから、検索語を消せば閉じてほしい。
 */
const pinned = computed(() => {
  const reasons = new Map<string, 'selected' | 'matched'>()
  for (const file of matchedByMethod.value) reasons.set(file, 'matched')

  const parent = selectedMethodParent.value
  if (parent !== undefined) reasons.set(parent, 'selected')
  return reasons
})

/**
 * 自身ではなく、中のメソッドが検索に当たって残ったファイル。
 *
 * **絞っていないときは空**。絞っていない一覧では全ファイルが「自身は当たって
 * いない」形になり、そのまま数えると全部が開いてしまう。
 */
const matchedByMethod = computed(() =>
  state.query.trim() === ''
    ? []
    : list.value
        .filter((file) => file.match === undefined && file.methods.length > 0)
        .map((file) => file.node.id),
)

/**
 * 選択中のノードがメソッドなら、その所属ファイル。
 *
 * キャンバスで選んだメソッドが閉じたファイルの中にあると、一覧には何も現れず、
 * どこが選ばれているのかが面から読めない。
 *
 * **開くところまで**にする。その行が見える位置まで一覧をスクロールさせるのは
 * 「移動」であり、UT-14 が持つ単一の移動経路とぶつかる。
 */
const selectedMethodParent = computed(() => {
  const nodeId = state.selectedNodeId
  if (nodeId === undefined) return undefined
  const node = state.viewModel?.nodeById.get(nodeId)
  return node?.kind === 'method' ? node.parent : undefined
})

const list = computed(() => {
  const viewModel = state.viewModel
  if (viewModel === undefined) return []

  // 絞るのは並べたあと。並べ替えの規則は検索語で変わらない
  return filterSidebarList(buildSidebarList(viewModel, props.sort), viewModel, state.query)
})

watch(list, (value) => emit('shown', value.length), { immediate: true })

/*
 * 選択で開いたファイルは、**開いたことを手の側の記録に畳み込む**。
 *
 * 導出だけにしておくと、選択が外れた瞬間に利用者の操作なしで畳まれる。
 * 所属ファイルの行を選ぶ・背景を押して選択を外す・別ファイルのメソッドへ移る、
 * のいずれでも起きるため、一覧が選択のたびに開閉して行の位置が動く。
 *
 * 畳み込む先が**導出値の変化**なので、同じノードの選び直しを取りこぼす経路は
 * 戻らない（選び直しでは所属も変わらず、既に開いている）。
 */
/*
 * `immediate` にするのは、**選択が済んだあとに一覧が現れる**経路のため。
 * 変化だけを見ると、そのときの所属が記録に入らず、選択が外れた瞬間に畳まれる。
 * 選択が無ければ何もしないので、初期マウントで余計なことは起きない。
 */
watch(
  selectedMethodParent,
  (parent) => {
    if (parent === undefined) return
    openedByHand.value = new Set([...openedByHand.value, parent])
  },
  { immediate: true },
)

/*
 * 図が入れ替わったら、開閉を捨てる。
 *
 * ファイルの ID はパス由来なので、読み直した先に同じパスがあると開いたまま
 * 引き継がれ、「初期表示はすべて閉じている」（US-09）が破れる。器のほうも
 * 選択・履歴・絞り込みを同時に落としている（`applyLoadOutcome`）。
 */
watch(
  () => state.viewModel,
  () => {
    openedByHand.value = new Set()
  },
)

function toggle(id: string): void {
  /*
   * 中のメソッドが見えていることに意味がある行は閉じない。**不変条件はここに置く** —
   * 行側のガードだけに頼ると、行ボタン以外から呼ばれた経路（キーボード、
   * 一括開閉、行を別の場所で使う）で記録から静かに外れ、見た目は開いたまま
   * 選択が外れた瞬間に畳まれる。
   */
  if (pinned.value.has(id)) return

  const next = new Set(openedByHand.value)
  if (!next.delete(id)) next.add(id)
  openedByHand.value = next
}
</script>

<template>
  <div class="px-6 pt-5 pb-24">
    <!--
      当たらなかったことを、そのまま伝える。**欠陥として扱わない**（N-1）ので、
      直し方の示唆や警告の見た目にはしない
    -->
    <p v-if="list.length === 0 && state.query.trim() !== ''" class="px-8 py-24 text-center">
      <span class="block text-ui text-ink-2">該当なし</span>
      <span class="mt-4 block text-caption text-ink-3">
        「{{ state.query }}」に一致するファイル・メソッドはありません
      </span>
    </p>
    <div v-for="file in list" :key="file.node.id" class="mb-1">
      <FileRow
        :node="file.node"
        :fan-in="file.fanIn"
        :open="opened.has(file.node.id)"
        :pinned="pinned.get(file.node.id)"
        :selected="state.selectedNodeId === file.node.id"
        :colour="file.colour"
        @toggle="toggle(file.node.id)"
        @select="state.select(file.node.id)"
      >
        <template #badges>
          <MatchBadge v-if="file.match === 'path'" />
          <slot name="file-badges" :node="file.node" />
        </template>
      </FileRow>

      <div v-if="opened.has(file.node.id)" class="pt-1 pb-5 pl-24">
        <MethodRow
          v-for="method in file.methods"
          :key="method.node.id"
          :node="method.node"
          :fan-in="method.fanIn"
          :selected="state.selectedNodeId === method.node.id"
          @select="state.select(method.node.id)"
        >
          <template #badges>
            <MatchBadge v-if="method.match === 'path'" />
            <slot name="method-badges" :node="method.node" />
          </template>
        </MethodRow>

        <p v-if="file.methods.length === 0" class="px-8 py-3 text-caption text-ink-3">
          メソッドなし
        </p>
      </div>
    </div>
  </div>
</template>

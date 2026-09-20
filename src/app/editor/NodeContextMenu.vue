<script setup lang="ts">
/**
 * ノードの右クリックメニュー（UT-18 / US-19）。
 *
 * 項目は「VSCode で開く」の 1 つだけ（UT-18 の決定）。**ブラウザの既定の
 * メニューを止める以上、代わりを必ず出す** — 止めたまま何も出さないと、
 * 右クリックが死んだようにしか見えない。
 *
 * **開けないときも項目は出す。** 出さないと「この画面には開く機能が無い」と
 * 読めてしまう。押せない状態にして、何が足りないかをその場に書く（N-1。
 * 足りないことは欠陥ではない）。
 *
 * 閉じる口は 3 つ（Esc・外側を押す・図を動かす）。**図を動かしたら閉じる** —
 * メニューは押した瞬間の 1 点に出るので、下の図が動くと別のノードを指す。
 */
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'

import { menuPositionOf, type Point } from './menu-position'
import type { OpenAction } from './open-action'

const props = defineProps<{
  /** 押された場所（ビューポート座標） */
  at: Point
  /** どのノードのメニューか。名前とパスを出す */
  title: string
  subtitle?: string
  /** 開けるか、開けないなら何が足りないか */
  action: OpenAction
}>()

const emit = defineEmits<{ open: []; close: [] }>()

const menu = useTemplateRef<HTMLElement>('menu')

/**
 * 出す位置。**自分の大きさを測ってから決める。**
 *
 * 測れるのはマウント後なので、初回は押した場所そのままで出し、測れた時点で
 * 収まる位置へ直す。測れないまま（大きさ 0）でも破綻しない。
 */
const size = ref({ width: 0, height: 0 })

const position = computed(() =>
  menuPositionOf(props.at, size.value, {
    width: window.innerWidth,
    height: window.innerHeight,
  }),
)

const openable = computed(() => props.action.kind === 'ready')

/** 押せない理由。押せるときは出さない */
const reason = computed(() => (props.action.kind === 'blocked' ? props.action.reason : undefined))

/*
 * 外側を押す・図を動かす、で閉じる。
 *
 * **押し下げ（`pointerdown`）で見る。** クリックの完了まで待つと、図の上で
 * 押し下げたときにドラッグ（UT-17）が始まってしまい、メニューが出たまま
 * ノードが動く。`capture` で受けるのは、下にある図が先に止めても閉じるため。
 */
function onPointerDownOutside(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Node && menu.value?.contains(target)) return
  emit('close')
}

function onWheel(): void {
  emit('close')
}

onMounted(() => {
  const element = menu.value
  if (element) {
    size.value = { width: element.offsetWidth, height: element.offsetHeight }
    /*
     * 焦点を引き取る。右クリックでは焦点が動かないので、引き取らないと
     * Esc もキーボードでの選択も届かない（押した先は SVG の図で、
     * 焦点を受け取れない）
     */
    element.focus()
  }

  window.addEventListener('pointerdown', onPointerDownOutside, true)
  window.addEventListener('wheel', onWheel, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onPointerDownOutside, true)
  window.removeEventListener('wheel', onWheel, true)
})
</script>

<template>
  <div
    ref="menu"
    class="fixed z-20 flex w-264 flex-col rounded-panel border border-line bg-surface py-4 shadow-float focus:outline-none"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    role="menu"
    tabindex="-1"
    :aria-label="`${title} の操作`"
    @keydown.esc.stop="emit('close')"
  >
    <!-- どのノードのメニューかを出す。図の上では押した先がすぐ隠れる -->
    <header class="min-w-0 border-b border-line-2 px-11 py-6">
      <p class="truncate text-meta text-ink" :title="title">{{ title }}</p>
      <p v-if="subtitle" class="truncate font-mono text-caption text-ink-3" :title="subtitle">
        {{ subtitle }}
      </p>
    </header>

    <button
      type="button"
      role="menuitem"
      class="px-11 py-7 text-left text-ui text-ink-2 hover:bg-surface-2 hover:text-ink disabled:cursor-default disabled:text-line disabled:hover:bg-transparent"
      :disabled="!openable"
      @click="emit('open')"
    >
      VSCode で開く
    </button>

    <!--
      押せない理由。**押す前に読める場所へ出す**（UT-18 の決定）。
      押してから知らせると、押した操作が効いたのかどうかが分からない
    -->
    <p v-if="reason !== undefined" class="px-11 pb-6 text-caption break-words text-ink-3">
      {{ reason }}
    </p>

    <p v-else-if="action.kind === 'asking'" class="px-11 pb-6 text-caption text-ink-3">
      位置を確認中…
    </p>
  </div>
</template>

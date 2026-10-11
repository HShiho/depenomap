<script setup lang="ts">
/**
 * 図の見え方の切り替えをまとめる「表示」メニュー（UT-31）。
 *
 * 経由の行き先（UT-30）、interface を畳む（UT-29）、合成ルートを隠す（UT-31）の
 * 3 つを入れる。ツールバーに並べ続けると、効かない理由の文言と合わせて横幅が
 * 画面を超え、下端の帯で凡例（UT-26）の列を潰していた。粒度・並べ方のように
 * 図の骨格を決める切り替えはツールバーに残し、**図の一部の描き方を変えるもの**
 * をここへ寄せる。
 *
 * **閉じたままでも、既定と違う見え方になっていることは口から読める。** 隠す・
 * 畳む・実装宛のどれかが効いているとき、口に印を出す。何が効いているかは
 * 開けば読める。合成ルートの非表示は、いまの図に該当が無くても左上の断りが
 * 常に言う（ADR-006 決定 4）。
 *
 * 中の切り替えを押しても閉じない。続けて切り替えられるようにする。閉じる口は
 * 口の再押下・Esc・外側を押す、の 3 つ。
 *
 * パネルは `v-show` で出し入れする。中の切り替えは閉じていても器（UT-05）を
 * 読んだまま保たれ、開くたびに作り直さない。
 */
import { computed, onBeforeUnmount, ref, useId, useTemplateRef, watch } from 'vue'

import { useViewState } from '../shell/view-state'
import CompositionRootToggle from './CompositionRootToggle.vue'
import InterfaceFoldToggle from './InterfaceFoldToggle.vue'
import ViaReadingToggle from './ViaReadingToggle.vue'

const state = useViewState()

const open = ref(false)
const panelId = useId()
const root = useTemplateRef<HTMLElement>('root')
const button = useTemplateRef<HTMLButtonElement>('button')

/**
 * 既定と違う見え方が**いま効いているか**。覚えた好みが立っていても、効かない
 * 場面（ファイル粒度での畳み、層が指定されていないときの非表示）では印を出さない。
 */
const changed = computed(() => {
  const method = state.granularity === 'method'
  const reading = method && state.viaReading === 'implementation'
  const folded = reading && state.interfacesFolded
  const hidden = state.compositionRootHidden && state.compositionRoot.kind === 'present'
  return reading || folded || hidden
})

function close(options: { returnFocus?: boolean } = {}): void {
  open.value = false
  if (options.returnFocus === true) button.value?.focus()
}

/**
 * Esc で閉じる。**開いているときは下へ渡さない** — 重なっている面から順に
 * 閉じるのが Esc の筋で、下の絞り込み（UT-14）を一緒に解くと、閉じたあとに
 * 図が変わっている。窓の捕捉段で受けるので、焦点がどこにあっても先に届く。
 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.stopPropagation()
  close({ returnFocus: true })
}

/** 外側を押したら閉じる。押し下げで見る（右クリックメニューと同じ） */
function onPointerDownOutside(event: PointerEvent): void {
  const target = event.target
  if (target instanceof Node && root.value?.contains(target)) return
  close()
}

function listen(): void {
  window.addEventListener('keydown', onKeydown, true)
  window.addEventListener('pointerdown', onPointerDownOutside, true)
}

function unlisten(): void {
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('pointerdown', onPointerDownOutside, true)
}

// 開いているあいだだけ聞く。閉じているときの Esc は下（絞り込み）のもの
watch(open, (isOpen) => (isOpen ? listen() : unlisten()))
onBeforeUnmount(unlisten)
</script>

<template>
  <div ref="root" class="relative flex shrink-0">
    <button
      ref="button"
      type="button"
      class="flex items-center gap-5 rounded-control px-8 py-5 text-ui text-ink-2 hover:bg-surface-2 hover:text-ink"
      aria-haspopup="true"
      :aria-expanded="open"
      :aria-controls="panelId"
      :aria-label="changed ? '表示（既定から変更あり）' : undefined"
      @click="open = !open"
    >
      表示
      <!-- 既定と違う見え方が効いている印。閉じたままでも読めるように -->
      <span
        v-if="changed"
        data-display-changed
        class="size-6 rounded-round bg-accent"
        aria-hidden="true"
      ></span>
      <span class="text-caption text-ink-3" aria-hidden="true">▾</span>
    </button>

    <!--
      ツールバーは下端にあるので、上へ開く。

      **口の右端に揃えて左へ伸ばす。** 口はツールバーの右寄りにあり、左端から
      右へ伸ばすと、幅の狭い画面でキャンバスの右端を越えて切れる。幅は一覧の
      パネルと同じ上限に抑え、効かない理由は折り返す
    -->
    <div
      v-show="open"
      :id="panelId"
      data-display-panel
      role="group"
      aria-label="表示"
      class="absolute right-0 bottom-full mb-8 flex w-max max-w-[var(--panel-width)] flex-col divide-y divide-line-2 rounded-panel border border-line bg-surface px-11 py-3 shadow-float"
    >
      <!--
        切り替えごとに区切る。効かない理由は各切り替えの真下に詰めて置くので、
        切り替え同士の間はそれより広く取り、線で分ける（どの理由がどの切り替えに
        掛かるのかを、間隔の差で読めるようにする）
      -->
      <div class="py-8"><ViaReadingToggle /></div>
      <div class="py-8"><InterfaceFoldToggle /></div>
      <!-- 層が指定されていなければ口そのものが無い。空の区切りを残さない -->
      <div v-if="state.compositionRoot.kind === 'present'" class="py-8">
        <CompositionRootToggle />
      </div>
    </div>
  </div>
</template>

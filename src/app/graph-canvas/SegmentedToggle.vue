<script setup lang="ts" generic="T extends string">
/**
 * 見え方の切り替え（UT-07 / UT-08）。
 *
 * 粒度（US-03）と並べ方（US-04）で同じ形の切り替えを使う。値の出どころと
 * 書き込み先は使う側が渡し、ここは見た目と読み上げの規則だけを持つ。
 *
 * 置き場所はキャンバス下部のツールバー。見え方の切り替えはすべてここへ集める
 * （参照仕様）。**枠や影といった筐体はここに持たない** — 持つと、切り替えが
 * 増えるたびに浮動パネルが積み重なる。
 */
import { useId } from 'vue'

defineProps<{
  /** 何の切り替えかを表す短い語 */
  label: string
  options: readonly { value: T; label: string }[]
  modelValue: T
  /**
   * いま効かない切り替えか（UT-30）。**口は残して押せなくする** — 消すと、
   * 機能が無いのか、いまは効かないだけなのかが読み手に分からない
   */
  disabled?: boolean
  /**
   * 効かないときの理由。**画面に出して、項目と結び付ける**。
   *
   * `title` 属性だけだと、読み上げには届かず、押せない項目には焦点も
   * 当たらない。理由がポインタの利用者にしか届かない形にしない。
   */
  note?: string
}>()

defineEmits<{ 'update:modelValue': [value: T] }>()

// 同じ切り替えを 2 か所に置いても id が衝突しないようにする
const labelId = useId()
const noteId = useId()
</script>

<template>
  <div class="flex items-center gap-9">
    <span :id="labelId" class="text-label text-ink-3 uppercase">{{ label }}</span>

    <!--
      選択中は `aria-pressed` で示す。見た目だけで表すと、読み上げでどちらが
      効いているのか分からない（参照仕様の拡張ルール）
    -->
    <!--
      群に名前を与える。`aria-pressed` だけだと「ファイル、押されていません」と
      しか読まれず、何の切り替えなのかが分からない
    -->
    <div
      role="group"
      :aria-labelledby="labelId"
      class="flex rounded-control border border-line p-1"
      :aria-describedby="disabled === true && note !== undefined ? noteId : undefined"
    >
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="rounded-inner px-9 py-4 text-ui disabled:cursor-default disabled:text-line disabled:hover:bg-transparent"
        :class="
          modelValue === option.value
            ? 'bg-accent-soft font-semibold text-ink'
            : 'text-ink-2 hover:bg-surface-2'
        "
        :disabled="disabled"
        :aria-pressed="modelValue === option.value"
        @click="$emit('update:modelValue', option.value)"
      >
        {{ option.label }}
      </button>
    </div>

    <!-- 効かない理由。見えるところに出し、項目と結び付ける -->
    <span
      v-if="disabled === true && note !== undefined"
      :id="noteId"
      class="text-caption text-ink-3"
    >
      {{ note }}
    </span>
  </div>
</template>

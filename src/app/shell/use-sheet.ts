/**
 * 画面全体に重なるシートの開閉（UT-13 で 1 つ目、UT-19 で 2 つ目）。
 *
 * 重なりを出すときに要る取り決めが 4 つある。どれか 1 つでも欠けると、
 * 出ているあいだに画面が触れなくなる・閉じたあと焦点がどこにも無い、といった
 * 形で壊れる。UT-13 の 3 ラウンドで 1 つずつ出たので、2 つ目からは寄せて使う。
 *
 *   1. **「出ているか」と「開いているか」を 1 つの式にする。** 表示条件だけで
 *      隠すと状態が立ったまま残り、条件が戻った瞬間に独りでに出る
 *   2. **読めなくなったら閉じる。** 隠れているあいだは閉じる操作も効かない
 *   3. **焦点を返す先は、状態を倒す前に捕まえる。** 裏を `inert` にしたあとの
 *      `document.activeElement` は、ブラウザが焦点を外したあとの値になりうる
 *   4. **返すのは裏の `inert` が外れたあと。** 外れる前は焦点を受け取れない
 *
 * **出せるのは 1 枚だけ。** どれが出ているかを 1 つの値で持つので、重ねて出す
 * 経路がそもそも作れない（重ねると、裏のシートが触れないまま残る）。
 */

import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from 'vue'

export interface Sheets<Name extends string> {
  /** いま出ているシート。どれも出ていなければ `undefined` */
  shown: ComputedRef<Name | undefined>
  /** 押した口から開く。閉じたときの焦点の戻り先をここで覚える */
  open: (name: Name, event: MouseEvent) => void
  /** 閉じて、開いた口へ焦点を返す */
  close: () => void
}

/**
 * @param ready 中身を出せる状態か（読み込みが済んでいるか）
 */
export function useSheets<Name extends string>(ready: () => boolean): Sheets<Name> {
  const wanted: Ref<Name | undefined> = ref(undefined) as Ref<Name | undefined>
  const opener: Ref<HTMLElement | null> = ref(null)

  const shown = computed(() => (ready() ? wanted.value : undefined))

  function close(): void {
    wanted.value = undefined
    const button = opener.value
    opener.value = null
    void nextTick(() => button?.focus())
  }

  watch(ready, (canShow) => {
    if (!canShow) close()
  })

  return {
    shown,
    open: (name, event) => {
      opener.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
      wanted.value = name
    },
    close,
  }
}

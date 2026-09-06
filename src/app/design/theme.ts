/**
 * テーマ切り替えの口（UT-04 が公開する契約）。
 *
 * 状態は 3 つある。**「ライト」「ダーク」「OS に従う」** で、3 つ目が既定。
 * 選ばれた値は `<html data-theme>` に載せ、色そのものはトークンの
 * 入れ替えで切り替わる（`tokens.css`）。ここは属性と記憶だけを扱い、
 * 見た目の定義は持たない。
 *
 * **選択は記憶する。** 表示状態（選択中のノード、動かした位置）は揮発させる
 * 決まりだが（C-3）、それは依存グラフの見え方の話であり、テーマは
 * 閲覧環境の設定である。正本 JSON を差し替えても引き継いでよい。
 */

import { computed, readonly, ref, type Ref } from 'vue'

/** 利用者が選べる値。`system` は「OS の設定に従う」 */
export type ThemeChoice = 'light' | 'dark' | 'system'

/** 実際に適用される見た目 */
export type ResolvedTheme = 'light' | 'dark'

/** 選択の記憶先のキー。他の設定と混ざらないよう名前空間を付ける */
export const THEME_STORAGE_KEY = 'depenomap.theme'

/** `<html>` に載せる属性名。`tokens.css` の `[data-theme]` と対になる */
export const THEME_ATTRIBUTE = 'data-theme'

const CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system']

function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (CHOICES as readonly string[]).includes(value)
}

/**
 * テーマが触る外側。ブラウザの API をそのまま受けず、必要な形だけを要求する。
 *
 * 記憶と OS 設定の購読はどちらも**環境によって存在しない**（テスト、
 * プライベートウィンドウ、古いブラウザ）。省略できる形にしておき、
 * 無い場合はその機能だけが落ちて、切り替え自体は動く状態を保つ。
 */
export interface ThemeHost {
  /** `data-theme` を載せる要素。通常は `document.documentElement` */
  root: Pick<Element, 'setAttribute' | 'removeAttribute'>
  /** 選択の記憶先。省略すると記憶しない */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined
  /** OS の設定。省略するとライト扱いで固定 */
  prefersDark?:
    | {
        readonly matches: boolean
        /** 変更の購読。返り値で購読をやめる */
        subscribe(listener: (matches: boolean) => void): () => void
      }
    | undefined
}

export interface ThemeController {
  /** 利用者の選択（`system` を含む） */
  readonly choice: Readonly<Ref<ThemeChoice>>
  /** 実際に適用されている見た目 */
  readonly resolved: Readonly<Ref<ResolvedTheme>>
  /** 選び直す。`system` を選ぶと記憶を消し、OS の設定に戻す */
  select(choice: ThemeChoice): void
  /**
   * 今見えているほうの逆に切り替える。
   * `system` のときも、いま見えている見た目を反転して**明示的な選択**にする
   */
  toggle(): void
  /** OS 設定の購読をやめる */
  dispose(): void
}

/**
 * 記憶の読み書きは失敗しうる（プライベートウィンドウ、保存の禁止）。
 * テーマが読めないことでアプリが止まる理由はないので、失敗は握って既定に倒す。
 */
function readStoredChoice(storage: ThemeHost['storage']): ThemeChoice {
  if (!storage) return 'system'
  try {
    const stored = storage.getItem(THEME_STORAGE_KEY)
    return isThemeChoice(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

function writeStoredChoice(storage: ThemeHost['storage'], choice: ThemeChoice): void {
  if (!storage) return
  try {
    // `system` は「選んでいない」状態。値を残すと OS 追従かどうかが判別できなくなる
    if (choice === 'system') storage.removeItem(THEME_STORAGE_KEY)
    else storage.setItem(THEME_STORAGE_KEY, choice)
  } catch {
    // 記憶できないだけで、この画面を開いている間の切り替えは効く
  }
}

/**
 * 選択と OS 設定から、実際に適用する見た目とコントローラを組み立てる。
 *
 * 属性は `select` のたびに書き、`system` のときは**外す**。属性が無いことが
 * 「OS に従う」を表し、`tokens.css` の `:root:not([data-theme='light'])` が効く。
 */
export function createThemeController(host: ThemeHost): ThemeController {
  const choice = ref<ThemeChoice>(readStoredChoice(host.storage))
  const systemPrefersDark = ref(host.prefersDark?.matches ?? false)

  const resolved = computed<ResolvedTheme>(() => {
    if (choice.value !== 'system') return choice.value
    return systemPrefersDark.value ? 'dark' : 'light'
  })

  function applyAttribute(next: ThemeChoice): void {
    if (next === 'system') host.root.removeAttribute(THEME_ATTRIBUTE)
    else host.root.setAttribute(THEME_ATTRIBUTE, next)
  }

  applyAttribute(choice.value)

  const unsubscribe = host.prefersDark?.subscribe((matches) => {
    systemPrefersDark.value = matches
  })

  function select(next: ThemeChoice): void {
    choice.value = next
    applyAttribute(next)
    writeStoredChoice(host.storage, next)
  }

  return {
    choice: readonly(choice),
    resolved: readonly(resolved) as Readonly<Ref<ResolvedTheme>>,
    select,
    toggle: () => select(resolved.value === 'dark' ? 'light' : 'dark'),
    dispose: () => unsubscribe?.(),
  }
}

/**
 * ブラウザの API から `ThemeHost` を組み立てる。
 *
 * `document` も `matchMedia` も無い環境（テスト、SSR）では、その部分だけを
 * 落とした host を返す。呼び出し側が環境を気にしなくてよいようにする。
 */
export function createBrowserThemeHost(): ThemeHost {
  const media =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : undefined

  let storage: ThemeHost['storage']
  try {
    storage = typeof localStorage !== 'undefined' ? localStorage : undefined
  } catch {
    // 保存が禁止されている環境では localStorage への参照自体が投げる
    storage = undefined
  }

  return {
    root: document.documentElement,
    storage,
    prefersDark: media && {
      get matches() {
        return media.matches
      },
      subscribe(listener) {
        const handle = (event: MediaQueryListEvent) => listener(event.matches)
        media.addEventListener('change', handle)
        return () => media.removeEventListener('change', handle)
      },
    },
  }
}

let controller: ThemeController | undefined

/**
 * 画面から使う口。テーマは画面に 1 つなので、コントローラも 1 つに保つ。
 * 状態の器（UT-05）はこれをそのまま包める。
 */
export function useTheme(): ThemeController {
  controller ??= createThemeController(createBrowserThemeHost())
  return controller
}

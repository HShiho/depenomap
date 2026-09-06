import { describe, expect, it, vi } from 'vitest'

import { THEME_BOOTSTRAP_SOURCE } from './theme-keys'
import {
  createBrowserThemeHost,
  createThemeController,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  useTheme,
  type ThemeHost,
} from './theme'

/** `data-theme` の付け外しを記録するだけの要素 */
function fakeRoot() {
  const attributes = new Map<string, string>()
  return {
    setAttribute: (name: string, value: string) => void attributes.set(name, value),
    removeAttribute: (name: string) => void attributes.delete(name),
    theme: () => attributes.get(THEME_ATTRIBUTE),
  }
}

function fakeStorage(initial?: string) {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set(THEME_STORAGE_KEY, initial)
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    stored: () => values.get(THEME_STORAGE_KEY),
  }
}

/** OS の設定。`change()` で切り替えを起こす */
function fakeMedia(matches: boolean) {
  const listeners = new Set<(matches: boolean) => void>()
  let current = matches
  return {
    get matches() {
      return current
    },
    subscribe(listener: (matches: boolean) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    change(next: boolean) {
      current = next
      for (const listener of listeners) listener(next)
    },
    listenerCount: () => listeners.size,
  }
}

function setup(options: { stored?: string; systemDark?: boolean } = {}) {
  const root = fakeRoot()
  const storage = fakeStorage(options.stored)
  const prefersDark = fakeMedia(options.systemDark ?? false)
  const host: ThemeHost = { root, storage, prefersDark }
  return { root, storage, prefersDark, controller: createThemeController(host) }
}

describe('初期状態', () => {
  it('記憶が無ければ OS の設定に従う', () => {
    const { controller, root } = setup({ systemDark: true })

    expect(controller.choice.value).toBe('system')
    expect(controller.resolved.value).toBe('dark')
    // 属性が無いことが「OS に従う」を表す
    expect(root.theme()).toBeUndefined()
  })

  it('記憶があればそれを OS の設定より優先する', () => {
    const { controller, root } = setup({ stored: 'light', systemDark: true })

    expect(controller.choice.value).toBe('light')
    expect(controller.resolved.value).toBe('light')
    expect(root.theme()).toBe('light')
  })

  it('壊れた記憶は既定に倒す', () => {
    const { controller } = setup({ stored: 'ダークっぽいやつ' })

    expect(controller.choice.value).toBe('system')
  })
})

describe('選び直す', () => {
  it('選んだ値を属性と記憶の両方に反映する', () => {
    const { controller, root, storage } = setup()

    controller.select('dark')

    expect(controller.resolved.value).toBe('dark')
    expect(root.theme()).toBe('dark')
    expect(storage.stored()).toBe('dark')
  })

  it('system を選ぶと属性を外し、記憶も消す', () => {
    const { controller, root, storage } = setup({ stored: 'dark', systemDark: false })

    controller.select('system')

    expect(controller.resolved.value).toBe('light')
    expect(root.theme()).toBeUndefined()
    expect(storage.stored()).toBeUndefined()
  })
})

describe('反転', () => {
  it('明示的な選択を反転する', () => {
    const { controller } = setup({ stored: 'dark' })

    controller.toggle()

    expect(controller.choice.value).toBe('light')
  })

  it('OS に従っている状態からは、いま見えている見た目を反転して固定する', () => {
    const { controller, root } = setup({ systemDark: true })

    controller.toggle()

    expect(controller.choice.value).toBe('light')
    expect(root.theme()).toBe('light')
  })
})

describe('OS の設定の変更', () => {
  it('従っている間は追いかける', () => {
    const { controller, prefersDark } = setup({ systemDark: false })

    prefersDark.change(true)

    expect(controller.resolved.value).toBe('dark')
  })

  it('明示的に選んでいる間は動かさない', () => {
    const { controller, prefersDark } = setup({ stored: 'light' })

    prefersDark.change(true)

    expect(controller.resolved.value).toBe('light')
  })

  it('dispose で購読をやめる', () => {
    const { controller, prefersDark } = setup()

    expect(prefersDark.listenerCount()).toBe(1)
    controller.dispose()

    expect(prefersDark.listenerCount()).toBe(0)
  })
})

describe('記憶が使えない環境', () => {
  it('記憶先が無くても切り替えは効く', () => {
    const root = fakeRoot()
    const controller = createThemeController({ root })

    controller.select('dark')

    expect(controller.resolved.value).toBe('dark')
    expect(root.theme()).toBe('dark')
  })

  it('記憶の読み書きが投げても既定に倒して続ける', () => {
    const root = fakeRoot()
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('SecurityError')
      }),
      setItem: vi.fn(() => {
        throw new Error('SecurityError')
      }),
      removeItem: vi.fn(),
    }

    const controller = createThemeController({ root, storage })
    expect(controller.choice.value).toBe('system')

    controller.select('dark')

    expect(controller.resolved.value).toBe('dark')
    expect(root.theme()).toBe('dark')
  })

  it('OS の設定を読めない環境ではライトから始める', () => {
    const controller = createThemeController({ root: fakeRoot() })

    expect(controller.resolved.value).toBe('light')
  })
})

describe('最初の描画より前に走るスクリプト', () => {
  /** `<head>` に差し込む本体を、記憶と要素のフェイクの上で実行する */
  function runBootstrap(stored: string | null) {
    const root = fakeRoot()
    const localStorage = { getItem: () => stored }
    const document = { documentElement: root }
    new Function('localStorage', 'document', THEME_BOOTSTRAP_SOURCE)(localStorage, document)
    return root
  }

  it('記憶した選択を属性に載せる', () => {
    expect(runBootstrap('dark').theme()).toBe('dark')
    expect(runBootstrap('light').theme()).toBe('light')
  })

  it('記憶が無ければ何もしない。属性が無いことが「OS に従う」', () => {
    expect(runBootstrap(null).theme()).toBeUndefined()
  })

  it('system や壊れた値は載せない', () => {
    expect(runBootstrap('system').theme()).toBeUndefined()
    expect(runBootstrap('ダーク').theme()).toBeUndefined()
  })

  it('記憶を読めなくても投げない', () => {
    const root = fakeRoot()
    const localStorage = {
      getItem: () => {
        throw new Error('SecurityError')
      },
    }

    expect(() =>
      new Function('localStorage', 'document', THEME_BOOTSTRAP_SOURCE)(localStorage, {
        documentElement: root,
      }),
    ).not.toThrow()
  })

  it('画面側と同じキー・属性名を使う', () => {
    expect(THEME_BOOTSTRAP_SOURCE).toContain(THEME_STORAGE_KEY)
    expect(THEME_BOOTSTRAP_SOURCE).toContain(THEME_ATTRIBUTE)
  })
})

describe('ブラウザの API が無い環境', () => {
  it('document が無くても host を組み立てられる', () => {
    // vitest の既定環境（node）には document も matchMedia も無い
    const controller = createThemeController(createBrowserThemeHost())

    expect(controller.choice.value).toBe('system')
    expect(controller.resolved.value).toBe('light')
    expect(() => controller.select('dark')).not.toThrow()
  })
})

describe('画面から使う口', () => {
  it('同じコントローラを返す', () => {
    expect(useTheme()).toBe(useTheme())
  })

  it('捨てたら作り直す。購読をやめたコントローラを配り続けない', () => {
    const first = useTheme()
    first.dispose()

    expect(useTheme()).not.toBe(first)
  })

  it('捨てた古いコントローラが、生きているほうを巻き添えにしない', () => {
    const first = useTheme()
    first.dispose()
    const second = useTheme()

    first.dispose()

    expect(useTheme()).toBe(second)
  })
})

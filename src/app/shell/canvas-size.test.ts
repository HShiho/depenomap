import { describe, expect, it, vi } from 'vitest'

import {
  defaultSizeObserverFactory,
  watchElementSize,
  type SizeObserverFactory,
} from './canvas-size'

/** 観測を人の手で起こせるフェイク */
function fakeObserver() {
  let notify: ((size: { width: number; height: number }) => void) | undefined
  const observed: Element[] = []
  const disconnect = vi.fn()

  const factory: SizeObserverFactory = (callback) => {
    notify = callback
    return {
      observe: (target) => void observed.push(target),
      disconnect,
    }
  }

  return {
    factory,
    observed,
    disconnect,
    resize: (width: number, height: number) => notify?.({ width, height }),
  }
}

const element = {} as Element

describe('要素の大きさの観測', () => {
  it('変わるたびに知らせる', () => {
    const observer = fakeObserver()
    const sizes: number[][] = []

    watchElementSize(element, (width, height) => void sizes.push([width, height]), observer.factory)
    observer.resize(1280, 720)
    observer.resize(980, 720)

    expect(observer.observed).toEqual([element])
    expect(sizes).toEqual([
      [1280, 720],
      [980, 720],
    ])
  })

  it('止めると観測をやめる', () => {
    const observer = fakeObserver()

    const stop = watchElementSize(element, () => {}, observer.factory)
    stop()

    expect(observer.disconnect).toHaveBeenCalledOnce()
  })

  it('観測手段が無ければ何もしない', () => {
    const onResize = vi.fn()

    const stop = watchElementSize(element, onResize, undefined)

    expect(() => stop()).not.toThrow()
    expect(onResize).not.toHaveBeenCalled()
  })
})

describe('既定の観測手段', () => {
  it('ResizeObserver が無ければ手段を作らない', () => {
    expect(typeof ResizeObserver).toBe('undefined')
    expect(defaultSizeObserverFactory()).toBeUndefined()
  })

  it('ResizeObserver があれば、最後の観測結果を渡す', () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    let notify: ((entries: unknown[]) => void) | undefined

    class FakeResizeObserver {
      constructor(callback: (entries: unknown[]) => void) {
        notify = callback
      }
      observe = observe
      disconnect = disconnect
      unobserve = vi.fn()
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)

    try {
      const sizes: number[][] = []
      const factory = defaultSizeObserverFactory()
      expect(factory).toBeDefined()

      const stop = watchElementSize(
        element,
        (width, height) => void sizes.push([width, height]),
        factory,
      )
      // まとめて届いたときは最後の 1 件が現在の大きさ
      notify?.([
        { contentRect: { width: 10, height: 20 } },
        { contentRect: { width: 30, height: 40 } },
      ])
      notify?.([])
      stop()

      expect(observe).toHaveBeenCalledWith(element)
      expect(sizes).toEqual([[30, 40]])
      expect(disconnect).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

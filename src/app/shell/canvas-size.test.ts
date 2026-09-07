import { describe, expect, it, vi } from 'vitest'

import { watchElementSize, type SizeObserverFactory } from './canvas-size'

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

  it('観測手段が無い環境では何もしない', () => {
    const onResize = vi.fn()

    const stop = watchElementSize(element, onResize, undefined)

    expect(() => stop()).not.toThrow()
    expect(onResize).not.toHaveBeenCalled()
  })
})

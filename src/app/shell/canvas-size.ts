/**
 * キャンバス領域の実寸を観測して知らせる口（UT-05）。
 *
 * 描画側（UT-06）は状態（`canvasWidth` / `canvasHeight`）を読むだけでよく、
 * 監視の仕組みを各 UT が自作しない。サイドバーの開閉でキャンバスが広がる
 * （US-08 の受け皿）ため、ウィンドウのリサイズだけでは足りない。
 */

/** `ResizeObserver` のうち、ここが必要とする分だけ */
export interface SizeObserver {
  observe(target: Element): void
  disconnect(): void
}

export type SizeObserverFactory = (
  callback: (size: { width: number; height: number }) => void,
) => SizeObserver

/**
 * 既定の観測手段。`ResizeObserver` が無い環境（テスト、古いブラウザ）では
 * `undefined` を返し、呼び出し側は観測なしで動く。
 */
export function defaultSizeObserverFactory(): SizeObserverFactory | undefined {
  if (typeof ResizeObserver === 'undefined') return undefined

  return (callback) => {
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (!entry) return
      const { width, height } = entry.contentRect
      callback({ width, height })
    })
    return observer
  }
}

/**
 * 要素の大きさを観測し、変わるたびに知らせる。返り値を呼ぶと観測をやめる。
 *
 * 観測手段が無い環境では**何もしない停止関数**を返す。テーマと同じく、
 * 副次的な機能のために画面が起動しない形にはしない。
 *
 * 観測手段は**呼び出し側が渡す**。既定値をここに置くと、テストで
 * `undefined` を渡しても既定が評価されてしまい、「観測手段が無い」経路を
 * 検査しているつもりで既定の経路を通ることになる。
 */
export function watchElementSize(
  element: Element,
  onResize: (width: number, height: number) => void,
  factory: SizeObserverFactory | undefined,
): () => void {
  if (!factory) return () => {}

  const observer = factory(({ width, height }) => onResize(width, height))
  observer.observe(element)
  return () => observer.disconnect()
}
